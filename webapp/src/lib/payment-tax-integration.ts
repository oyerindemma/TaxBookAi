import "server-only";

import {
  PaymentIntegrationProvider,
  type PaymentTransactionCandidateKind,
  type Prisma,
  type VatTreatment,
  type WhtTreatment,
  type WorkspaceRole,
} from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getAppUrl, getPaystackServerConfig, hasPaystackServerConfig } from "@/lib/env";
import { confirmInvoicePaymentByReference, resolveInvoicePaymentTargetByReference } from "@/lib/invoice-payments";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import {
  getPaymentProviderAdapter,
  type NormalizedPaymentActivityEvent,
  type NormalizedPaymentSettlement,
} from "@/lib/payment-provider-adapters";
import type {
  PaymentIntegrationSettingsState,
  PaymentProviderConnectionSummary,
  PaymentProviderEventSummary,
  PaymentSettlementSummary,
  PaymentTransactionCandidateSummary,
} from "@/lib/payment-integration-types";
import { canManageWorkspace } from "@/lib/workspaces";

type ConnectionMutationInput = {
  workspaceId: number;
  actorUserId: number;
  payload: Record<string, unknown>;
};

type SyncInput = {
  workspaceId: number;
  actorUserId: number;
  days?: number | null;
};

type InvoiceMatchSuggestion = {
  id: number;
  invoiceNumber: string;
  score: number;
  reason: string;
};

type BankMatchSuggestion = {
  id: number;
  description: string;
  score: number;
  reason: string;
};

type StoredConnection = Prisma.PaymentProviderConnectionGetPayload<{
  include: {
    defaultClientBusiness: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

type StoredCandidate = Prisma.PaymentTransactionCandidateGetPayload<{
  include: {
    clientBusiness: {
      select: {
        id: true;
        name: true;
      };
    };
    invoice: {
      select: {
        id: true;
        invoiceNumber: true;
      };
    };
    suggestedInvoice: {
      select: {
        id: true;
        invoiceNumber: true;
      };
    };
    bankTransaction: {
      select: {
        id: true;
        description: true;
      };
    };
    suggestedBankTransaction: {
      select: {
        id: true;
        description: true;
      };
    };
  };
}>;

const DEFAULT_CONNECTION_LABEL = "Paystack payments";
const PAYMENT_PROVIDER = PaymentIntegrationProvider.PAYSTACK;
const CONNECTION_STATUSES = ["ACTIVE", "PAUSED", "ERROR"] as const;
const PAYMENT_INTEGRATION_OPTIONAL_SUPPORT = {
  tables: [
    "PaymentProviderConnection",
    "PaymentProviderEvent",
    "PaymentSettlement",
    "PaymentTransactionCandidate",
  ],
  columns: [
    "PaymentProviderConnection.workspaceId",
    "PaymentProviderConnection.provider",
    "PaymentProviderConnection.status",
    "PaymentProviderConnection.label",
    "PaymentProviderEvent.workspaceId",
    "PaymentProviderEvent.provider",
    "PaymentProviderEvent.occurredAt",
    "PaymentSettlement.workspaceId",
    "PaymentSettlement.provider",
    "PaymentSettlement.settlementDate",
    "PaymentTransactionCandidate.workspaceId",
    "PaymentTransactionCandidate.provider",
    "PaymentTransactionCandidate.status",
    "PaymentTransactionCandidate.occurredAt",
  ],
} as const;

const paymentIntegrationWarningKeys = new Set<string>();

function logPaymentIntegrationWarningOnce(
  key: string,
  message: string,
  metadata: Record<string, unknown>
) {
  if (paymentIntegrationWarningKeys.has(key)) {
    return;
  }

  paymentIntegrationWarningKeys.add(key);
  logWarn("payment-tax-integration", message, metadata);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const normalized = readString(value);
  return normalized || null;
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "on") return true;
    if (normalized === "false" || normalized === "off") return false;
  }
  return fallback;
}

function readInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildWebhookUrl() {
  return `${getAppUrl()}/api/payments/integrations/paystack/webhook`;
}

function getPaystackWebhookSecretConfigured() {
  try {
    return Boolean(getPaystackServerConfig().webhookSecret);
  } catch {
    return false;
  }
}

function buildEmptyPaymentIntegrationSettings(input: {
  role: WorkspaceRole;
  clientBusinesses?: PaymentIntegrationSettingsState["clientBusinesses"];
}): PaymentIntegrationSettingsState {
  return {
    access: {
      role: input.role,
      canManage: canManageWorkspace(input.role),
    },
    runtime: {
      webhookUrl: buildWebhookUrl(),
      paystackSecretConfigured: hasPaystackServerConfig(),
      paystackWebhookSecretConfigured: getPaystackWebhookSecretConfigured(),
      syncEnabled: hasPaystackServerConfig(),
    },
    metrics: {
      connectionConfigured: false,
      eventCount: 0,
      settlementCount: 0,
      candidateCount: 0,
      pendingCandidateCount: 0,
      reconciledCandidateCount: 0,
    },
    clientBusinesses: input.clientBusinesses ?? [],
    connection: null,
    recentEvents: [],
    recentSettlements: [],
    recentCandidates: [],
  };
}

function buildSettingsConnectionMetadata(input: StoredConnection) {
  return {
    id: input.id,
    provider: input.provider,
    status: input.status,
    label: input.label,
    defaultClientBusinessId: input.defaultClientBusinessId,
    defaultClientBusinessName: input.defaultClientBusiness?.name ?? null,
    webhookEnabled: input.webhookEnabled,
    autoSyncEnabled: input.autoSyncEnabled,
    autoCreateCandidates: input.autoCreateCandidates,
    settlementSyncWindowDays: input.settlementSyncWindowDays,
    notes: input.notes ?? null,
    lastWebhookAt: input.lastWebhookAt?.toISOString() ?? null,
    lastEventAt: input.lastEventAt?.toISOString() ?? null,
    lastSyncStartedAt: input.lastSyncStartedAt?.toISOString() ?? null,
    lastSyncCompletedAt: input.lastSyncCompletedAt?.toISOString() ?? null,
    lastSettlementSyncAt: input.lastSettlementSyncAt?.toISOString() ?? null,
    lastSyncError: input.lastSyncError ?? null,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  } satisfies PaymentProviderConnectionSummary;
}

function serializeEvent(
  event: Prisma.PaymentProviderEventGetPayload<{
    select: {
      id: true;
      provider: true;
      eventType: true;
      status: true;
      reference: true;
      amountMinor: true;
      feesAmountMinor: true;
      netAmountMinor: true;
      currency: true;
      occurredAt: true;
      invoiceId: true;
      paymentId: true;
      processingError: true;
    };
  }>
) {
  return {
    id: event.id,
    provider: event.provider,
    eventType: event.eventType,
    status: event.status,
    reference: event.reference ?? null,
    amountMinor: event.amountMinor ?? null,
    feesAmountMinor: event.feesAmountMinor ?? null,
    netAmountMinor: event.netAmountMinor ?? null,
    currency: event.currency,
    occurredAt: event.occurredAt.toISOString(),
    invoiceId: event.invoiceId ?? null,
    paymentId: event.paymentId ?? null,
    processingError: event.processingError ?? null,
  } satisfies PaymentProviderEventSummary;
}

function serializeSettlement(
  settlement: Prisma.PaymentSettlementGetPayload<{
    select: {
      id: true;
      provider: true;
      externalSettlementId: true;
      status: true;
      settlementDate: true;
      currency: true;
      grossAmountMinor: true;
      feesAmountMinor: true;
      netAmountMinor: true;
      transactionCount: true;
      bankCode: true;
      bankAccountName: true;
      bankAccountNumberMasked: true;
    };
  }>
) {
  return {
    id: settlement.id,
    provider: settlement.provider,
    externalSettlementId: settlement.externalSettlementId,
    status: settlement.status,
    settlementDate: settlement.settlementDate?.toISOString() ?? null,
    currency: settlement.currency,
    grossAmountMinor: settlement.grossAmountMinor,
    feesAmountMinor: settlement.feesAmountMinor,
    netAmountMinor: settlement.netAmountMinor,
    transactionCount: settlement.transactionCount,
    bankCode: settlement.bankCode ?? null,
    bankAccountName: settlement.bankAccountName ?? null,
    bankAccountNumberMasked: settlement.bankAccountNumberMasked ?? null,
  } satisfies PaymentSettlementSummary;
}

function serializeCandidate(candidate: StoredCandidate) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    status: candidate.status,
    externalReference: candidate.externalReference ?? null,
    description: candidate.description,
    counterpartyName: candidate.counterpartyName ?? null,
    amountMinor: candidate.amountMinor,
    feesAmountMinor: candidate.feesAmountMinor,
    netAmountMinor: candidate.netAmountMinor,
    currency: candidate.currency,
    occurredAt: candidate.occurredAt.toISOString(),
    confidenceScore: candidate.confidenceScore,
    suggestedVatTreatment: candidate.suggestedVatTreatment,
    suggestedWhtTreatment: candidate.suggestedWhtTreatment,
    taxSuggestionSource: candidate.taxSuggestionSource,
    taxSuggestionReason: candidate.taxSuggestionReason ?? null,
    clientBusinessId: candidate.clientBusinessId ?? null,
    clientBusinessName: candidate.clientBusiness?.name ?? null,
    invoiceId: candidate.invoiceId ?? null,
    invoiceNumber: candidate.invoice?.invoiceNumber ?? null,
    suggestedInvoiceId: candidate.suggestedInvoiceId ?? null,
    suggestedInvoiceNumber: candidate.suggestedInvoice?.invoiceNumber ?? null,
    invoiceMatchScore: candidate.invoiceMatchScore ?? null,
    bankTransactionId: candidate.bankTransactionId ?? null,
    bankTransactionDescription: candidate.bankTransaction?.description ?? null,
    suggestedBankTransactionId: candidate.suggestedBankTransactionId ?? null,
    suggestedBankTransactionDescription: candidate.suggestedBankTransaction?.description ?? null,
    bankMatchScore: candidate.bankMatchScore ?? null,
    reconciliationReason: candidate.reconciliationReason ?? null,
    reviewNotes: candidate.reviewNotes ?? null,
  } satisfies PaymentTransactionCandidateSummary;
}

function normalizeReference(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreDateDistance(left: Date, right: Date) {
  const differenceDays = Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
  if (differenceDays <= 1) return 0.22;
  if (differenceDays <= 3) return 0.16;
  if (differenceDays <= 7) return 0.1;
  if (differenceDays <= 14) return 0.04;
  return 0;
}

function confidenceFromScores(input: {
  invoiceMatchScore?: number | null;
  bankMatchScore?: number | null;
  kind: PaymentTransactionCandidateKind;
  taxSource: string;
}) {
  let score = input.kind === "SETTLEMENT_PAYOUT" ? 0.68 : 0.58;
  if (typeof input.invoiceMatchScore === "number") {
    score = Math.max(score, 0.4 + input.invoiceMatchScore * 0.55);
  }
  if (typeof input.bankMatchScore === "number") {
    score = Math.max(score, 0.38 + input.bankMatchScore * 0.52);
  }
  if (input.taxSource === "INVOICE") {
    score = Math.max(score, 0.91);
  }
  return Math.max(0.05, Math.min(0.99, Number(score.toFixed(2))));
}

function statusFromScores(input: {
  invoiceMatchScore?: number | null;
  bankMatchScore?: number | null;
}) {
  const bestScore = Math.max(input.invoiceMatchScore ?? 0, input.bankMatchScore ?? 0);
  return bestScore >= 0.88 ? "READY_TO_RECONCILE" : "PENDING_REVIEW";
}

function kindFromEvent(event: NormalizedPaymentActivityEvent): PaymentTransactionCandidateKind | null {
  if (event.eventType === "CHARGE_SUCCESS") return "CUSTOMER_PAYMENT";
  if (event.eventType === "TRANSFER_SUCCESS") return "SETTLEMENT_PAYOUT";
  return null;
}

async function ensureWorkspaceClientBusiness(workspaceId: number, clientBusinessId: number | null) {
  if (!clientBusinessId) return null;
  return prisma.clientBusiness.findFirst({
    where: {
      id: clientBusinessId,
      workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

async function ensureWorkspaceConnection(workspaceId: number) {
  return prisma.paymentProviderConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: PAYMENT_PROVIDER,
      },
    },
    update: {},
    create: {
      workspaceId,
      provider: PAYMENT_PROVIDER,
      label: DEFAULT_CONNECTION_LABEL,
    },
    include: {
      defaultClientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

async function resolveEventInvoiceTarget(
  workspaceId: number,
  event: NormalizedPaymentActivityEvent
) {
  const reference = event.reference;
  if (!reference) return null;

  const resolved = await resolveInvoicePaymentTargetByReference(reference);
  if (!resolved || resolved.workspaceId !== workspaceId) {
    return null;
  }

  return prisma.invoice.findFirst({
    where: {
      id: resolved.invoiceId,
      workspaceId,
    },
    select: {
      id: true,
      invoiceNumber: true,
      clientBusinessId: true,
      totalAmount: true,
      vatTreatment: true,
      whtTreatment: true,
      paymentReference: true,
      issueDate: true,
      dueDate: true,
      status: true,
    },
  });
}

async function findBestInvoiceMatch(input: {
  workspaceId: number;
  clientBusinessId: number | null;
  reference: string | null;
  amountMinor: number;
  occurredAt: Date;
}): Promise<InvoiceMatchSuggestion | null> {
  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId ?? undefined,
      OR: [
        input.reference
          ? {
              paymentReference: input.reference,
            }
          : undefined,
        {
          totalAmount: {
            gte: Math.max(0, input.amountMinor - 1000),
            lte: input.amountMinor + 1000,
          },
        },
      ].filter((value): value is NonNullable<typeof value> => Boolean(value)),
    },
    orderBy: [{ issueDate: "desc" }, { id: "desc" }],
    take: 12,
    select: {
      id: true,
      invoiceNumber: true,
      paymentReference: true,
      totalAmount: true,
      issueDate: true,
      dueDate: true,
      status: true,
      clientBusinessId: true,
    },
  });

  const normalizedReference = normalizeReference(input.reference);
  let best: InvoiceMatchSuggestion | null = null;

  for (const invoice of invoices) {
    let score = 0;
    const reasons: string[] = [];
    if (invoice.totalAmount === input.amountMinor) {
      score += 0.46;
      reasons.push("amount matched exactly");
    } else {
      const variance = Math.abs(invoice.totalAmount - input.amountMinor);
      if (variance <= 100) {
        score += 0.36;
        reasons.push("amount was within tolerance");
      } else if (variance <= 500) {
        score += 0.24;
      }
    }

    const invoiceReference = normalizeReference(invoice.paymentReference);
    if (normalizedReference && invoiceReference && normalizedReference === invoiceReference) {
      score += 0.42;
      reasons.push("payment reference matched");
    }

    score += scoreDateDistance(input.occurredAt, invoice.dueDate);
    score += scoreDateDistance(input.occurredAt, invoice.issueDate) / 2;

    if (invoice.status === "SENT" || invoice.status === "OVERDUE") {
      score += 0.06;
    }
    if (input.clientBusinessId && input.clientBusinessId === invoice.clientBusinessId) {
      score += 0.08;
    }

    if (!best || score > best.score) {
      best = {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        score: Number(Math.min(score, 0.99).toFixed(2)),
        reason:
          reasons.length > 0
            ? `Invoice suggestion: ${reasons.join(", ")}.`
            : "Invoice suggestion: recent invoice with close amount/date.",
      };
    }
  }

  if (best && best.score >= 0.45) {
    return best;
  }

  return null;
}

async function findBestBankTransactionMatch(input: {
  workspaceId: number;
  clientBusinessId: number | null;
  kind: PaymentTransactionCandidateKind;
  reference: string | null;
  description: string;
  amountMinor: number;
  occurredAt: Date;
}): Promise<BankMatchSuggestion | null> {
  const bankTransactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId ?? undefined,
      amount: {
        gte: Math.max(0, input.amountMinor - 1500),
        lte: input.amountMinor + 1500,
      },
      transactionDate: {
        gte: new Date(input.occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000),
        lte: new Date(input.occurredAt.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
      type: input.kind === "PROCESSOR_FEE" ? "DEBIT" : "CREDIT",
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      description: true,
      reference: true,
      amount: true,
      transactionDate: true,
      matchedInvoiceId: true,
    },
  });

  const normalizedReference = normalizeReference(input.reference);
  const normalizedDescription = normalizeReference(input.description);
  let best: BankMatchSuggestion | null = null;

  for (const transaction of bankTransactions) {
    let score = 0;
    const reasons: string[] = [];

    if (transaction.amount === input.amountMinor) {
      score += 0.52;
      reasons.push("amount matched exactly");
    } else {
      const variance = Math.abs(transaction.amount - input.amountMinor);
      if (variance <= 100) {
        score += 0.38;
        reasons.push("amount was within tolerance");
      } else if (variance <= 500) {
        score += 0.24;
      }
    }

    const transactionReference = normalizeReference(transaction.reference);
    const transactionDescription = normalizeReference(transaction.description);
    if (
      normalizedReference &&
      transactionReference &&
      (transactionReference.includes(normalizedReference) ||
        normalizedReference.includes(transactionReference))
    ) {
      score += 0.22;
      reasons.push("reference matched");
    }
    if (
      normalizedReference &&
      transactionDescription &&
      transactionDescription.includes(normalizedReference)
    ) {
      score += 0.12;
    }
    if (
      normalizedDescription &&
      transactionDescription &&
      transactionDescription.includes(normalizedDescription.slice(0, 18))
    ) {
      score += 0.08;
    }
    score += scoreDateDistance(input.occurredAt, transaction.transactionDate);

    if (!best || score > best.score) {
      best = {
        id: transaction.id,
        description: transaction.description,
        score: Number(Math.min(score, 0.99).toFixed(2)),
        reason:
          reasons.length > 0
            ? `Bank match suggestion: ${reasons.join(", ")}.`
            : "Bank match suggestion: close amount/date in bank activity.",
      };
    }
  }

  if (best && best.score >= 0.45) {
    return best;
  }

  return null;
}

async function suggestTaxTreatments(input: {
  kind: PaymentTransactionCandidateKind;
  invoice:
    | {
        id: number;
        invoiceNumber: string;
        vatTreatment: VatTreatment;
        whtTreatment: WhtTreatment;
      }
    | null
    | undefined;
  amountMinor: number;
}): Promise<{
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
  taxSuggestionSource: "NONE" | "INVOICE" | "PAYMENT_ACTIVITY" | "SETTLEMENT_RULE";
  taxSuggestionReason: string | null;
}> {
  if (input.invoice) {
    return {
      suggestedVatTreatment: input.invoice.vatTreatment,
      suggestedWhtTreatment: input.invoice.whtTreatment,
      taxSuggestionSource: "INVOICE",
      taxSuggestionReason: `Inherited tax treatment from invoice #${input.invoice.invoiceNumber}.`,
    };
  }

  if (input.kind === "SETTLEMENT_PAYOUT") {
    return {
      suggestedVatTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      taxSuggestionSource: "SETTLEMENT_RULE",
      taxSuggestionReason:
        "Settlement payouts move already-collected gateway funds into bank activity and should not create a fresh VAT or WHT position.",
    };
  }

  if (input.kind === "CUSTOMER_PAYMENT" && input.amountMinor > 0) {
    return {
      suggestedVatTreatment: "OUTPUT",
      suggestedWhtTreatment: "NONE",
      taxSuggestionSource: "PAYMENT_ACTIVITY",
      taxSuggestionReason:
        "Customer payment activity usually points to revenue already earned. Output VAT is suggested until the underlying invoice or service treatment is confirmed.",
    };
  }

  return {
    suggestedVatTreatment: "NONE",
    suggestedWhtTreatment: "NONE",
    taxSuggestionSource: "NONE",
    taxSuggestionReason: null,
  };
}

async function upsertCandidateFromEvent(input: {
  workspaceId: number;
  connectionId: number;
  connection: StoredConnection;
  eventId: number;
  event: NormalizedPaymentActivityEvent;
  invoice:
    | {
        id: number;
        invoiceNumber: string;
        clientBusinessId: number | null;
        totalAmount: number;
        vatTreatment: VatTreatment;
        whtTreatment: WhtTreatment;
      }
    | null;
  paymentId: number | null;
}) {
  const kind = kindFromEvent(input.event);
  if (!kind) {
    return null;
  }

  const resolvedClientBusinessId =
    input.invoice?.clientBusinessId ?? input.connection.defaultClientBusinessId ?? null;
  const invoiceMatch =
    input.invoice && input.invoice.id
      ? {
          id: input.invoice.id,
          invoiceNumber: input.invoice.invoiceNumber,
          score: 0.99,
          reason: "Invoice suggestion: payment reference matched an existing invoice payment link.",
        }
      : await findBestInvoiceMatch({
          workspaceId: input.workspaceId,
          clientBusinessId: resolvedClientBusinessId,
          reference: input.event.reference,
          amountMinor: input.event.amountMinor ?? 0,
          occurredAt: input.event.occurredAt,
        });

  const bankAmountMinor =
    kind === "SETTLEMENT_PAYOUT"
      ? input.event.netAmountMinor ?? input.event.amountMinor ?? 0
      : input.event.amountMinor ?? 0;
  const bankMatch = await findBestBankTransactionMatch({
    workspaceId: input.workspaceId,
    clientBusinessId: resolvedClientBusinessId,
    kind,
    reference: input.event.reference,
    description: input.event.description,
    amountMinor: bankAmountMinor,
    occurredAt: input.event.occurredAt,
  });

  const taxSuggestion = await suggestTaxTreatments({
    kind,
    invoice: input.invoice
      ? {
          id: input.invoice.id,
          invoiceNumber: input.invoice.invoiceNumber,
          vatTreatment: input.invoice.vatTreatment,
          whtTreatment: input.invoice.whtTreatment,
        }
      : null,
    amountMinor: input.event.amountMinor ?? 0,
  });

  const reconciliationReason = [invoiceMatch?.reason, bankMatch?.reason]
    .filter(Boolean)
    .join(" ");
  const candidateStatus = statusFromScores({
    invoiceMatchScore: invoiceMatch?.score ?? null,
    bankMatchScore: bankMatch?.score ?? null,
  });

  return prisma.paymentTransactionCandidate.upsert({
    where: {
      sourceEventId: input.eventId,
    },
    update: {
      connectionId: input.connectionId,
      clientBusinessId: resolvedClientBusinessId,
      invoiceId: input.invoice?.id ?? null,
      suggestedInvoiceId: input.invoice ? null : invoiceMatch?.id ?? null,
      paymentId: input.paymentId ?? null,
      suggestedBankTransactionId: bankMatch?.id ?? null,
      provider: PAYMENT_PROVIDER,
      kind,
      status: candidateStatus,
      externalReference: input.event.reference,
      description: input.event.description,
      counterpartyName: input.event.counterpartyName,
      amountMinor: input.event.amountMinor ?? 0,
      feesAmountMinor: input.event.feesAmountMinor ?? 0,
      netAmountMinor: input.event.netAmountMinor ?? input.event.amountMinor ?? 0,
      currency: input.event.currency,
      occurredAt: input.event.occurredAt,
      confidenceScore: confidenceFromScores({
        invoiceMatchScore: invoiceMatch?.score ?? null,
        bankMatchScore: bankMatch?.score ?? null,
        kind,
        taxSource: taxSuggestion.taxSuggestionSource,
      }),
      suggestedVatTreatment: taxSuggestion.suggestedVatTreatment,
      suggestedWhtTreatment: taxSuggestion.suggestedWhtTreatment,
      taxSuggestionSource: taxSuggestion.taxSuggestionSource,
      taxSuggestionReason: taxSuggestion.taxSuggestionReason,
      invoiceMatchScore: invoiceMatch?.score ?? null,
      bankMatchScore: bankMatch?.score ?? null,
      reconciliationReason: reconciliationReason || null,
      metadata: {
        source: "paystack_event",
      },
    },
    create: {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      clientBusinessId: resolvedClientBusinessId,
      invoiceId: input.invoice?.id ?? null,
      suggestedInvoiceId: input.invoice ? null : invoiceMatch?.id ?? null,
      paymentId: input.paymentId ?? null,
      suggestedBankTransactionId: bankMatch?.id ?? null,
      sourceEventId: input.eventId,
      provider: PAYMENT_PROVIDER,
      kind,
      status: candidateStatus,
      externalReference: input.event.reference,
      description: input.event.description,
      counterpartyName: input.event.counterpartyName,
      amountMinor: input.event.amountMinor ?? 0,
      feesAmountMinor: input.event.feesAmountMinor ?? 0,
      netAmountMinor: input.event.netAmountMinor ?? input.event.amountMinor ?? 0,
      currency: input.event.currency,
      occurredAt: input.event.occurredAt,
      confidenceScore: confidenceFromScores({
        invoiceMatchScore: invoiceMatch?.score ?? null,
        bankMatchScore: bankMatch?.score ?? null,
        kind,
        taxSource: taxSuggestion.taxSuggestionSource,
      }),
      suggestedVatTreatment: taxSuggestion.suggestedVatTreatment,
      suggestedWhtTreatment: taxSuggestion.suggestedWhtTreatment,
      taxSuggestionSource: taxSuggestion.taxSuggestionSource,
      taxSuggestionReason: taxSuggestion.taxSuggestionReason,
      invoiceMatchScore: invoiceMatch?.score ?? null,
      bankMatchScore: bankMatch?.score ?? null,
      reconciliationReason: reconciliationReason || null,
      metadata: {
        source: "paystack_event",
      },
    },
  });
}

async function upsertCandidateFromSettlement(input: {
  workspaceId: number;
  connectionId: number;
  connection: StoredConnection;
  settlementId: number;
  settlement: NormalizedPaymentSettlement;
}) {
  const resolvedClientBusinessId = input.connection.defaultClientBusinessId ?? null;
  const bankMatch = await findBestBankTransactionMatch({
    workspaceId: input.workspaceId,
    clientBusinessId: resolvedClientBusinessId,
    kind: "SETTLEMENT_PAYOUT",
    reference: input.settlement.externalSettlementId,
    description: input.settlement.description,
    amountMinor: input.settlement.netAmountMinor || input.settlement.grossAmountMinor,
    occurredAt: input.settlement.settlementDate ?? new Date(),
  });

  const taxSuggestion = await suggestTaxTreatments({
    kind: "SETTLEMENT_PAYOUT",
    invoice: null,
    amountMinor: input.settlement.netAmountMinor || input.settlement.grossAmountMinor,
  });

  return prisma.paymentTransactionCandidate.upsert({
    where: {
      sourceSettlementId: input.settlementId,
    },
    update: {
      connectionId: input.connectionId,
      clientBusinessId: resolvedClientBusinessId,
      suggestedBankTransactionId: bankMatch?.id ?? null,
      provider: PAYMENT_PROVIDER,
      kind: "SETTLEMENT_PAYOUT",
      status: statusFromScores({
        bankMatchScore: bankMatch?.score ?? null,
      }),
      externalReference: input.settlement.externalSettlementId,
      description: input.settlement.description,
      counterpartyName: input.settlement.bankAccountName,
      amountMinor: input.settlement.grossAmountMinor,
      feesAmountMinor: input.settlement.feesAmountMinor,
      netAmountMinor: input.settlement.netAmountMinor,
      currency: input.settlement.currency,
      occurredAt: input.settlement.settlementDate ?? new Date(),
      confidenceScore: confidenceFromScores({
        bankMatchScore: bankMatch?.score ?? null,
        kind: "SETTLEMENT_PAYOUT",
        taxSource: taxSuggestion.taxSuggestionSource,
      }),
      suggestedVatTreatment: taxSuggestion.suggestedVatTreatment,
      suggestedWhtTreatment: taxSuggestion.suggestedWhtTreatment,
      taxSuggestionSource: taxSuggestion.taxSuggestionSource,
      taxSuggestionReason: taxSuggestion.taxSuggestionReason,
      bankMatchScore: bankMatch?.score ?? null,
      reconciliationReason: bankMatch?.reason ?? null,
      metadata: {
        source: "paystack_settlement",
      },
    },
    create: {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      clientBusinessId: resolvedClientBusinessId,
      suggestedBankTransactionId: bankMatch?.id ?? null,
      sourceSettlementId: input.settlementId,
      provider: PAYMENT_PROVIDER,
      kind: "SETTLEMENT_PAYOUT",
      status: statusFromScores({
        bankMatchScore: bankMatch?.score ?? null,
      }),
      externalReference: input.settlement.externalSettlementId,
      description: input.settlement.description,
      counterpartyName: input.settlement.bankAccountName,
      amountMinor: input.settlement.grossAmountMinor,
      feesAmountMinor: input.settlement.feesAmountMinor,
      netAmountMinor: input.settlement.netAmountMinor,
      currency: input.settlement.currency,
      occurredAt: input.settlement.settlementDate ?? new Date(),
      confidenceScore: confidenceFromScores({
        bankMatchScore: bankMatch?.score ?? null,
        kind: "SETTLEMENT_PAYOUT",
        taxSource: taxSuggestion.taxSuggestionSource,
      }),
      suggestedVatTreatment: taxSuggestion.suggestedVatTreatment,
      suggestedWhtTreatment: taxSuggestion.suggestedWhtTreatment,
      taxSuggestionSource: taxSuggestion.taxSuggestionSource,
      taxSuggestionReason: taxSuggestion.taxSuggestionReason,
      bankMatchScore: bankMatch?.score ?? null,
      reconciliationReason: bankMatch?.reason ?? null,
      metadata: {
        source: "paystack_settlement",
      },
    },
  });
}

async function storeEventFromImport(input: {
  workspaceId: number;
  connection: StoredConnection;
  event: NormalizedPaymentActivityEvent;
  invoice:
    | {
        id: number;
        invoiceNumber: string;
        clientBusinessId: number | null;
        totalAmount: number;
        vatTreatment: VatTreatment;
        whtTreatment: WhtTreatment;
      }
    | null;
  paymentId: number | null;
  status: "PROCESSED" | "FAILED" | "IGNORED";
  processingError?: string | null;
}) {
  const storedEvent = await prisma.paymentProviderEvent.upsert({
    where: {
      connectionId_dedupeKey: {
        connectionId: input.connection.id,
        dedupeKey: input.event.dedupeKey,
      },
    },
    update: {
      invoiceId: input.invoice?.id ?? null,
      paymentId: input.paymentId ?? null,
      provider: PAYMENT_PROVIDER,
      eventType: input.event.eventType,
      status: input.status,
      externalEventId: input.event.externalEventId,
      reference: input.event.reference,
      amountMinor: input.event.amountMinor ?? undefined,
      feesAmountMinor: input.event.feesAmountMinor ?? undefined,
      netAmountMinor: input.event.netAmountMinor ?? undefined,
      currency: input.event.currency,
      occurredAt: input.event.occurredAt,
      payload: input.event.payload,
      processingError: input.processingError ?? null,
    },
    create: {
      workspaceId: input.workspaceId,
      connectionId: input.connection.id,
      invoiceId: input.invoice?.id ?? null,
      paymentId: input.paymentId ?? null,
      provider: PAYMENT_PROVIDER,
      eventType: input.event.eventType,
      status: input.status,
      dedupeKey: input.event.dedupeKey,
      externalEventId: input.event.externalEventId,
      reference: input.event.reference,
      amountMinor: input.event.amountMinor ?? null,
      feesAmountMinor: input.event.feesAmountMinor ?? null,
      netAmountMinor: input.event.netAmountMinor ?? null,
      currency: input.event.currency,
      occurredAt: input.event.occurredAt,
      payload: input.event.payload,
      processingError: input.processingError ?? null,
    },
    select: {
      id: true,
    },
  });

  await prisma.paymentProviderConnection.update({
    where: { id: input.connection.id },
    data: {
      lastWebhookAt: new Date(),
      lastEventAt: input.event.occurredAt,
      lastSyncError: input.status === "FAILED" ? input.processingError ?? null : null,
    },
  });

  if (input.connection.autoCreateCandidates && input.status !== "IGNORED") {
    await upsertCandidateFromEvent({
      workspaceId: input.workspaceId,
      connectionId: input.connection.id,
      connection: input.connection,
      eventId: storedEvent.id,
      event: input.event,
      invoice: input.invoice,
      paymentId: input.paymentId,
    });
  }

  return storedEvent.id;
}

async function storeSettlementFromImport(input: {
  workspaceId: number;
  connection: StoredConnection;
  settlement: NormalizedPaymentSettlement;
}) {
  const storedSettlement = await prisma.paymentSettlement.upsert({
    where: {
      connectionId_externalSettlementId: {
        connectionId: input.connection.id,
        externalSettlementId: input.settlement.externalSettlementId,
      },
    },
    update: {
      provider: PAYMENT_PROVIDER,
      status: input.settlement.status,
      settlementDate: input.settlement.settlementDate,
      currency: input.settlement.currency,
      grossAmountMinor: input.settlement.grossAmountMinor,
      feesAmountMinor: input.settlement.feesAmountMinor,
      netAmountMinor: input.settlement.netAmountMinor,
      transactionCount: input.settlement.transactionCount,
      bankCode: input.settlement.bankCode,
      bankAccountName: input.settlement.bankAccountName,
      bankAccountNumberMasked: input.settlement.bankAccountNumberMasked,
      payload: input.settlement.payload,
    },
    create: {
      workspaceId: input.workspaceId,
      connectionId: input.connection.id,
      provider: PAYMENT_PROVIDER,
      externalSettlementId: input.settlement.externalSettlementId,
      status: input.settlement.status,
      settlementDate: input.settlement.settlementDate,
      currency: input.settlement.currency,
      grossAmountMinor: input.settlement.grossAmountMinor,
      feesAmountMinor: input.settlement.feesAmountMinor,
      netAmountMinor: input.settlement.netAmountMinor,
      transactionCount: input.settlement.transactionCount,
      bankCode: input.settlement.bankCode,
      bankAccountName: input.settlement.bankAccountName,
      bankAccountNumberMasked: input.settlement.bankAccountNumberMasked,
      payload: input.settlement.payload,
    },
    select: {
      id: true,
    },
  });

  if (input.connection.autoCreateCandidates) {
    await upsertCandidateFromSettlement({
      workspaceId: input.workspaceId,
      connectionId: input.connection.id,
      connection: input.connection,
      settlementId: storedSettlement.id,
      settlement: input.settlement,
    });
  }

  return storedSettlement.id;
}

export async function getWorkspacePaymentIntegrationSettings(input: {
  workspaceId: number;
  role: WorkspaceRole;
}): Promise<PaymentIntegrationSettingsState> {
  const clientBusinesses = await prisma.clientBusiness
    .findMany({
      where: {
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultCurrency: true,
      },
    })
    .catch((error) => {
      logError(
        "payment-tax-integration",
        "Payment integration client business query failed; returning an empty client business list.",
        error,
        {
          workspaceId: input.workspaceId,
        }
      );
      return [] satisfies PaymentIntegrationSettingsState["clientBusinesses"];
    });

  const supportsOptionalModule = await hasPrismaDatabaseSupport(
    PAYMENT_INTEGRATION_OPTIONAL_SUPPORT
  );
  if (!supportsOptionalModule) {
    logPaymentIntegrationWarningOnce(
      "missing-optional-module-support",
      "Payment integration tables are unavailable in the current database; returning a not-configured state.",
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyPaymentIntegrationSettings({
      role: input.role,
      clientBusinesses,
    });
  }

  try {
    const [connection, recentEvents, recentSettlements, recentCandidates, metrics] =
      await Promise.all([
        prisma.paymentProviderConnection.findUnique({
          where: {
            workspaceId_provider: {
              workspaceId: input.workspaceId,
              provider: PAYMENT_PROVIDER,
            },
          },
          include: {
            defaultClientBusiness: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        prisma.paymentProviderEvent.findMany({
          where: {
            workspaceId: input.workspaceId,
            provider: PAYMENT_PROVIDER,
          },
          orderBy: { occurredAt: "desc" },
          take: 12,
          select: {
            id: true,
            provider: true,
            eventType: true,
            status: true,
            reference: true,
            amountMinor: true,
            feesAmountMinor: true,
            netAmountMinor: true,
            currency: true,
            occurredAt: true,
            invoiceId: true,
            paymentId: true,
            processingError: true,
          },
        }),
        prisma.paymentSettlement.findMany({
          where: {
            workspaceId: input.workspaceId,
            provider: PAYMENT_PROVIDER,
          },
          orderBy: [{ settlementDate: "desc" }, { id: "desc" }],
          take: 8,
          select: {
            id: true,
            provider: true,
            externalSettlementId: true,
            status: true,
            settlementDate: true,
            currency: true,
            grossAmountMinor: true,
            feesAmountMinor: true,
            netAmountMinor: true,
            transactionCount: true,
            bankCode: true,
            bankAccountName: true,
            bankAccountNumberMasked: true,
          },
        }),
        prisma.paymentTransactionCandidate.findMany({
          where: {
            workspaceId: input.workspaceId,
            provider: PAYMENT_PROVIDER,
          },
          orderBy: { occurredAt: "desc" },
          take: 12,
          include: {
            clientBusiness: {
              select: {
                id: true,
                name: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
              },
            },
            suggestedInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
              },
            },
            bankTransaction: {
              select: {
                id: true,
                description: true,
              },
            },
            suggestedBankTransaction: {
              select: {
                id: true,
                description: true,
              },
            },
          },
        }),
        Promise.all([
          prisma.paymentProviderEvent.count({
            where: {
              workspaceId: input.workspaceId,
              provider: PAYMENT_PROVIDER,
            },
          }),
          prisma.paymentSettlement.count({
            where: {
              workspaceId: input.workspaceId,
              provider: PAYMENT_PROVIDER,
            },
          }),
          prisma.paymentTransactionCandidate.count({
            where: {
              workspaceId: input.workspaceId,
              provider: PAYMENT_PROVIDER,
            },
          }),
          prisma.paymentTransactionCandidate.count({
            where: {
              workspaceId: input.workspaceId,
              provider: PAYMENT_PROVIDER,
              status: "PENDING_REVIEW",
            },
          }),
          prisma.paymentTransactionCandidate.count({
            where: {
              workspaceId: input.workspaceId,
              provider: PAYMENT_PROVIDER,
              status: "RECONCILED",
            },
          }),
        ]),
      ]);

    return {
      access: {
        role: input.role,
        canManage: canManageWorkspace(input.role),
      },
      runtime: {
        webhookUrl: buildWebhookUrl(),
        paystackSecretConfigured: hasPaystackServerConfig(),
        paystackWebhookSecretConfigured: getPaystackWebhookSecretConfigured(),
        syncEnabled: hasPaystackServerConfig(),
      },
      metrics: {
        connectionConfigured: Boolean(connection),
        eventCount: metrics[0],
        settlementCount: metrics[1],
        candidateCount: metrics[2],
        pendingCandidateCount: metrics[3],
        reconciledCandidateCount: metrics[4],
      },
      clientBusinesses,
      connection: connection ? buildSettingsConnectionMetadata(connection) : null,
      recentEvents: recentEvents.map((event) => serializeEvent(event)),
      recentSettlements: recentSettlements.map((settlement) => serializeSettlement(settlement)),
      recentCandidates: recentCandidates.map((candidate) => serializeCandidate(candidate)),
    };
  } catch (error) {
    if (
      isPrismaSchemaCompatibilityError(error, {
        tables: [...PAYMENT_INTEGRATION_OPTIONAL_SUPPORT.tables],
        columns: [...PAYMENT_INTEGRATION_OPTIONAL_SUPPORT.columns],
      })
    ) {
      logPaymentIntegrationWarningOnce(
        "runtime-optional-module-fallback",
        "Payment integration settings hit a database compatibility mismatch; returning a not-configured state.",
        {
          workspaceId: input.workspaceId,
        }
      );
    } else {
      logError(
        "payment-tax-integration",
        "Payment integration settings query failed; returning a not-configured state.",
        error,
        {
          workspaceId: input.workspaceId,
        }
      );
    }

    return buildEmptyPaymentIntegrationSettings({
      role: input.role,
      clientBusinesses,
    });
  }
}

export async function upsertWorkspacePaymentProviderConnection(input: ConnectionMutationInput) {
  const label = readString(input.payload.label) || DEFAULT_CONNECTION_LABEL;
  const statusValue = readString(input.payload.status).toUpperCase();
  const status = CONNECTION_STATUSES.includes(
    statusValue as (typeof CONNECTION_STATUSES)[number]
  )
    ? (statusValue as (typeof CONNECTION_STATUSES)[number])
    : "ACTIVE";
  const defaultClientBusinessId = readInteger(input.payload.defaultClientBusinessId);
  const defaultClientBusiness = await ensureWorkspaceClientBusiness(
    input.workspaceId,
    defaultClientBusinessId
  );
  if (defaultClientBusinessId && !defaultClientBusiness) {
    return {
      error: "Default client business was not found in this workspace.",
    } as const;
  }

  const connection = await prisma.paymentProviderConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: input.workspaceId,
        provider: PAYMENT_PROVIDER,
      },
    },
    update: {
      label,
      status,
      defaultClientBusinessId: defaultClientBusiness?.id ?? null,
      webhookEnabled: readBoolean(input.payload.webhookEnabled, true),
      autoSyncEnabled: readBoolean(input.payload.autoSyncEnabled, true),
      autoCreateCandidates: readBoolean(input.payload.autoCreateCandidates, true),
      settlementSyncWindowDays: Math.min(
        365,
        Math.max(1, readInteger(input.payload.settlementSyncWindowDays) ?? 30)
      ),
      notes: readOptionalString(input.payload.notes),
    },
    create: {
      workspaceId: input.workspaceId,
      provider: PAYMENT_PROVIDER,
      label,
      status,
      defaultClientBusinessId: defaultClientBusiness?.id ?? null,
      webhookEnabled: readBoolean(input.payload.webhookEnabled, true),
      autoSyncEnabled: readBoolean(input.payload.autoSyncEnabled, true),
      autoCreateCandidates: readBoolean(input.payload.autoCreateCandidates, true),
      settlementSyncWindowDays: Math.min(
        365,
        Math.max(1, readInteger(input.payload.settlementSyncWindowDays) ?? 30)
      ),
      notes: readOptionalString(input.payload.notes),
    },
    include: {
      defaultClientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "PAYMENT_PROVIDER_CONNECTION_UPSERTED",
    metadata: {
      provider: PAYMENT_PROVIDER,
      status: connection.status,
      connectionId: connection.id,
      defaultClientBusinessId: connection.defaultClientBusinessId,
      autoSyncEnabled: connection.autoSyncEnabled,
      autoCreateCandidates: connection.autoCreateCandidates,
      settlementSyncWindowDays: connection.settlementSyncWindowDays,
    },
  });

  return {
    connectionId: connection.id,
  } as const;
}

function extractWorkspaceIdFromMetadata(metadata: Record<string, unknown> | null) {
  const direct = readInteger(metadata?.workspaceId) ?? readInteger(metadata?.workspace_id);
  return direct && direct > 0 ? direct : null;
}

async function importPaymentEvent(input: {
  event: NormalizedPaymentActivityEvent;
  preferredWorkspaceId?: number | null;
  preferredInvoiceId?: number | null;
  preferredPaymentId?: number | null;
  autoConfirmInvoicePayment?: boolean;
}) {
  const workspaceId =
    input.preferredWorkspaceId ??
    extractWorkspaceIdFromMetadata(input.event.metadata) ??
    (input.event.reference
      ? (await resolveInvoicePaymentTargetByReference(input.event.reference))?.workspaceId ?? null
      : null);

  if (!workspaceId) {
    return {
      ignored: true,
      reason: "Workspace could not be resolved for payment activity.",
    } as const;
  }

  const connection = await ensureWorkspaceConnection(workspaceId);

  let paymentId = input.preferredPaymentId ?? null;
  let invoice =
    input.preferredInvoiceId !== null && input.preferredInvoiceId !== undefined
      ? await prisma.invoice.findFirst({
          where: {
            id: input.preferredInvoiceId,
            workspaceId,
          },
          select: {
            id: true,
            invoiceNumber: true,
            clientBusinessId: true,
            totalAmount: true,
            vatTreatment: true,
            whtTreatment: true,
          },
        })
      : await resolveEventInvoiceTarget(workspaceId, input.event);

  let processingError: string | null = null;
  let status: "PROCESSED" | "FAILED" | "IGNORED" = "PROCESSED";

  if (input.autoConfirmInvoicePayment && input.event.eventType === "CHARGE_SUCCESS" && input.event.reference) {
    const confirmation = await confirmInvoicePaymentByReference({
      paymentReference: input.event.reference,
      provider: "PAYSTACK",
      paidAt: input.event.occurredAt,
      amountKobo: input.event.amountMinor,
      currency: input.event.currency,
      eventId: input.event.externalEventId,
      paymentPayload: input.event.payload,
      providerTransactionId: input.event.externalEventId,
    });

    if ("error" in confirmation) {
      processingError = confirmation.error;
      status = "FAILED";
    } else {
      paymentId = confirmation.paymentId ?? paymentId;
      invoice = {
        id: confirmation.invoice.id,
        invoiceNumber: confirmation.invoice.invoiceNumber,
        clientBusinessId: confirmation.invoice.clientBusinessId ?? null,
        totalAmount: confirmation.invoice.totalAmount,
        vatTreatment: confirmation.invoice.vatTreatment,
        whtTreatment: confirmation.invoice.whtTreatment,
      };
    }
  }

  await storeEventFromImport({
    workspaceId,
    connection,
    event: input.event,
    invoice: invoice
      ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientBusinessId: invoice.clientBusinessId ?? null,
          totalAmount: invoice.totalAmount,
          vatTreatment: invoice.vatTreatment,
          whtTreatment: invoice.whtTreatment,
        }
      : null,
    paymentId,
    status,
    processingError,
  });

  return {
    ignored: false,
    workspaceId,
    failed: status === "FAILED",
  } as const;
}

export async function recordPaystackWebhookActivity(input: {
  rawBody: string;
  preferredWorkspaceId?: number | null;
  preferredInvoiceId?: number | null;
  preferredPaymentId?: number | null;
  autoConfirmInvoicePayment?: boolean;
}) {
  const adapter = getPaymentProviderAdapter(PAYMENT_PROVIDER);
  const payload = adapter.parseWebhook(input.rawBody);
  let processed = 0;
  let ignored = 0;
  let failed = 0;

  for (const event of payload.events) {
    const result = await importPaymentEvent({
      event,
      preferredWorkspaceId: input.preferredWorkspaceId ?? null,
      preferredInvoiceId: input.preferredInvoiceId ?? null,
      preferredPaymentId: input.preferredPaymentId ?? null,
      autoConfirmInvoicePayment: input.autoConfirmInvoicePayment ?? false,
    });

    if (result.ignored) {
      ignored += 1;
    } else if (result.failed) {
      failed += 1;
    } else {
      processed += 1;
    }
  }

  return {
    received: true,
    processed,
    ignored,
    failed,
  };
}

export async function handlePaystackPaymentIntegrationWebhook(input: {
  rawBody: string;
  signature: string | null | undefined;
}) {
  const adapter = getPaymentProviderAdapter(PAYMENT_PROVIDER);
  if (!adapter.verifyWebhookSignature(input.rawBody, input.signature)) {
    return {
      error: "Invalid Paystack signature",
      status: 401,
    } as const;
  }

  return recordPaystackWebhookActivity({
    rawBody: input.rawBody,
    autoConfirmInvoicePayment: true,
  });
}

export async function syncWorkspacePaystackIntegration(input: SyncInput) {
  if (!hasPaystackServerConfig()) {
    return {
      error: "Paystack runtime configuration is missing.",
    } as const;
  }

  const connection = await prisma.paymentProviderConnection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: input.workspaceId,
        provider: PAYMENT_PROVIDER,
      },
    },
    include: {
      defaultClientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!connection) {
    return {
      error: "Configure the Paystack connection before running a sync.",
    } as const;
  }

  const adapter = getPaymentProviderAdapter(PAYMENT_PROVIDER);
  const days = Math.min(90, Math.max(1, input.days ?? connection.settlementSyncWindowDays));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  await prisma.paymentProviderConnection.update({
    where: { id: connection.id },
    data: {
      lastSyncStartedAt: new Date(),
      lastSyncError: null,
    },
  });

  try {
    const [events, settlements] = await Promise.all([
      adapter.listRecentEvents({
        from,
        to,
      }),
      adapter.listSettlements({
        from,
        to,
      }),
    ]);

    let importedEventCount = 0;
    let failedEventCount = 0;

    for (const event of events) {
      const result = await importPaymentEvent({
        event,
        preferredWorkspaceId: input.workspaceId,
        autoConfirmInvoicePayment: false,
      });
      if (!result.ignored) {
        if (result.failed) {
          failedEventCount += 1;
        } else {
          importedEventCount += 1;
        }
      }
    }

    let importedSettlementCount = 0;
    for (const settlement of settlements) {
      await storeSettlementFromImport({
        workspaceId: input.workspaceId,
        connection,
        settlement,
      });
      importedSettlementCount += 1;
    }

    await prisma.paymentProviderConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncCompletedAt: new Date(),
        lastSettlementSyncAt: settlements.length > 0 ? new Date() : connection.lastSettlementSyncAt,
        lastEventAt:
          events.length > 0
            ? events
                .slice()
                .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0]
                ?.occurredAt ?? connection.lastEventAt
            : connection.lastEventAt,
        lastSyncError: failedEventCount > 0 ? `${failedEventCount} payment event(s) need review.` : null,
      },
    });

    await logAudit({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "PAYSTACK_PAYMENT_SYNC_COMPLETED",
      metadata: {
        from: from.toISOString(),
        to: to.toISOString(),
        importedEventCount,
        importedSettlementCount,
        failedEventCount,
      },
    });

    return {
      provider: PAYMENT_PROVIDER,
      importedEventCount,
      importedSettlementCount,
      failedEventCount,
      from: from.toISOString(),
      to: to.toISOString(),
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await prisma.paymentProviderConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncCompletedAt: new Date(),
        lastSyncError: message,
      },
    });

    await logAudit({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "PAYSTACK_PAYMENT_SYNC_FAILED",
      metadata: {
        message,
        days,
      },
    });

    return {
      error: message,
    } as const;
  }
}
