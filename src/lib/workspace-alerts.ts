import "server-only";

import type {
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
  Prisma,
  TaxEvidenceStatus,
  WorkspaceAlertSeverity as PrismaWorkspaceAlertSeverity,
  WorkspaceAlertStatus as PrismaWorkspaceAlertStatus,
  WorkspaceAlertType as PrismaWorkspaceAlertType,
} from "@prisma/client";
import { logError } from "@/lib/logger";
import { getWorkspaceFilingReadiness } from "@/lib/filing-readiness";
import { OfflineSyncConflictError } from "@/lib/offline-sync-server";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import { getWorkspaceTransactionTaxSummary } from "@/lib/transaction-tax";
import {
  createWorkspaceAlertSeverityCountMap,
  createWorkspaceAlertTypeCountMap,
  type WorkspaceAlertCenterResponse,
  type WorkspaceAlertDashboardSnapshot,
  type WorkspaceAlertListItem,
  type WorkspaceAlertRecordLink,
  type WorkspaceAlertSeverity,
  type WorkspaceAlertStatus,
  type WorkspaceAlertType,
} from "@/lib/workspace-alert-types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_ALERT_THRESHOLD = 0.62;
const DUPLICATE_CRITICAL_THRESHOLD = 0.9;
const SPIKE_LOOKBACK_DAYS = 180;
const SPIKE_MIN_SAMPLE_COUNT = 3;
const SPIKE_RATIO_THRESHOLD = 2.8;
const SPIKE_CRITICAL_RATIO_THRESHOLD = 4;
const SPIKE_MIN_AMOUNT_MINOR = 1_000_000;
const SPIKE_MIN_DELTA_MINOR = 500_000;
const TAX_DUE_SOON_LOOKAHEAD_DAYS = 21;
const TAX_DUE_SOON_CRITICAL_DAYS = 7;
const DEFAULT_ALERT_LIMIT = 60;
const ALERT_SOURCE_RECORD_LIMIT = 5;
const DUPLICATE_ALERT_LIMIT = 40;
const SPIKE_ALERT_LIMIT = 12;
const OPEN_REVIEW_STATUSES: BankTransactionReviewStatus[] = [
  "IMPORTED",
  "PENDING_REVIEW",
  "FLAGGED",
];
const REVIEW_REQUIRED_POSTING_STATES: BankTransactionPostingReadiness[] = [
  "REVIEW_REQUIRED",
];
const EVIDENCE_ALERT_STATUSES: TaxEvidenceStatus[] = ["UNKNOWN", "PENDING", "MISSING"];
const DETECTED_ALERT_TYPES: PrismaWorkspaceAlertType[] = [
  "DUPLICATE_TRANSACTION",
  "UNUSUAL_SPIKE",
  "MISSING_EVIDENCE",
  "TAX_DUE_SOON",
  "UNRESOLVED_REVIEW_ITEMS",
  "FILING_BLOCKER",
];
const WORKSPACE_ALERT_SCHEMA_TABLES = [
  "WorkspaceAlert",
  "Workspace",
  "ClientBusiness",
  "BankAccount",
  "BankTransaction",
  "TaxRecord",
  "TransactionCategory",
  "LedgerTransaction",
  "TaxPeriod",
  "VATRecord",
  "WHTRecord",
  "TaxAdjustment",
  "FilingDraft",
] as const;
const WORKSPACE_ALERT_SCHEMA_COLUMNS = [
  "WorkspaceAlert.",
  "Workspace.",
  "ClientBusiness.",
  "BankAccount.",
  "BankTransaction.",
  "TaxRecord.",
  "TransactionCategory.",
  "LedgerTransaction.",
  "TaxPeriod.",
  "VATRecord.",
  "WHTRecord.",
  "TaxAdjustment.",
  "FilingDraft.",
] as const;
const WORKSPACE_ALERT_STORAGE_SUPPORT = {
  tables: ["WorkspaceAlert"],
} as const;
const WORKSPACE_ALERT_DETECTOR_SUPPORT = {
  tables: ["BankTransaction", "TaxRecord"],
  columns: [
    "BankTransaction.reviewStatus",
    "BankTransaction.postingReadiness",
    "BankTransaction.duplicateConfidence",
    "BankTransaction.duplicateReason",
    "BankTransaction.possibleDuplicateOfTransactionId",
    "BankTransaction.normalizedMerchantName",
    "BankTransaction.categoryId",
    "BankTransaction.suspiciousPatternScore",
    "BankTransaction.suspiciousPatternReason",
    "BankTransaction.vatTreatment",
    "BankTransaction.whtTreatment",
    "BankTransaction.vatRate",
    "BankTransaction.whtRate",
    "BankTransaction.vatAmountMinor",
    "BankTransaction.whtAmountMinor",
    "BankTransaction.taxTreatmentSource",
    "TaxRecord.taxEvidenceStatus",
  ],
} as const;

const workspaceAlertSelect = {
  id: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  message: true,
  explanation: true,
  recommendedActionLabel: true,
  recommendedActionHref: true,
  primaryRecordType: true,
  primaryRecordId: true,
  primaryRecordHref: true,
  recordCount: true,
  sourceRecordsPayload: true,
  metadataPayload: true,
  firstDetectedAt: true,
  lastDetectedAt: true,
  snoozedUntil: true,
  resolvedAt: true,
  lastStatusChangedAt: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.WorkspaceAlertSelect;

type WorkspaceAlertRecord = Prisma.WorkspaceAlertGetPayload<{
  select: typeof workspaceAlertSelect;
}>;

type DetectedWorkspaceAlert = {
  workspaceId: number;
  clientBusinessId: number | null;
  type: PrismaWorkspaceAlertType;
  severity: PrismaWorkspaceAlertSeverity;
  dedupeKey: string;
  title: string;
  message: string;
  explanation: string | null;
  recommendedActionLabel: string | null;
  recommendedActionHref: string | null;
  primaryRecordType: string | null;
  primaryRecordId: number | null;
  primaryRecordHref: string | null;
  recordCount: number;
  sourceRecords: WorkspaceAlertRecordLink[];
  metadata: Record<string, unknown> | null;
};

type WorkspaceAlertFilters = {
  workspaceId: number;
  query?: string | null;
  status?: WorkspaceAlertStatus | "ALL" | null;
  severity?: WorkspaceAlertSeverity | "ALL" | null;
  type?: WorkspaceAlertType | "ALL" | null;
  limit?: number | null;
  sync?: boolean;
};

function isWorkspaceAlertSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: [...WORKSPACE_ALERT_SCHEMA_TABLES],
    columns: [...WORKSPACE_ALERT_SCHEMA_COLUMNS],
  });
}

async function runWorkspaceAlertStepSafely<T>(input: {
  workspaceId: number;
  label: string;
  query: Promise<T>;
  fallback: () => T;
  support?: {
    tables?: readonly string[];
    columns?: readonly string[];
  };
}) {
  if (input.support && !(await hasPrismaDatabaseSupport(input.support))) {
    return input.fallback();
  }

  try {
    return await input.query;
  } catch (error) {
    logError(
      "workspace-alerts",
      `Workspace alert ${input.label} failed; using a safe fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );

    return input.fallback();
  }
}

function buildEmptyWorkspaceAlertCenterData(
  workspaceId: number
): WorkspaceAlertCenterResponse {
  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspaceId,
    },
    summary: {
      totalCount: 0,
      activeCount: 0,
      openCount: 0,
      snoozedCount: 0,
      resolvedCount: 0,
      criticalOpenCount: 0,
      warningOpenCount: 0,
      infoOpenCount: 0,
      byType: createWorkspaceAlertTypeCountMap(),
      bySeverity: createWorkspaceAlertSeverityCountMap(),
      overdueTaxCount: 0,
    },
    alerts: [],
  };
}

function buildEmptyDashboardWorkspaceAlertSnapshot(
  workspaceId: number
): WorkspaceAlertDashboardSnapshot {
  const center = buildEmptyWorkspaceAlertCenterData(workspaceId);

  return {
    generatedAt: center.generatedAt,
    summary: {
      openCount: 0,
      criticalCount: 0,
      snoozedCount: 0,
      resolvedCount: 0,
    },
    topAlerts: [],
  };
}

function alertStatusRank(status: WorkspaceAlertStatus) {
  if (status === "OPEN") return 0;
  if (status === "SNOOZED") return 1;
  return 2;
}

function alertSeverityRank(severity: WorkspaceAlertSeverity) {
  if (severity === "CRITICAL") return 0;
  if (severity === "WARNING") return 1;
  return 2;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDaysUntilDue(daysUntilDue: number) {
  if (daysUntilDue < 0) {
    return `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} overdue`;
  }
  if (daysUntilDue === 0) {
    return "due today";
  }
  return `due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
}

function truncate(value: string | null | undefined, maxLength = 48) {
  const normalized = value?.trim();
  if (!normalized) return "Untitled record";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function recordLink(input: WorkspaceAlertRecordLink): WorkspaceAlertRecordLink {
  return input;
}

function parseJsonString<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function serializeWorkspaceAlert(record: WorkspaceAlertRecord): WorkspaceAlertListItem {
  const sourceRecords = parseJsonString<WorkspaceAlertRecordLink[]>(record.sourceRecordsPayload) ?? [];
  const metadata = parseJsonString<Record<string, unknown>>(record.metadataPayload);

  return {
    id: record.id,
    type: record.type,
    severity: record.severity,
    status: record.status,
    title: record.title,
    message: record.message,
    explanation: record.explanation,
    recommendedActionLabel: record.recommendedActionLabel,
    recommendedActionHref: record.recommendedActionHref,
    primaryRecordType: record.primaryRecordType,
    primaryRecordId: record.primaryRecordId,
    primaryRecordHref: record.primaryRecordHref,
    recordCount: record.recordCount,
    sourceRecords,
    metadata,
    firstDetectedAt: record.firstDetectedAt.toISOString(),
    lastDetectedAt: record.lastDetectedAt.toISOString(),
    snoozedUntil: record.snoozedUntil?.toISOString() ?? null,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    lastStatusChangedAt: record.lastStatusChangedAt?.toISOString() ?? null,
    clientBusiness: record.clientBusiness
      ? {
          id: record.clientBusiness.id,
          name: record.clientBusiness.name,
        }
      : null,
  };
}

function buildWorkspaceAlertSummary(alerts: WorkspaceAlertListItem[]) {
  const byType = createWorkspaceAlertTypeCountMap();
  const bySeverity = createWorkspaceAlertSeverityCountMap();
  let openCount = 0;
  let snoozedCount = 0;
  let resolvedCount = 0;
  let criticalOpenCount = 0;
  let warningOpenCount = 0;
  let infoOpenCount = 0;
  let overdueTaxCount = 0;

  for (const alert of alerts) {
    byType[alert.type] += 1;
    bySeverity[alert.severity] += 1;

    if (alert.status === "OPEN") {
      openCount += 1;
      if (alert.severity === "CRITICAL") criticalOpenCount += 1;
      if (alert.severity === "WARNING") warningOpenCount += 1;
      if (alert.severity === "INFO") infoOpenCount += 1;
    } else if (alert.status === "SNOOZED") {
      snoozedCount += 1;
    } else {
      resolvedCount += 1;
    }

    const daysUntilDue = alert.metadata?.daysUntilDue;
    if (
      alert.type === "TAX_DUE_SOON" &&
      typeof daysUntilDue === "number" &&
      Number.isFinite(daysUntilDue) &&
      daysUntilDue < 0
    ) {
      overdueTaxCount += 1;
    }
  }

  return {
    totalCount: alerts.length,
    activeCount: openCount + snoozedCount,
    openCount,
    snoozedCount,
    resolvedCount,
    criticalOpenCount,
    warningOpenCount,
    infoOpenCount,
    byType,
    bySeverity,
    overdueTaxCount,
  };
}

function filterWorkspaceAlerts(
  alerts: WorkspaceAlertListItem[],
  input: Pick<WorkspaceAlertFilters, "query" | "status" | "severity" | "type" | "limit">
) {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filtered = alerts.filter((alert) => {
    if (input.status && input.status !== "ALL" && alert.status !== input.status) {
      return false;
    }
    if (input.severity && input.severity !== "ALL" && alert.severity !== input.severity) {
      return false;
    }
    if (input.type && input.type !== "ALL" && alert.type !== input.type) {
      return false;
    }
    if (!query) {
      return true;
    }

    const haystack = [
      alert.title,
      alert.message,
      alert.explanation ?? "",
      alert.clientBusiness?.name ?? "",
      ...alert.sourceRecords.map((record) => `${record.label} ${record.secondaryLabel ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  filtered.sort((left, right) => {
    const statusDelta = alertStatusRank(left.status) - alertStatusRank(right.status);
    if (statusDelta !== 0) return statusDelta;

    const severityDelta = alertSeverityRank(left.severity) - alertSeverityRank(right.severity);
    if (severityDelta !== 0) return severityDelta;

    return (
      new Date(right.lastDetectedAt).getTime() - new Date(left.lastDetectedAt).getTime()
    );
  });

  return typeof input.limit === "number" && input.limit > 0
    ? filtered.slice(0, input.limit)
    : filtered;
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
}) {
  if (!input.existing) {
    return {
      status: "OPEN" as const,
      snoozedUntil: null,
      resolvedAt: null,
      statusChangedAt: input.now,
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
      status: "SNOOZED" as const,
      snoozedUntil: input.existing.snoozedUntil,
      resolvedAt: null,
      statusChangedAt: null,
      statusChangedByUserId: null,
      statusChanged: false,
    };
  }

  if (input.existing.status === "OPEN") {
    return {
      status: "OPEN" as const,
      snoozedUntil: null,
      resolvedAt: null,
      statusChangedAt: null,
      statusChangedByUserId: null,
      statusChanged: false,
    };
  }

  return {
    status: "OPEN" as const,
    snoozedUntil: null,
    resolvedAt: null,
    statusChangedAt: input.now,
    statusChangedByUserId: null,
    statusChanged: true,
  };
}

function buildBankTransactionAlertLink(input: {
  id: number;
  description: string;
  transactionDate: Date;
  amountMinor: number;
  currency: string;
}): WorkspaceAlertRecordLink {
  return recordLink({
    recordType: "BANK_TRANSACTION",
    recordId: input.id,
    href: `/dashboard/banking/review?transactionId=${input.id}`,
    label: truncate(input.description),
    secondaryLabel: `${formatDate(input.transactionDate)} · ${formatMoney(
      input.amountMinor,
      input.currency
    )}`,
  });
}

function buildTaxRecordAlertLink(input: {
  id: number;
  label: string;
  occurredOn: Date;
  amountMinor: number;
  currency: string;
}): WorkspaceAlertRecordLink {
  return recordLink({
    recordType: "TAX_RECORD",
    recordId: input.id,
    href: `/dashboard/tax-records?recordId=${input.id}`,
    label: truncate(input.label),
    secondaryLabel: `${formatDate(input.occurredOn)} · ${formatMoney(
      input.amountMinor,
      input.currency
    )}`,
  });
}

async function detectDuplicateTransactionAlerts(
  workspaceId: number
): Promise<DetectedWorkspaceAlert[]> {
  let transactions: Array<{
    id: number;
    clientBusinessId: number | null;
    transactionDate: Date;
    description: string;
    reference: string | null;
    amount: number;
    currency: string;
    duplicateConfidence: number | null;
    duplicateReason: string | null;
    possibleDuplicateOfTransactionId: number | null;
    clientBusiness: {
      name: string;
    } | null;
    possibleDuplicateOf: {
      id: number;
      transactionDate: Date;
      description: string;
      reference: string | null;
      amount: number;
      currency: string;
    } | null;
  }> = [];

  try {
    transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        reviewStatus: {
          not: "POSTED",
        },
        OR: [
          {
            duplicateConfidence: {
              gte: DUPLICATE_ALERT_THRESHOLD,
            },
          },
          {
            possibleDuplicateOfTransactionId: {
              not: null,
            },
          },
        ],
      },
      orderBy: {
        transactionDate: "desc",
      },
      take: DUPLICATE_ALERT_LIMIT,
      select: {
        id: true,
        clientBusinessId: true,
        transactionDate: true,
        description: true,
        reference: true,
        amount: true,
        currency: true,
        duplicateConfidence: true,
        duplicateReason: true,
        possibleDuplicateOfTransactionId: true,
        clientBusiness: {
          select: {
            name: true,
          },
        },
        possibleDuplicateOf: {
          select: {
            id: true,
            transactionDate: true,
            description: true,
            reference: true,
            amount: true,
            currency: true,
          },
        },
      },
    });
  } catch (error) {
    logError(
      "workspace-alerts",
      "Duplicate transaction alert query failed; returning no duplicate alerts.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );

    return [];
  }

  const seen = new Set<string>();

  return transactions.flatMap((transaction) => {
    const counterpart = transaction.possibleDuplicateOf;
    const dedupeKey = counterpart
      ? `DUPLICATE_TRANSACTION:${Math.min(transaction.id, counterpart.id)}:${Math.max(
          transaction.id,
          counterpart.id
        )}`
      : `DUPLICATE_TRANSACTION:${transaction.id}`;

    if (seen.has(dedupeKey)) {
      return [];
    }
    seen.add(dedupeKey);

    const confidence = transaction.duplicateConfidence ?? 0;
    const severity: PrismaWorkspaceAlertSeverity =
      confidence >= DUPLICATE_CRITICAL_THRESHOLD ? "CRITICAL" : "WARNING";
    const title = counterpart
      ? "Possible duplicate transaction pair detected"
      : "Possible duplicate transaction detected";
    const message = counterpart
      ? `${truncate(transaction.description)} appears to duplicate ${truncate(
          counterpart.description
        )} with ${Math.round(confidence * 100)}% confidence.`
      : `${truncate(transaction.description)} was flagged as a likely duplicate and still needs confirmation.`;
    const sourceRecords = [
      buildBankTransactionAlertLink({
        id: transaction.id,
        description: transaction.description,
        transactionDate: transaction.transactionDate,
        amountMinor: transaction.amount,
        currency: transaction.currency,
      }),
      ...(counterpart
        ? [
            buildBankTransactionAlertLink({
              id: counterpart.id,
              description: counterpart.description,
              transactionDate: counterpart.transactionDate,
              amountMinor: counterpart.amount,
              currency: counterpart.currency,
            }),
          ]
        : []),
    ];

    return [
      {
        workspaceId,
        clientBusinessId: transaction.clientBusinessId,
        type: "DUPLICATE_TRANSACTION",
        severity,
        dedupeKey,
        title,
        message,
        explanation: transaction.duplicateReason ?? null,
        recommendedActionLabel: "Open transaction review",
        recommendedActionHref: `/dashboard/banking/review?transactionId=${transaction.id}`,
        primaryRecordType: "BANK_TRANSACTION",
        primaryRecordId: transaction.id,
        primaryRecordHref: `/dashboard/banking/review?transactionId=${transaction.id}`,
        recordCount: sourceRecords.length,
        sourceRecords,
        metadata: {
          confidence,
          duplicateReason: transaction.duplicateReason ?? null,
          clientBusinessName: transaction.clientBusiness?.name ?? null,
        },
      } satisfies DetectedWorkspaceAlert,
    ];
  });
}

function buildSpikeGroupKey(transaction: {
  clientBusinessId: number | null;
  normalizedMerchantName: string | null;
  categoryId: number | null;
}) {
  const businessKey = transaction.clientBusinessId ?? 0;
  const merchantKey = transaction.normalizedMerchantName?.trim().toLowerCase();
  if (merchantKey) {
    return `merchant:${businessKey}:${merchantKey}`;
  }
  if (transaction.categoryId) {
    return `category:${businessKey}:${transaction.categoryId}`;
  }
  return null;
}

async function detectUnusualSpikeAlerts(
  workspaceId: number
): Promise<DetectedWorkspaceAlert[]> {
  const thresholdDate = new Date(Date.now() - SPIKE_LOOKBACK_DAYS * DAY_IN_MS);
  let transactions: Array<{
    id: number;
    clientBusinessId: number | null;
    transactionDate: Date;
    description: string;
    reference: string | null;
    amount: number;
    currency: string;
    categoryId: number | null;
    normalizedMerchantName: string | null;
    suspiciousPatternScore: number | null;
    suspiciousPatternReason: string | null;
    clientBusiness: {
      name: string;
    } | null;
    category: {
      name: string;
    } | null;
  }> = [];

  try {
    transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        transactionDate: {
          gte: thresholdDate,
        },
        OR: [
          {
            normalizedMerchantName: {
              not: null,
            },
          },
          {
            categoryId: {
              not: null,
            },
          },
          {
            suspiciousPatternScore: {
              gte: 0.8,
            },
          },
        ],
      },
      orderBy: {
        transactionDate: "asc",
      },
      select: {
        id: true,
        clientBusinessId: true,
        transactionDate: true,
        description: true,
        reference: true,
        amount: true,
        currency: true,
        categoryId: true,
        normalizedMerchantName: true,
        suspiciousPatternScore: true,
        suspiciousPatternReason: true,
        clientBusiness: {
          select: {
            name: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
      },
    });
  } catch (error) {
    logError(
      "workspace-alerts",
      "Unusual spike query failed; returning no spike alerts.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );

    return [];
  }

  const groupedTransactions = new Map<string, typeof transactions>();

  for (const transaction of transactions) {
    const groupKey = buildSpikeGroupKey(transaction);
    if (!groupKey) continue;

    const bucket = groupedTransactions.get(groupKey) ?? [];
    bucket.push(transaction);
    groupedTransactions.set(groupKey, bucket);
  }

  const candidates: Array<DetectedWorkspaceAlert & { magnitude: number }> = [];

  for (const group of groupedTransactions.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const transaction = group[index];
      const previous = group.slice(Math.max(0, index - 6), index);
      if (
        previous.length < SPIKE_MIN_SAMPLE_COUNT ||
        transaction.amount < SPIKE_MIN_AMOUNT_MINOR
      ) {
        continue;
      }

      const baselineAverage =
        previous.reduce((sum, candidate) => sum + candidate.amount, 0) / previous.length;
      const ratio = baselineAverage > 0 ? transaction.amount / baselineAverage : 0;
      const delta = transaction.amount - baselineAverage;
      if (ratio < SPIKE_RATIO_THRESHOLD || delta < SPIKE_MIN_DELTA_MINOR) {
        continue;
      }

      const severity: PrismaWorkspaceAlertSeverity =
        ratio >= SPIKE_CRITICAL_RATIO_THRESHOLD ||
        (transaction.suspiciousPatternScore ?? 0) >= 0.9
          ? "CRITICAL"
          : "WARNING";
      const groupLabel =
        transaction.normalizedMerchantName?.trim() ||
        transaction.category?.name?.trim() ||
        "This transaction pattern";
      const baselineLinks = previous
        .slice(-3)
        .map((baseline) =>
          buildBankTransactionAlertLink({
            id: baseline.id,
            description: baseline.description,
            transactionDate: baseline.transactionDate,
            amountMinor: baseline.amount,
            currency: baseline.currency,
          })
        );

      candidates.push({
        workspaceId,
        clientBusinessId: transaction.clientBusinessId,
        type: "UNUSUAL_SPIKE",
        severity,
        dedupeKey: `UNUSUAL_SPIKE:${transaction.id}`,
        title: "Unusual transaction spike detected",
        message: `${truncate(groupLabel)} landed at ${formatMoney(
          transaction.amount,
          transaction.currency
        )}, about ${ratio.toFixed(1)}x the recent average.`,
        explanation:
          transaction.suspiciousPatternReason ??
          `Recent transactions in this pattern averaged ${formatMoney(
            Math.round(baselineAverage),
            transaction.currency
          )}.`,
        recommendedActionLabel: "Inspect transaction",
        recommendedActionHref: `/dashboard/banking/review?transactionId=${transaction.id}`,
        primaryRecordType: "BANK_TRANSACTION",
        primaryRecordId: transaction.id,
        primaryRecordHref: `/dashboard/banking/review?transactionId=${transaction.id}`,
        recordCount: 1 + baselineLinks.length,
        sourceRecords: [
          buildBankTransactionAlertLink({
            id: transaction.id,
            description: transaction.description,
            transactionDate: transaction.transactionDate,
            amountMinor: transaction.amount,
            currency: transaction.currency,
          }),
          ...baselineLinks,
        ],
        metadata: {
          ratio,
          baselineAverageMinor: Math.round(baselineAverage),
          suspiciousPatternScore: transaction.suspiciousPatternScore ?? null,
          clientBusinessName: transaction.clientBusiness?.name ?? null,
        },
        magnitude: delta,
      });
    }
  }

  return candidates
    .sort((left, right) => {
      const severityDelta =
        alertSeverityRank(left.severity) - alertSeverityRank(right.severity);
      if (severityDelta !== 0) return severityDelta;
      return right.magnitude - left.magnitude;
    })
    .slice(0, SPIKE_ALERT_LIMIT)
    .map((candidate) => ({
      workspaceId: candidate.workspaceId,
      clientBusinessId: candidate.clientBusinessId,
      type: candidate.type,
      severity: candidate.severity,
      dedupeKey: candidate.dedupeKey,
      title: candidate.title,
      message: candidate.message,
      explanation: candidate.explanation,
      recommendedActionLabel: candidate.recommendedActionLabel,
      recommendedActionHref: candidate.recommendedActionHref,
      primaryRecordType: candidate.primaryRecordType,
      primaryRecordId: candidate.primaryRecordId,
      primaryRecordHref: candidate.primaryRecordHref,
      recordCount: candidate.recordCount,
      sourceRecords: candidate.sourceRecords,
      metadata: candidate.metadata,
    }));
}

async function detectMissingEvidenceAlerts(
  workspaceId: number
): Promise<DetectedWorkspaceAlert[]> {
  let records: Array<{
    id: number;
    clientBusinessId: number | null;
    occurredOn: Date;
    description: string | null;
    amountKobo: number;
    currency: string;
    kind: string;
    taxEvidenceStatus: TaxEvidenceStatus;
    clientBusiness: {
      name: string;
    } | null;
  }> = [];

  try {
    records = await prisma.taxRecord.findMany({
      where: {
        workspaceId,
        taxEvidenceStatus: {
          in: EVIDENCE_ALERT_STATUSES,
        },
      },
      orderBy: {
        occurredOn: "desc",
      },
      select: {
        id: true,
        clientBusinessId: true,
        occurredOn: true,
        description: true,
        amountKobo: true,
        currency: true,
        kind: true,
        taxEvidenceStatus: true,
        clientBusiness: {
          select: {
            name: true,
          },
        },
      },
    });
  } catch (error) {
    logError(
      "workspace-alerts",
      "Missing evidence query failed; returning no evidence alerts.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );

    return [];
  }

  const grouped = new Map<number, typeof records>();

  for (const record of records) {
    const groupKey = record.clientBusinessId ?? 0;
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(record);
    grouped.set(groupKey, bucket);
  }

  return Array.from(grouped.entries()).map(([groupKey, groupRecords]) => {
    const hasMissing = groupRecords.some((record) => record.taxEvidenceStatus === "MISSING");
    const clientBusinessName = groupRecords[0]?.clientBusiness?.name ?? null;
    const severity: PrismaWorkspaceAlertSeverity =
      hasMissing || groupRecords.length >= 8
        ? "CRITICAL"
        : groupRecords.length >= 3
          ? "WARNING"
          : "INFO";
    const sourceRecords = groupRecords.slice(0, ALERT_SOURCE_RECORD_LIMIT).map((record) =>
      buildTaxRecordAlertLink({
        id: record.id,
        label: record.description || `${record.kind} record #${record.id}`,
        occurredOn: record.occurredOn,
        amountMinor: record.amountKobo,
        currency: record.currency,
      })
    );

    return {
      workspaceId,
      clientBusinessId: groupKey > 0 ? groupRecords[0]?.clientBusinessId ?? null : null,
      type: "MISSING_EVIDENCE",
      severity,
      dedupeKey: `MISSING_EVIDENCE:${groupKey}`,
      title: clientBusinessName
        ? `${clientBusinessName} has tax records without support`
        : "Tax records are missing support",
      message: `${groupRecords.length} tax record${
        groupRecords.length === 1 ? "" : "s"
      } still show unknown, pending, or missing evidence.`,
      explanation: hasMissing
        ? "At least one record is explicitly marked as missing evidence, which can block filing support."
        : "Pending evidence should be attached or verified before filing or audit review.",
      recommendedActionLabel: "Review tax records",
      recommendedActionHref: "/dashboard/tax-records",
      primaryRecordType: sourceRecords[0]?.recordType ?? null,
      primaryRecordId: sourceRecords[0]?.recordId ?? null,
      primaryRecordHref: sourceRecords[0]?.href ?? "/dashboard/tax-records",
      recordCount: groupRecords.length,
      sourceRecords,
      metadata: {
        clientBusinessName,
        statuses: groupRecords.reduce<Record<string, number>>((accumulator, record) => {
          accumulator[record.taxEvidenceStatus] =
            (accumulator[record.taxEvidenceStatus] ?? 0) + 1;
          return accumulator;
        }, {}),
      },
    } satisfies DetectedWorkspaceAlert;
  });
}

function getPreviousMonthRange(now = new Date()) {
  const previousMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
  );
  const previousMonthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)
  );
  const dueDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 21, 23, 59, 59, 999)
  );

  return {
    previousMonthStart,
    previousMonthEnd,
    dueDate,
  };
}

function buildTaxDueSoonSeverity(daysUntilDue: number): PrismaWorkspaceAlertSeverity | null {
  if (daysUntilDue > TAX_DUE_SOON_LOOKAHEAD_DAYS) return null;
  if (daysUntilDue <= TAX_DUE_SOON_CRITICAL_DAYS) return "CRITICAL";
  return "WARNING";
}

async function detectTaxDueSoonAlerts(
  workspaceId: number
): Promise<DetectedWorkspaceAlert[]> {
  const now = new Date();
  const { previousMonthStart, previousMonthEnd, dueDate } = getPreviousMonthRange(now);
  const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / DAY_IN_MS);
  const severity = buildTaxDueSoonSeverity(daysUntilDue);
  if (!severity) {
    return [];
  }

  let summary;

  try {
    summary = await getWorkspaceTransactionTaxSummary({
      workspaceId,
      reviewStatus: "POSTED",
      dateFrom: previousMonthStart,
      dateTo: previousMonthEnd,
      periodPreset: "CUSTOM",
      defaultDateWindowApplied: false,
      drilldownLimit: ALERT_SOURCE_RECORD_LIMIT,
    });
  } catch (error) {
    logError(
      "workspace-alerts",
      "Tax due summary query failed; returning no tax-due alerts.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );

    return [];
  }

  if (summary.liability.totalDueMinor <= 0) {
    return [];
  }

  const sourceRecords = summary.explanations.taxes
    .flatMap((explanation) => explanation.topTransactions)
    .slice(0, ALERT_SOURCE_RECORD_LIMIT)
    .map((transaction) =>
      recordLink({
        recordType: transaction.trace.sourceRecordType,
        recordId: transaction.trace.sourceRecordId,
        href: transaction.trace.sourceRecordHref,
        label: truncate(transaction.description),
        secondaryLabel: `${formatDate(new Date(transaction.transactionDate))} · ${formatMoney(
          transaction.trace.totalLiabilityEffectMinor,
          transaction.currency
        )}`,
      })
    );

  const explanationText = summary.explanations.taxes
    .map((item) => `${item.label}: ${item.summary}`)
    .join(" ");

  return [
    {
      workspaceId,
      clientBusinessId: null,
      type: "TAX_DUE_SOON",
      severity,
      dedupeKey: `TAX_DUE_SOON:${previousMonthStart.toISOString().slice(0, 7)}`,
      title:
        daysUntilDue < 0
          ? "Workspace tax liability is overdue"
          : "Workspace tax liability is due soon",
      message: `${formatMoney(
        summary.liability.totalDueMinor,
        summary.currency
      )} is currently payable for ${summary.scope.dateLabel}, ${formatDaysUntilDue(
        daysUntilDue
      )}.`,
      explanation: explanationText || "The current VAT and WHT totals are derived directly from workspace transactions.",
      recommendedActionLabel: "Open tax center",
      recommendedActionHref: "/dashboard/tax-center",
      primaryRecordType: sourceRecords[0]?.recordType ?? "WORKSPACE",
      primaryRecordId: sourceRecords[0]?.recordId ?? null,
      primaryRecordHref: sourceRecords[0]?.href ?? "/dashboard/tax-center",
      recordCount: sourceRecords.length,
      sourceRecords,
      metadata: {
        dueDate: dueDate.toISOString(),
        daysUntilDue,
        totalDueMinor: summary.liability.totalDueMinor,
        vatDueMinor: summary.liability.vatDueMinor,
        whtDueMinor: summary.liability.whtDueMinor,
        dateLabel: summary.scope.dateLabel,
      },
    },
  ];
}

async function detectUnresolvedReviewItemAlerts(
  workspaceId: number
): Promise<DetectedWorkspaceAlert[]> {
  let count = 0;
  let transactions: Array<{
    id: number;
    transactionDate: Date;
    description: string;
    amount: number;
    currency: string;
  }> = [];

  try {
    [count, transactions] = await Promise.all([
      prisma.bankTransaction.count({
        where: {
          workspaceId,
          OR: [
            {
              reviewStatus: {
                in: OPEN_REVIEW_STATUSES,
              },
            },
            {
              postingReadiness: {
                in: REVIEW_REQUIRED_POSTING_STATES,
              },
            },
          ],
        },
      }),
      prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          OR: [
            {
              reviewStatus: {
                in: OPEN_REVIEW_STATUSES,
              },
            },
            {
              postingReadiness: {
                in: REVIEW_REQUIRED_POSTING_STATES,
              },
            },
          ],
        },
        orderBy: {
          transactionDate: "desc",
        },
        take: ALERT_SOURCE_RECORD_LIMIT,
        select: {
          id: true,
          transactionDate: true,
          description: true,
          amount: true,
          currency: true,
        },
      }),
    ]);
  } catch (error) {
    logError(
      "workspace-alerts",
      "Review queue query failed; returning no review-item alerts.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );

    return [];
  }

  if (count === 0) {
    return [];
  }

  const severity: PrismaWorkspaceAlertSeverity =
    count >= 20 ? "CRITICAL" : count >= 5 ? "WARNING" : "INFO";

  return [
    {
      workspaceId,
      clientBusinessId: null,
      type: "UNRESOLVED_REVIEW_ITEMS",
      severity,
      dedupeKey: "UNRESOLVED_REVIEW_ITEMS:WORKSPACE",
      title: "Review queue still has unresolved items",
      message: `${count} transaction${count === 1 ? "" : "s"} still need review, posting cleanup, or exception handling.`,
      explanation:
        "Imported, pending, flagged, or review-required transactions can hold back accurate bookkeeping and tax output.",
      recommendedActionLabel: "Open review queue",
      recommendedActionHref: "/dashboard/banking/review",
      primaryRecordType: "BANK_TRANSACTION",
      primaryRecordId: transactions[0]?.id ?? null,
      primaryRecordHref: transactions[0]
        ? `/dashboard/banking/review?transactionId=${transactions[0].id}`
        : "/dashboard/banking/review",
      recordCount: count,
      sourceRecords: transactions.map((transaction) =>
        buildBankTransactionAlertLink({
          id: transaction.id,
          description: transaction.description,
          transactionDate: transaction.transactionDate,
          amountMinor: transaction.amount,
          currency: transaction.currency,
        })
      ),
      metadata: {
        count,
      },
    },
  ];
}

function mapFilingSeverityToAlertSeverity(
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
): PrismaWorkspaceAlertSeverity {
  if (severity === "CRITICAL" || severity === "HIGH") return "CRITICAL";
  if (severity === "MEDIUM") return "WARNING";
  return "INFO";
}

async function detectFilingBlockerAlerts(
  workspaceId: number
): Promise<DetectedWorkspaceAlert[]> {
  const readiness = await getWorkspaceFilingReadiness({
    workspaceId,
    defaultDateWindowApplied: true,
  });

  return readiness.blockers.map((blocker) => ({
    workspaceId,
    clientBusinessId: null,
    type: "FILING_BLOCKER",
    severity: mapFilingSeverityToAlertSeverity(blocker.severity),
    dedupeKey: `FILING_BLOCKER:${blocker.key}`,
    title: blocker.title,
    message: blocker.detail,
    explanation: readiness.narrative,
    recommendedActionLabel: blocker.actionLabel,
    recommendedActionHref: blocker.href,
    primaryRecordType: blocker.examples[0]?.kind ?? "WORKSPACE",
    primaryRecordId: blocker.examples[0]?.id ?? null,
    primaryRecordHref: blocker.examples[0]?.href ?? blocker.href,
    recordCount: blocker.count,
    sourceRecords: blocker.examples.map((example) =>
      recordLink({
        recordType: example.kind,
        recordId: example.id,
        href: example.href,
        label: truncate(example.label),
        secondaryLabel: example.secondaryLabel,
      })
    ),
    metadata: {
      blockerKey: blocker.key,
      severity: blocker.severity,
      dateLabel: readiness.scope.dateLabel,
    },
  }));
}

async function detectWorkspaceAlerts(workspaceId: number) {
  const detected = await Promise.all([
    runWorkspaceAlertStepSafely({
      workspaceId,
      label: "duplicate detector",
      query: detectDuplicateTransactionAlerts(workspaceId),
      fallback: () => [],
    }),
    runWorkspaceAlertStepSafely({
      workspaceId,
      label: "spike detector",
      query: detectUnusualSpikeAlerts(workspaceId),
      fallback: () => [],
    }),
    runWorkspaceAlertStepSafely({
      workspaceId,
      label: "missing evidence detector",
      query: detectMissingEvidenceAlerts(workspaceId),
      fallback: () => [],
    }),
    runWorkspaceAlertStepSafely({
      workspaceId,
      label: "tax due detector",
      query: detectTaxDueSoonAlerts(workspaceId),
      fallback: () => [],
    }),
    runWorkspaceAlertStepSafely({
      workspaceId,
      label: "review queue detector",
      query: detectUnresolvedReviewItemAlerts(workspaceId),
      fallback: () => [],
    }),
    runWorkspaceAlertStepSafely({
      workspaceId,
      label: "filing blocker detector",
      query: detectFilingBlockerAlerts(workspaceId),
      fallback: () => [],
    }),
  ]);

  return detected.flat();
}

export async function syncWorkspaceAlerts(workspaceId: number) {
  const supportsWorkspaceAlertStorage = await hasPrismaDatabaseSupport(
    WORKSPACE_ALERT_STORAGE_SUPPORT
  );
  const supportsWorkspaceAlertDetection = await hasPrismaDatabaseSupport(
    WORKSPACE_ALERT_DETECTOR_SUPPORT
  );

  if (!supportsWorkspaceAlertStorage || !supportsWorkspaceAlertDetection) {
    return;
  }

  try {
    const now = new Date();
    const detectedAlerts = await detectWorkspaceAlerts(workspaceId);
    const existingAlerts = await prisma.workspaceAlert.findMany({
      where: {
        workspaceId,
        type: {
          in: DETECTED_ALERT_TYPES,
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
    const detectedDedupeKeys = new Set(detectedAlerts.map((alert) => alert.dedupeKey));

    await prisma.$transaction(async (tx) => {
      for (const alert of detectedAlerts) {
        const existing = existingByDedupeKey.get(alert.dedupeKey);
        const nextStatus = resolveDetectedAlertStatus({
          existing,
          severity: alert.severity,
          now,
        });

        await tx.workspaceAlert.upsert({
          where: {
            workspaceId_dedupeKey: {
              workspaceId,
              dedupeKey: alert.dedupeKey,
            },
          },
          create: {
            workspaceId: alert.workspaceId,
            clientBusinessId: alert.clientBusinessId,
            type: alert.type,
            severity: alert.severity,
            status: nextStatus.status,
            dedupeKey: alert.dedupeKey,
            title: alert.title,
            message: alert.message,
            explanation: alert.explanation,
            recommendedActionLabel: alert.recommendedActionLabel,
            recommendedActionHref: alert.recommendedActionHref,
            primaryRecordType: alert.primaryRecordType,
            primaryRecordId: alert.primaryRecordId,
            primaryRecordHref: alert.primaryRecordHref,
            recordCount: alert.recordCount,
            sourceRecordsPayload: JSON.stringify(alert.sourceRecords),
            metadataPayload: alert.metadata ? JSON.stringify(alert.metadata) : null,
            firstDetectedAt: now,
            lastDetectedAt: now,
            snoozedUntil: nextStatus.snoozedUntil,
            resolvedAt: nextStatus.resolvedAt,
            lastStatusChangedAt: nextStatus.statusChangedAt,
          },
          update: {
            clientBusinessId: alert.clientBusinessId,
            type: alert.type,
            severity: alert.severity,
            status: nextStatus.status,
            title: alert.title,
            message: alert.message,
            explanation: alert.explanation,
            recommendedActionLabel: alert.recommendedActionLabel,
            recommendedActionHref: alert.recommendedActionHref,
            primaryRecordType: alert.primaryRecordType,
            primaryRecordId: alert.primaryRecordId,
            primaryRecordHref: alert.primaryRecordHref,
            recordCount: alert.recordCount,
            sourceRecordsPayload: JSON.stringify(alert.sourceRecords),
            metadataPayload: alert.metadata ? JSON.stringify(alert.metadata) : null,
            lastDetectedAt: now,
            snoozedUntil: nextStatus.snoozedUntil,
            resolvedAt: nextStatus.resolvedAt,
            ...(nextStatus.statusChanged
              ? {
                  lastStatusChangedAt: nextStatus.statusChangedAt,
                  statusChangedByUserId: nextStatus.statusChangedByUserId,
                }
              : {}),
          },
        });
      }

      const staleAlerts = existingAlerts
        .filter(
          (alert) =>
            !detectedDedupeKeys.has(alert.dedupeKey) &&
            (alert.status === "OPEN" || alert.status === "SNOOZED")
        )
        .map((alert) => alert.id);

      if (staleAlerts.length > 0) {
        await tx.workspaceAlert.updateMany({
          where: {
            id: {
              in: staleAlerts,
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
    logError(
      "workspace-alerts",
      "Workspace alert sync failed; continuing with a safe empty-state fallback.",
      error,
      {
        workspaceId,
        schemaCompatibilityError: isWorkspaceAlertSchemaCompatibilityError(error),
      }
    );
  }
}

export async function getWorkspaceAlertCenterData(
  input: WorkspaceAlertFilters
): Promise<WorkspaceAlertCenterResponse> {
  if (!(await hasPrismaDatabaseSupport(WORKSPACE_ALERT_STORAGE_SUPPORT))) {
    return buildEmptyWorkspaceAlertCenterData(input.workspaceId);
  }

  try {
    if (input.sync) {
      await runWorkspaceAlertStepSafely({
        workspaceId: input.workspaceId,
        label: "sync",
        support: {
          tables: [...WORKSPACE_ALERT_STORAGE_SUPPORT.tables],
          columns: [...WORKSPACE_ALERT_DETECTOR_SUPPORT.columns],
        },
        query: syncWorkspaceAlerts(input.workspaceId),
        fallback: () => undefined,
      });
    }

    const records = await runWorkspaceAlertStepSafely({
      workspaceId: input.workspaceId,
      label: "records query",
      support: WORKSPACE_ALERT_STORAGE_SUPPORT,
      query: prisma.workspaceAlert.findMany({
        where: {
          workspaceId: input.workspaceId,
        },
        select: workspaceAlertSelect,
      }),
      fallback: () => [],
    });
    const alerts = records.map(serializeWorkspaceAlert);
    const summary = buildWorkspaceAlertSummary(alerts);

    return {
      generatedAt: new Date().toISOString(),
      workspace: {
        id: input.workspaceId,
      },
      summary,
      alerts: filterWorkspaceAlerts(alerts, {
        query: input.query,
        status: input.status,
        severity: input.severity,
        type: input.type,
        limit: input.limit ?? DEFAULT_ALERT_LIMIT,
      }),
    };
  } catch (error) {
    logError(
      "workspace-alerts",
      "Failed to build workspace alerts; returning an empty result.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyWorkspaceAlertCenterData(input.workspaceId);
  }
}

export async function getDashboardWorkspaceAlertSnapshot(
  workspaceId: number
): Promise<WorkspaceAlertDashboardSnapshot> {
  try {
    const center = await getWorkspaceAlertCenterData({
      workspaceId,
      sync: true,
      limit: 4,
    });

    return {
      generatedAt: center.generatedAt,
      summary: {
        openCount: center.summary.openCount,
        criticalCount: center.summary.criticalOpenCount,
        snoozedCount: center.summary.snoozedCount,
        resolvedCount: center.summary.resolvedCount,
      },
      topAlerts: center.alerts.filter((alert) => alert.status !== "RESOLVED").slice(0, 4),
    };
  } catch (error) {
    logError(
      "workspace-alerts",
      "Failed to build dashboard workspace alerts; returning an empty widget result.",
      error,
      {
        workspaceId,
      }
    );

    return buildEmptyDashboardWorkspaceAlertSnapshot(workspaceId);
  }
}

export async function updateWorkspaceAlertStatus(input: {
  workspaceId: number;
  alertId: number;
  actorUserId: number;
  status: WorkspaceAlertStatus;
  snoozedUntil?: Date | null;
  lastKnownChangeAt?: string | null;
}) {
  const alert = await prisma.workspaceAlert.findFirst({
    where: {
      id: input.alertId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      lastStatusChangedAt: true,
      primaryRecordHref: true,
    },
  });

  if (!alert) {
    throw new Error("Alert not found.");
  }

  const currentLastKnownChangeAt = alert.lastStatusChangedAt?.toISOString() ?? null;

  if (
    input.lastKnownChangeAt !== undefined &&
    input.lastKnownChangeAt !== currentLastKnownChangeAt
  ) {
    throw new OfflineSyncConflictError(
      "This alert changed before the queued action could sync.",
      {
        label: alert.title,
        status: alert.status,
        lastKnownChangeAt: currentLastKnownChangeAt,
        href: alert.primaryRecordHref ?? "/dashboard/notifications",
        recordType: "WORKSPACE_ALERT",
        recordId: alert.id,
      }
    );
  }

  const now = new Date();
  const nextSnoozedUntil =
    input.status === "SNOOZED"
      ? input.snoozedUntil && input.snoozedUntil.getTime() > now.getTime()
        ? input.snoozedUntil
        : new Date(now.getTime() + 7 * DAY_IN_MS)
      : null;

  const updated = await prisma.workspaceAlert.update({
    where: {
      id: alert.id,
    },
    data: {
      status: input.status,
      snoozedUntil: nextSnoozedUntil,
      resolvedAt: input.status === "RESOLVED" ? now : null,
      lastStatusChangedAt: now,
      statusChangedByUserId: input.actorUserId,
    },
    select: workspaceAlertSelect,
  });

  return serializeWorkspaceAlert(updated);
}
