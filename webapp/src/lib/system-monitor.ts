import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  SystemMonitorEventLevel,
  SystemMonitorEventRow,
  SystemMonitorHealth,
  SystemMonitorIssue,
  SystemMonitorIssueLevel,
  SystemMonitorSnapshot,
} from "@/lib/system-monitor-types";

const MONITOR_EVENT_ACTIONS = [
  "PAYMENT_INIT",
  "PAYMENT_CALLBACK_RECEIVED",
  "PAYMENT_WEBHOOK_RECEIVED",
  "PAYMENT_VERIFIED",
  "PAYMENT_FAILED",
  "LEDGER_POSTED",
  "TAX_SYNCED",
  "INVOICE_PAYMENT_CONFIRMED",
  "INVOICE_PAYMENT_INTEGRITY_NEEDS_REVIEW",
  "Income created from invoice payment",
] as const;

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function parseMetadata(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseInvoiceIdFromReference(reference: string | null | undefined) {
  if (!reference?.startsWith("INVOICE:")) return null;

  const parsed = Number(reference.slice("INVOICE:".length));
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function compareIssueLevel(a: SystemMonitorIssueLevel, b: SystemMonitorIssueLevel) {
  const order: Record<SystemMonitorIssueLevel, number> = {
    critical: 0,
    warning: 1,
  };

  return order[a] - order[b];
}

function sortIssues(issues: SystemMonitorIssue[]) {
  return [...issues].sort((left, right) => {
    const levelDiff = compareIssueLevel(left.level, right.level);
    if (levelDiff !== 0) return levelDiff;

    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    return rightTime - leftTime;
  });
}

function createIssue(input: {
  code: string;
  level: SystemMonitorIssueLevel;
  title: string;
  detail: string;
  invoiceId?: number | null;
  reference?: string | null;
  createdAt?: Date | null;
}) {
  return {
    id: `${input.code}:${input.invoiceId ?? input.reference ?? input.detail}`,
    code: input.code,
    level: input.level,
    title: input.title,
    detail: input.detail,
    invoiceId: input.invoiceId ?? null,
    reference: input.reference ?? null,
    createdAt: toIsoString(input.createdAt),
  } satisfies SystemMonitorIssue;
}

function resolveHealth(input: {
  criticalCount: number;
  warningCount?: number;
}): SystemMonitorHealth {
  if (input.criticalCount > 0) return "critical";
  if ((input.warningCount ?? 0) > 0) return "warning";
  return "healthy";
}

function pickEventLevel(action: string, status: string | null): SystemMonitorEventLevel {
  if (
    action === "PAYMENT_FAILED" ||
    action === "INVOICE_PAYMENT_INTEGRITY_NEEDS_REVIEW"
  ) {
    return "critical";
  }

  if (
    action === "PAYMENT_WEBHOOK_RECEIVED" ||
    action === "PAYMENT_CALLBACK_RECEIVED" ||
    action === "PAYMENT_INIT" ||
    status === "PENDING"
  ) {
    return "warning";
  }

  return "info";
}

function summarizeEvent(action: string, metadata: Record<string, unknown> | null) {
  const fragments = [
    typeof metadata?.provider === "string" ? metadata.provider : null,
    typeof metadata?.source === "string" ? metadata.source : null,
    typeof metadata?.status === "string" ? metadata.status : null,
  ].filter(Boolean);

  return fragments.length > 0 ? `${action} • ${fragments.join(" • ")}` : action;
}

export async function getSystemMonitorSnapshot(input: {
  workspaceId: number;
  workspaceName?: string | null;
}): Promise<SystemMonitorSnapshot> {
  if (!Number.isFinite(input.workspaceId) || input.workspaceId <= 0) {
    throw new Error("A valid workspaceId is required to build the system monitor.");
  }

  const [workspaceRecord, clientBusinesses, payments, paidInvoices, taxRecords, auditLogs] =
    await Promise.all([
      input.workspaceName
        ? Promise.resolve({ id: input.workspaceId, name: input.workspaceName })
        : prisma.workspace.findUnique({
            where: { id: input.workspaceId },
            select: { id: true, name: true },
          }),
      prisma.clientBusiness.findMany({
        where: { workspaceId: input.workspaceId },
        select: { id: true },
      }),
      prisma.payment.findMany({
        where: { workspaceId: input.workspaceId },
        select: {
          id: true,
          invoiceId: true,
          provider: true,
          reference: true,
          amountMinor: true,
          currency: true,
          status: true,
          createdAt: true,
          invoice: {
            select: {
              invoiceNumber: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: "PAID",
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paymentReference: true,
          paidAt: true,
          updatedAt: true,
          payments: {
            select: {
              id: true,
              status: true,
              amountMinor: true,
              currency: true,
              reference: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.taxRecord.findMany({
        where: {
          workspaceId: input.workspaceId,
          invoiceId: {
            not: null,
          },
        },
        select: {
          id: true,
          invoiceId: true,
          occurredOn: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: {
          workspaceId: input.workspaceId,
          action: {
            in: [...MONITOR_EVENT_ACTIONS],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          actor: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);

  if (!workspaceRecord) {
    throw new Error(`Workspace ${input.workspaceId} was not found for system monitoring.`);
  }

  const clientBusinessIds = clientBusinesses.map((item) => item.id);
  const ledgerTransactions =
    clientBusinessIds.length > 0
      ? await prisma.ledgerTransaction.findMany({
          where: {
            clientBusinessId: {
              in: clientBusinessIds,
            },
            reference: {
              startsWith: "INVOICE:",
            },
          },
          select: {
            id: true,
            reference: true,
            amountMinor: true,
            direction: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const now = Date.now();
  const last24HoursStart = now - 24 * 60 * 60 * 1000;

  const successfulPayments = payments.filter((payment) => payment.status === "SUCCESS");
  const failedPayments = payments.filter((payment) => payment.status === "FAILED");
  const pendingPayments = payments.filter((payment) => payment.status === "PENDING");

  const successfulPaymentsByInvoice = new Map<number, typeof successfulPayments>();
  for (const payment of successfulPayments) {
    const existing = successfulPaymentsByInvoice.get(payment.invoiceId) ?? [];
    existing.push(payment);
    successfulPaymentsByInvoice.set(payment.invoiceId, existing);
  }

  const paidInvoicesWithSuccessfulPaymentCount = paidInvoices.filter((invoice) => {
    return (successfulPaymentsByInvoice.get(invoice.id) ?? []).length > 0;
  }).length;

  const taxRecordByInvoice = new Map<number, (typeof taxRecords)[number]>();
  for (const record of taxRecords) {
    if (record.invoiceId && !taxRecordByInvoice.has(record.invoiceId)) {
      taxRecordByInvoice.set(record.invoiceId, record);
    }
  }

  const ledgerByReference = new Map<string, (typeof ledgerTransactions)>();
  for (const row of ledgerTransactions) {
    if (!row.reference) continue;
    const existing = ledgerByReference.get(row.reference) ?? [];
    existing.push(row);
    ledgerByReference.set(row.reference, existing);
  }

  const ledgerIssues: SystemMonitorIssue[] = [];
  const taxIssues: SystemMonitorIssue[] = [];
  const alertIssues: SystemMonitorIssue[] = [];

  let matchedCount = 0;
  let missingLedgerCount = 0;
  let duplicateLedgerCount = 0;
  let missingTaxCount = 0;

  for (const invoice of paidInvoices) {
    const expectedReference = `INVOICE:${invoice.id}`;
    const invoiceSuccessPayments = successfulPaymentsByInvoice.get(invoice.id) ?? [];
    const ledgerRows = (ledgerByReference.get(expectedReference) ?? []).filter(
      (row) => row.direction === "MONEY_IN"
    );
    const taxRecord = taxRecordByInvoice.get(invoice.id) ?? null;

    if (invoiceSuccessPayments.length === 0) {
      alertIssues.push(
        createIssue({
          code: "PAID_INVOICE_WITHOUT_PAYMENT",
          level: "critical",
          title: "Paid invoice missing successful payment record",
          detail: `Invoice ${invoice.invoiceNumber} is marked PAID but has no successful payment record.`,
          invoiceId: invoice.id,
          reference: invoice.paymentReference ?? expectedReference,
          createdAt: invoice.updatedAt,
        })
      );
      continue;
    }

    if (ledgerRows.length === 0) {
      missingLedgerCount += 1;
      const issue = createIssue({
        code: "PAYMENT_WITHOUT_LEDGER",
        level: "critical",
        title: "Payment without ledger entry",
        detail: `Invoice ${invoice.invoiceNumber} has a successful payment but no MONEY_IN ledger entry for ${expectedReference}.`,
        invoiceId: invoice.id,
        reference: expectedReference,
        createdAt: invoice.updatedAt,
      });
      ledgerIssues.push(issue);
      alertIssues.push(issue);
    } else if (ledgerRows.length > 1) {
      duplicateLedgerCount += 1;
      const issue = createIssue({
        code: "DUPLICATE_LEDGER_FOR_PAYMENT",
        level: "critical",
        title: "Duplicate ledger entries for one paid invoice",
        detail: `Invoice ${invoice.invoiceNumber} has ${ledgerRows.length} MONEY_IN ledger entries for ${expectedReference}.`,
        invoiceId: invoice.id,
        reference: expectedReference,
        createdAt: ledgerRows[0]?.createdAt ?? invoice.updatedAt,
      });
      ledgerIssues.push(issue);
      alertIssues.push(issue);
    } else {
      const ledgerRow = ledgerRows[0];
      if (ledgerRow.amountMinor !== invoice.totalAmount) {
        const issue = createIssue({
          code: "LEDGER_AMOUNT_MISMATCH",
          level: "critical",
          title: "Ledger amount mismatch",
          detail: `Invoice ${invoice.invoiceNumber} has a payment/ledger mismatch: expected ${invoice.totalAmount}, found ${ledgerRow.amountMinor}.`,
          invoiceId: invoice.id,
          reference: expectedReference,
          createdAt: ledgerRow.createdAt,
        });
        ledgerIssues.push(issue);
        alertIssues.push(issue);
      } else {
        matchedCount += 1;
      }
    }

    if (!taxRecord) {
      missingTaxCount += 1;
      const issue = createIssue({
        code: "TAX_MISSING_AFTER_PAYMENT",
        level: "warning",
        title: "Tax sync missing after payment",
        detail: `Invoice ${invoice.invoiceNumber} has a successful payment but no linked tax record yet.`,
        invoiceId: invoice.id,
        reference: invoice.paymentReference ?? expectedReference,
        createdAt: invoice.updatedAt,
      });
      taxIssues.push(issue);
      alertIssues.push(issue);
    }
  }

  let orphanLedgerCount = 0;
  for (const row of ledgerTransactions) {
    if (!row.reference || row.direction !== "MONEY_IN") continue;

    const invoiceId = parseInvoiceIdFromReference(row.reference);
    if (!invoiceId) continue;

    const invoiceSuccessPayments = successfulPaymentsByInvoice.get(invoiceId) ?? [];
    if (invoiceSuccessPayments.length > 0) continue;

    orphanLedgerCount += 1;
    const issue = createIssue({
      code: "LEDGER_WITHOUT_PAYMENT",
      level: "warning",
      title: "Ledger entry without successful payment",
      detail: `Ledger entry ${row.reference} exists without a successful payment record.`,
      invoiceId,
      reference: row.reference,
      createdAt: row.createdAt,
    });
    ledgerIssues.push(issue);
    alertIssues.push(issue);
  }

  for (const payment of failedPayments.slice(0, 5)) {
    alertIssues.push(
      createIssue({
        code: "PAYMENT_FAILED",
        level: "warning",
        title: "Recent payment failure",
        detail: `Payment ${payment.reference} for invoice ${payment.invoice.invoiceNumber} is marked FAILED.`,
        invoiceId: payment.invoiceId,
        reference: payment.reference,
        createdAt: payment.createdAt,
      })
    );
  }

  const recentPayments = payments.slice(0, 10).map((payment) => ({
    id: payment.id,
    invoiceId: payment.invoiceId,
    invoiceNumber: payment.invoice.invoiceNumber,
    provider: payment.provider,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    reference: payment.reference,
    createdAt: payment.createdAt.toISOString(),
  }));

  const recentTax = paidInvoices.slice(0, 10).map((invoice) => {
    const taxRecord = taxRecordByInvoice.get(invoice.id) ?? null;

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmountMinor: invoice.totalAmount,
      paidAt: toIsoString(invoice.paidAt),
      taxRecordId: taxRecord?.id ?? null,
      taxRecordedAt: toIsoString(taxRecord?.updatedAt ?? taxRecord?.createdAt ?? null),
    };
  });

  const events: SystemMonitorEventRow[] = auditLogs.map((log) => {
    const metadata = parseMetadata(log.metadata);
    const status =
      typeof metadata?.status === "string"
        ? metadata.status
        : typeof metadata?.transactionStatus === "string"
          ? metadata.transactionStatus
          : null;
    const invoiceId =
      typeof metadata?.invoiceId === "number"
        ? metadata.invoiceId
        : typeof metadata?.invoiceId === "string"
          ? Number(metadata.invoiceId)
          : null;
    const reference =
      typeof metadata?.reference === "string"
        ? metadata.reference
        : typeof metadata?.paymentReference === "string"
          ? metadata.paymentReference
          : null;

    return {
      id: log.id,
      action: log.action,
      level: pickEventLevel(log.action, status),
      status,
      actorLabel: log.actor?.fullName ?? log.actor?.email ?? "System",
      createdAt: log.createdAt.toISOString(),
      summary: summarizeEvent(log.action, metadata),
      invoiceId: Number.isFinite(invoiceId) ? invoiceId : null,
      reference,
    };
  });

  const sortedLedgerIssues = sortIssues(ledgerIssues);
  const sortedTaxIssues = sortIssues(taxIssues);
  const sortedAlerts = sortIssues(alertIssues).slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspaceRecord.id,
      name: workspaceRecord.name,
    },
    payments: {
      health: resolveHealth({
        criticalCount: 0,
        warningCount: failedPayments.length + pendingPayments.length,
      }),
      total: payments.length,
      pending: pendingPayments.length,
      success: successfulPayments.length,
      failed: failedPayments.length,
      last24HoursSuccess: successfulPayments.filter(
        (payment) => payment.createdAt.getTime() >= last24HoursStart
      ).length,
      recent: recentPayments,
    },
    ledgerIntegrity: {
      health: resolveHealth({
        criticalCount:
          sortedLedgerIssues.filter((issue) => issue.level === "critical").length,
        warningCount:
          sortedLedgerIssues.filter((issue) => issue.level === "warning").length,
      }),
      checkedPayments: paidInvoicesWithSuccessfulPaymentCount,
      matchedCount,
      missingLedgerCount,
      orphanLedgerCount,
      duplicateLedgerCount,
      issues: sortedLedgerIssues.slice(0, 10),
    },
    taxSync: {
      health: resolveHealth({
        criticalCount: 0,
        warningCount: missingTaxCount,
      }),
      checkedPayments: paidInvoicesWithSuccessfulPaymentCount,
      syncedCount: Math.max(0, paidInvoicesWithSuccessfulPaymentCount - missingTaxCount),
      missingTaxCount,
      recent: recentTax,
      issues: sortedTaxIssues.slice(0, 10),
    },
    alerts: {
      health: resolveHealth({
        criticalCount: sortedAlerts.filter((issue) => issue.level === "critical").length,
        warningCount: sortedAlerts.filter((issue) => issue.level === "warning").length,
      }),
      total: alertIssues.length,
      items: sortedAlerts,
    },
    events,
  };
}
