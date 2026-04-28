import "server-only";

import type {
  Prisma,
  WorkspaceAlertSeverity as PrismaWorkspaceAlertSeverity,
  WorkspaceAlertStatus as PrismaWorkspaceAlertStatus,
  WorkspaceAlertType as PrismaWorkspaceAlertType,
} from "@prisma/client";
import { getWorkspaceAnomalySnapshot, type FinancialAnomaly, type WorkspaceAnomalySnapshot } from "@/lib/ai/anomaly-detection";
import { prisma } from "@/lib/prisma";
import { hasPrismaDatabaseSupport } from "@/lib/prisma-schema-compat";
import type { WorkspaceAlertRecordLink } from "@/lib/workspace-alert-types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const ANOMALY_WORKSPACE_ALERT_TYPES = [
  "UNUSUAL_EXPENSE_SPIKE",
  "DUPLICATE_CHARGE",
  "REVENUE_DROP",
  "EXPENSE_CONCENTRATION",
  "CASHFLOW_STRESS",
  "TAX_RISK",
] as const satisfies readonly PrismaWorkspaceAlertType[];

const anomalyAlertStorageSupport = {
  tables: ["WorkspaceAlert", "BankTransaction"],
  columns: [
    "WorkspaceAlert.workspaceId",
    "WorkspaceAlert.type",
    "WorkspaceAlert.severity",
    "WorkspaceAlert.status",
    "WorkspaceAlert.dedupeKey",
    "WorkspaceAlert.title",
    "WorkspaceAlert.message",
    "WorkspaceAlert.sourceRecordsPayload",
    "WorkspaceAlert.metadataPayload",
    "BankTransaction.id",
    "BankTransaction.amount",
  ],
} as const;

const alertTransactionSelect = {
  id: true,
  transactionDate: true,
  description: true,
  amount: true,
  currency: true,
} satisfies Prisma.BankTransactionSelect;

type AlertTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof alertTransactionSelect;
}>;

type ResolvedStatus = {
  status: PrismaWorkspaceAlertStatus;
  snoozedUntil: Date | null;
  resolvedAt: Date | null;
  lastStatusChangedAt: Date | null;
  statusChangedByUserId: number | null;
  statusChanged: boolean;
};

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function truncate(value: string, maxLength = 52) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function normalizeRelatedTransactionIds(relatedTransactionIds: number[] | null | undefined) {
  return Array.from(
    new Set(
      (relatedTransactionIds ?? []).filter(
        (transactionId) => Number.isInteger(transactionId) && transactionId > 0
      )
    )
  ).sort((left, right) => left - right);
}

function buildAnomalyFingerprint(input: {
  workspaceId: number;
  anomaly: FinancialAnomaly;
  relatedTransactionIds: number[];
}) {
  return [
    input.workspaceId,
    input.anomaly.type,
    input.anomaly.title.trim(),
    input.relatedTransactionIds.join(","),
  ].join(":");
}

function normalizeWorkspaceAlertSeverity(
  severity: FinancialAnomaly["severity"]
): PrismaWorkspaceAlertSeverity {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "CRITICAL";
  }

  if (severity === "MEDIUM") {
    return "WARNING";
  }

  return "INFO";
}

function normalizeWorkspaceAlertStatus(
  status: PrismaWorkspaceAlertStatus | null | undefined
): PrismaWorkspaceAlertStatus {
  if (status === "RESOLVED" || status === "SNOOZED") {
    return status;
  }

  return "OPEN";
}

function normalizeWorkspaceAlertType(type: FinancialAnomaly["type"]): PrismaWorkspaceAlertType {
  if (type === "unusual_expense_spike") return "UNUSUAL_EXPENSE_SPIKE";
  if (type === "duplicate_charge_suspicion") return "DUPLICATE_CHARGE";
  if (type === "revenue_drop_signal") return "REVENUE_DROP";
  if (type === "expense_concentration_risk") return "EXPENSE_CONCENTRATION";
  if (type === "cashflow_stress_signal") return "CASHFLOW_STRESS";
  return "TAX_RISK";
}

function resolveActionHref(anomaly: FinancialAnomaly) {
  const primaryTransactionId = anomaly.relatedTransactionIds[0] ?? null;

  if (
    anomaly.type === "unusual_expense_spike" ||
    anomaly.type === "duplicate_charge_suspicion" ||
    anomaly.type === "expense_concentration_risk"
  ) {
    return primaryTransactionId
      ? `/dashboard/banking/review?transactionId=${primaryTransactionId}`
      : "/dashboard/banking/review";
  }

  if (anomaly.type === "tax_risk_signal") {
    return "/dashboard/tax-center";
  }

  return "/dashboard/reports";
}

function resolveActionLabel(anomaly: FinancialAnomaly) {
  if (
    anomaly.type === "unusual_expense_spike" ||
    anomaly.type === "duplicate_charge_suspicion" ||
    anomaly.type === "expense_concentration_risk"
  ) {
    return "Review flagged transactions";
  }

  if (anomaly.type === "tax_risk_signal") {
    return "Open tax center";
  }

  return "Open reports";
}

function buildTransactionLink(record: AlertTransactionRecord): WorkspaceAlertRecordLink {
  return {
    recordType: "BANK_TRANSACTION",
    recordId: record.id,
    href: `/dashboard/banking/review?transactionId=${record.id}`,
    label: truncate(record.description),
    secondaryLabel: `${formatDate(record.transactionDate)} · ${formatMoney(
      record.amount,
      record.currency
    )}`,
  };
}

function resolveDetectedAlertStatus(input: {
  existing:
    | {
        status: PrismaWorkspaceAlertStatus;
        snoozedUntil: Date | null;
      }
    | undefined;
  severity: PrismaWorkspaceAlertSeverity;
  now: Date;
}): ResolvedStatus {
  if (!input.existing) {
    return {
      status: "OPEN",
      snoozedUntil: null,
      resolvedAt: null,
      lastStatusChangedAt: input.now,
      statusChangedByUserId: null,
      statusChanged: true,
    };
  }

  if (
    input.existing.status === "SNOOZED" &&
    input.existing.snoozedUntil &&
    input.existing.snoozedUntil.getTime() > input.now.getTime() &&
    input.severity !== "CRITICAL"
  ) {
    return {
      status: "SNOOZED",
      snoozedUntil: input.existing.snoozedUntil,
      resolvedAt: null,
      lastStatusChangedAt: null,
      statusChangedByUserId: null,
      statusChanged: false,
    };
  }

  if (input.existing.status === "OPEN") {
    return {
      status: "OPEN",
      snoozedUntil: null,
      resolvedAt: null,
      lastStatusChangedAt: null,
      statusChangedByUserId: null,
      statusChanged: false,
    };
  }

  return {
    status: "OPEN",
    snoozedUntil: null,
    resolvedAt: null,
    lastStatusChangedAt: input.now,
    statusChangedByUserId: null,
    statusChanged: true,
  };
}

export async function syncAnomaliesToAlerts(input: {
  workspaceId: number;
  snapshot?: WorkspaceAnomalySnapshot;
}) {
  const snapshot =
    input.snapshot ??
    (await getWorkspaceAnomalySnapshot({
      workspaceId: input.workspaceId,
    }));

  if (!(await hasPrismaDatabaseSupport(anomalyAlertStorageSupport))) {
    return snapshot;
  }

  try {
    const now = new Date();
    const relatedTransactionIds = Array.from(
      new Set(
        snapshot.anomalies.flatMap((anomaly) =>
          normalizeRelatedTransactionIds(anomaly.relatedTransactionIds)
        )
      )
    );
    const relatedTransactions = relatedTransactionIds.length
      ? await prisma.bankTransaction.findMany({
          where: {
            workspaceId: input.workspaceId,
            id: {
              in: relatedTransactionIds,
            },
          },
          select: alertTransactionSelect,
        })
      : [];
    const transactionsById = new Map(
      relatedTransactions.map((transaction) => [transaction.id, transaction])
    );
    const existingAlerts = await prisma.workspaceAlert.findMany({
      where: {
        workspaceId: input.workspaceId,
        type: {
          in: [...ANOMALY_WORKSPACE_ALERT_TYPES],
        },
      },
      select: {
        id: true,
        dedupeKey: true,
        status: true,
        snoozedUntil: true,
      },
    });
    const existingByDedupeKey = new Map(
      existingAlerts.map((alert) => [alert.dedupeKey, alert])
    );
    const detectedDedupeKeys = new Set(
      snapshot.anomalies.map((anomaly) =>
        buildAnomalyFingerprint({
          workspaceId: input.workspaceId,
          anomaly,
          relatedTransactionIds: normalizeRelatedTransactionIds(anomaly.relatedTransactionIds),
        })
      )
    );

    await prisma.$transaction(async (tx) => {
      for (const anomaly of snapshot.anomalies) {
        const normalizedType = normalizeWorkspaceAlertType(anomaly.type);
        const normalizedSeverity = normalizeWorkspaceAlertSeverity(anomaly.severity);
        const normalizedRelatedTransactionIds = normalizeRelatedTransactionIds(
          anomaly.relatedTransactionIds
        );
        const dedupeKey = buildAnomalyFingerprint({
          workspaceId: input.workspaceId,
          anomaly,
          relatedTransactionIds: normalizedRelatedTransactionIds,
        });
        const existing =
          existingByDedupeKey.get(dedupeKey) ?? existingByDedupeKey.get(anomaly.dedupeKey);
        const nextStatus = resolveDetectedAlertStatus({
          existing,
          severity: normalizedSeverity,
          now,
        });
        const sourceRecords = normalizedRelatedTransactionIds
          .map((transactionId) => transactionsById.get(transactionId))
          .filter((record): record is AlertTransactionRecord => Boolean(record))
          .map((record) => buildTransactionLink(record));
        const primaryTransactionId = normalizedRelatedTransactionIds[0] ?? null;
        const primaryTransaction = primaryTransactionId
          ? transactionsById.get(primaryTransactionId)
          : null;
        const actionHref = resolveActionHref(anomaly);
        const metadataPayload = JSON.stringify({
          anomalyType: anomaly.type,
          anomalyDedupeKey: anomaly.dedupeKey,
          anomalySeverity: anomaly.severity,
          confidence: anomaly.confidence,
          relatedTransactionIds: normalizedRelatedTransactionIds,
          suggestedAction: anomaly.suggestedAction,
          period: snapshot.period,
        });

        await tx.workspaceAlert.upsert({
          where: {
            workspaceId_dedupeKey: {
              workspaceId: input.workspaceId,
              dedupeKey,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            type: normalizedType,
            severity: normalizedSeverity,
            status: normalizeWorkspaceAlertStatus(nextStatus.status),
            dedupeKey,
            title: anomaly.title,
            message: anomaly.description,
            explanation: `Confidence ${Math.round(anomaly.confidence * 100)}%. ${anomaly.suggestedAction}`,
            recommendedActionLabel: resolveActionLabel(anomaly),
            recommendedActionHref: actionHref,
            primaryRecordType: primaryTransaction ? "BANK_TRANSACTION" : "WORKSPACE",
            primaryRecordId: primaryTransaction?.id ?? null,
            primaryRecordHref: primaryTransaction
              ? `/dashboard/banking/review?transactionId=${primaryTransaction.id}`
              : actionHref,
            recordCount: sourceRecords.length,
            sourceRecordsPayload: JSON.stringify(sourceRecords),
            metadataPayload,
            firstDetectedAt: now,
            lastDetectedAt: now,
            snoozedUntil: nextStatus.snoozedUntil,
            resolvedAt: nextStatus.resolvedAt,
            lastStatusChangedAt: nextStatus.lastStatusChangedAt,
          },
          update: {
            type: normalizedType,
            severity: normalizedSeverity,
            status: normalizeWorkspaceAlertStatus(nextStatus.status),
            title: anomaly.title,
            message: anomaly.description,
            explanation: `Confidence ${Math.round(anomaly.confidence * 100)}%. ${anomaly.suggestedAction}`,
            recommendedActionLabel: resolveActionLabel(anomaly),
            recommendedActionHref: actionHref,
            primaryRecordType: primaryTransaction ? "BANK_TRANSACTION" : "WORKSPACE",
            primaryRecordId: primaryTransaction?.id ?? null,
            primaryRecordHref: primaryTransaction
              ? `/dashboard/banking/review?transactionId=${primaryTransaction.id}`
              : actionHref,
            recordCount: sourceRecords.length,
            sourceRecordsPayload: JSON.stringify(sourceRecords),
            metadataPayload,
            lastDetectedAt: now,
            snoozedUntil: nextStatus.snoozedUntil,
            resolvedAt: nextStatus.resolvedAt,
            ...(nextStatus.statusChanged
              ? {
                  lastStatusChangedAt: nextStatus.lastStatusChangedAt,
                  statusChangedByUserId: nextStatus.statusChangedByUserId,
                }
              : {}),
          },
        });
      }

      const staleAlertIds = existingAlerts
        .filter(
          (alert) =>
            !detectedDedupeKeys.has(alert.dedupeKey) &&
            (alert.status === "OPEN" || alert.status === "SNOOZED")
        )
        .map((alert) => alert.id);

      if (staleAlertIds.length > 0) {
        await tx.workspaceAlert.updateMany({
          where: {
            id: {
              in: staleAlertIds,
            },
          },
          data: {
            status: "RESOLVED",
            snoozedUntil: null,
            resolvedAt: now,
            lastStatusChangedAt: now,
            statusChangedByUserId: null,
          },
        });
      }
    });
  } catch (error) {
    console.error("[TaxBook:sync-anomalies] Failed to sync anomaly alerts", {
      workspaceId: input.workspaceId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return snapshot;
}

export function buildDefaultAnomalySnoozeUntil(now = new Date()) {
  return new Date(now.getTime() + 7 * DAY_IN_MS);
}
