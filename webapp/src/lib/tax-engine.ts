import "server-only";

import type {
  FilingDraftStatus,
  Prisma,
  TaxCategory,
  TaxEvidenceStatus,
  TaxType,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { logError, logInfo } from "@/lib/logger";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { createTaxSnapshot } from "@/lib/tax-snapshot-service";
import { buildTaxSnapshotExplainableSummary } from "@/lib/tax-snapshot-calculation";
import type { TaxPeriodState } from "@/lib/tax-compliance";
import {
  estimateNigeriaCit,
  getNigeriaVatRate,
  getNigeriaWhtRate,
  NIGERIA_TAX_RULES_VERSION,
  resolveNigerianTaxOutputStatus,
  type NigerianTaxOutputStatus,
} from "@/lib/nigeria-tax-rules";

const TAX_ENGINE_RULES_VERSION = NIGERIA_TAX_RULES_VERSION;
const TAX_ENGINE_REFRESH_STALE_MS = 2 * 60_000;
const TAX_ENGINE_REFRESH_FAILURE_COOLDOWN_MS = 30_000;
type PrismaExecutor = Prisma.TransactionClient | typeof prisma;

type ReviewedFilter = "ALL" | "REVIEWED" | "UNREVIEWED" | "UNRESOLVED";
type TaxTypeFilter = "ALL" | TaxType;
type TaxDirection = "INCOME" | "EXPENSE";
type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH";
type SourceKind = "INVOICE" | "LEDGER_TRANSACTION" | "BOOKKEEPING_DRAFT" | "TAX_RECORD";
type VatDirection = "OUTPUT" | "INPUT";
type WhtDirection = "DEDUCTED" | "SUFFERED";
type TaxEngineRefreshStatus =
  | "READY"
  | "MISSING"
  | "STALE"
  | "QUEUED"
  | "PROCESSING"
  | "FAILED";
type TaxEngineRefreshBaseStatus = Exclude<
  TaxEngineRefreshStatus,
  "QUEUED" | "PROCESSING" | "FAILED"
>;
type TaxEngineQueuedRefreshState = {
  status: "QUEUED" | "PROCESSING" | "FAILED";
  promise: Promise<number> | null;
  queuedAt: number;
  startedAt: number | null;
  failedAt: number | null;
  errorMessage: string | null;
};

type TaxEngineInput = {
  workspaceId: number;
  clientBusinessId?: number | null;
  period: TaxPeriodState;
};

export type TaxSnapshotPeriodInput = {
  userId: number;
  workspaceId?: number | null;
  period?: string | null;
};

export type ComputedTaxSnapshot = {
  id: string;
  userId: number;
  workspaceId: number | null;
  period: string;
  version: number;
  totalIncome: number;
  totalExpense: number;
  taxableProfit: number;
  taxPayable: number;
  estimatedTax: number;
  transactionCount: number;
  categorizedCount: number;
  txCount: number;
  txChecksum: string;
  status: string;
  createdAt: Date;
};

export type DashboardTaxSnapshotSummary = {
  totalIncome: number;
  totalExpense: number;
  taxableProfit: number;
  taxPayable: number;
  estimatedTax: number;
  transactionCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
  isRoughEstimate: boolean;
  warnings: string[];
  assumptions: string[];
  status: string;
  version: number;
  createdAt: Date;
  periodCount: number;
};

const globalForTaxEngineRefresh = globalThis as unknown as {
  taxEngineRefreshQueue: Map<string, TaxEngineQueuedRefreshState> | undefined;
};

const taxEngineRefreshQueue =
  globalForTaxEngineRefresh.taxEngineRefreshQueue ??
  new Map<string, TaxEngineQueuedRefreshState>();

if (!globalForTaxEngineRefresh.taxEngineRefreshQueue) {
  globalForTaxEngineRefresh.taxEngineRefreshQueue = taxEngineRefreshQueue;
}

const INVOICE_TAX_SOURCE_SELECT = {
  id: true,
  clientBusinessId: true,
  issueDate: true,
  subtotal: true,
  taxAmount: true,
  totalAmount: true,
  vatTreatment: true,
  whtTreatment: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  filingPeriodKey: true,
  sourceDocumentNumber: true,
  invoiceNumber: true,
  notes: true,
  client: {
    select: {
      name: true,
      companyName: true,
      taxId: true,
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  taxRecord: {
    select: {
      id: true,
    },
  },
  items: {
    select: {
      description: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

const LEDGER_TRANSACTION_TAX_SOURCE_SELECT = {
  id: true,
  clientBusinessId: true,
  transactionDate: true,
  description: true,
  reference: true,
  direction: true,
  amountMinor: true,
  currency: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  vatTreatment: true,
  whtTreatment: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  filingPeriodKey: true,
  sourceDocumentNumber: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  vendor: {
    select: {
      name: true,
      taxIdentificationNumber: true,
    },
  },
  category: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.LedgerTransactionSelect;

const APPROVED_DRAFT_TAX_SOURCE_SELECT = {
  id: true,
  createdAt: true,
  proposedDate: true,
  approvedAt: true,
  description: true,
  reference: true,
  documentNumber: true,
  vendorName: true,
  suggestedCategoryName: true,
  direction: true,
  subtotalMinor: true,
  amountMinor: true,
  totalAmountMinor: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  currency: true,
  vatTreatment: true,
  whtTreatment: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  filingPeriodKey: true,
  vendor: {
    select: {
      name: true,
      taxIdentificationNumber: true,
    },
  },
  category: {
    select: {
      name: true,
    },
  },
  upload: {
    select: {
      id: true,
      fileName: true,
      clientBusinessId: true,
      clientBusiness: {
        select: {
          name: true,
          defaultCurrency: true,
        },
      },
    },
  },
} satisfies Prisma.BookkeepingDraftSelect;

const TAX_RECORD_TAX_SOURCE_SELECT = {
  id: true,
  clientBusinessId: true,
  invoiceId: true,
  occurredOn: true,
  description: true,
  kind: true,
  amountKobo: true,
  netAmount: true,
  computedTax: true,
  taxRate: true,
  currency: true,
  vatTreatment: true,
  whtTreatment: true,
  taxCategory: true,
  taxEvidenceStatus: true,
  filingPeriodKey: true,
  sourceDocumentNumber: true,
  vendorName: true,
  clientBusiness: {
    select: {
      name: true,
      defaultCurrency: true,
    },
  },
  category: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.TaxRecordSelect;

const SME_ESTIMATED_TAX_RATE = 0.3;

function getCurrentSnapshotPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getSnapshotPeriodBounds(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function minorToMajor(amountMinor: number) {
  return Math.round(amountMinor) / 100;
}

async function aggregateBankTransactionAmount(input: {
  workspaceId: number;
  period: string;
  type: "CREDIT" | "DEBIT";
}) {
  const periodBounds = getSnapshotPeriodBounds(input.period);

  const aggregate = await prisma.bankTransaction.aggregate({
    where: {
      workspaceId: input.workspaceId,
      type: input.type,
      ...(periodBounds
        ? {
            transactionDate: {
              gte: periodBounds.start,
              lt: periodBounds.end,
            },
          }
        : {}),
    },
    _sum: {
      amount: true,
    },
  });

  return Math.abs(aggregate._sum.amount ?? 0);
}

type EngineFilters = TaxEngineInput & {
  reviewed?: ReviewedFilter;
  taxType?: TaxTypeFilter;
};

type SourceFingerprintMap = Map<string, number>;
type TaxCategoryHistoryMaps = {
  counterparty: Map<string, TaxCategory>;
  categoryName: Map<string, TaxCategory>;
};

type SourceTaxSignal = {
  sourceKind: SourceKind;
  sourceRecordId: number;
  workspaceId: number;
  clientBusinessId: number | null;
  clientBusinessName: string | null;
  occurredOn: Date;
  description: string;
  counterpartyName: string | null;
  counterpartyTaxId: string | null;
  categoryName: string | null;
  direction: TaxDirection;
  amountMinor: number;
  subtotalMinor: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  whtRate: number;
  currency: string;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  taxCategory: TaxCategory | null;
  taxEvidenceStatus: TaxEvidenceStatus;
  filingPeriodKey: string | null;
  sourceDocumentNumber: string | null;
  sourceDocumentId: number | null;
  includeInCit: boolean;
  supportsVat: boolean;
  supportsWht: boolean;
  flags: string[];
};

type VatCandidate = {
  engineKey: string;
  workspaceId: number;
  clientBusinessId: number | null;
  sourceType: SourceKind;
  sourceRecordId: number;
  sourceDocumentId: number | null;
  invoiceId: number | null;
  ledgerTransactionId: number | null;
  bookkeepingDraftId: number | null;
  taxRecordId: number | null;
  bankTransactionId: number | null;
  sourceDocumentNumber: string | null;
  counterpartyName: string | null;
  taxCategory: TaxCategory | null;
  vatTreatment: VatTreatment;
  direction: VatDirection;
  basisAmountMinor: number;
  vatAmountMinor: number;
  totalAmountMinor: number | null;
  currency: string;
  confidence: number;
  flags: string[];
};

type WhtCandidate = {
  engineKey: string;
  workspaceId: number;
  clientBusinessId: number | null;
  sourceType: SourceKind;
  sourceRecordId: number;
  sourceDocumentId: number | null;
  invoiceId: number | null;
  ledgerTransactionId: number | null;
  bookkeepingDraftId: number | null;
  taxRecordId: number | null;
  bankTransactionId: number | null;
  sourceDocumentNumber: string | null;
  counterpartyName: string | null;
  counterpartyTaxId: string | null;
  taxCategory: TaxCategory | null;
  whtTreatment: WhtTreatment;
  direction: WhtDirection;
  basisAmountMinor: number;
  whtRate: number;
  whtAmountMinor: number;
  currency: string;
  confidence: number;
  flags: string[];
};

type CitScheduleRow = {
  label: string;
  amountMinor: number;
  direction: "INCOME" | "EXPENSE" | "ADD_BACK" | "DEDUCTION" | "PLACEHOLDER";
  note?: string;
};

type CitSummary = {
  accountingProfitMinor: number;
  addBacksMinor: number;
  deductionsMinor: number;
  taxAdjustedProfitMinor: number;
  annualTurnoverMinor: number;
  estimatedCitMinor: number;
  appliedRate: number;
  companyBand: string;
  rows: CitScheduleRow[];
  exceptions: string[];
  placeholders: string[];
};

type TaxAdjustmentInput = {
  taxType: TaxType;
  direction: "ADD_BACK" | "DEDUCTION" | "NEUTRAL";
  label: string;
  amountMinor: number;
  note: string | null;
  reason: string | null;
};

type TaxEngineLoadedInputs = {
  signals: SourceTaxSignal[];
  historyMaps: TaxCategoryHistoryMaps;
};

type TaxEnginePreparedInputs = {
  fallbackCurrency: string;
  signals: SourceTaxSignal[];
  vatCandidates: VatCandidate[];
  whtCandidates: WhtCandidate[];
  metrics: TaxEngineComputationMetrics;
};

type TaxEngineWorkspace = {
  id: number;
  businessProfile: {
    defaultCurrency: string | null;
  } | null;
};

type InvoiceTaxSourceRow = Prisma.InvoiceGetPayload<{
  select: typeof INVOICE_TAX_SOURCE_SELECT;
}>;

type LedgerTransactionTaxSourceRow = Prisma.LedgerTransactionGetPayload<{
  select: typeof LEDGER_TRANSACTION_TAX_SOURCE_SELECT;
}>;

type ApprovedDraftTaxSourceRow = Prisma.BookkeepingDraftGetPayload<{
  select: typeof APPROVED_DRAFT_TAX_SOURCE_SELECT;
}>;

type TaxRecordTaxSourceRow = Prisma.TaxRecordGetPayload<{
  select: typeof TAX_RECORD_TAX_SOURCE_SELECT;
}>;

type TaxEngineComputationMetrics = {
  vatExceptionCount: number;
  whtExceptionCount: number;
  outputVatMinor: number;
  inputVatMinor: number;
  whtDeductedMinor: number;
  whtSufferedMinor: number;
};

type TaxRecordReconcileStats = {
  staleDeletedCount: number;
  createdCount: number;
  updatedCount: number;
  totalCount: number;
};

type PersistedOverview = {
  period: {
    id: number;
    key: string;
    label: string;
    type: string;
    startDate: string;
    endDate: string;
    currency: string;
    status: string;
  };
  filters: {
    clientBusinessId: number | null;
    reviewed: ReviewedFilter;
    taxType: TaxTypeFilter;
  };
  refresh: {
    status: TaxEngineRefreshStatus;
    lastComputedAt: string | null;
    queuedAt: string | null;
    startedAt: string | null;
    failedAt: string | null;
    errorMessage: string | null;
  };
  clientBusinesses: Array<{
    id: number;
    name: string;
    defaultCurrency: string;
  }>;
  totals: {
    outputVatMinor: number;
    inputVatMinor: number;
    netVatMinor: number;
    whtDeductedMinor: number;
    whtSufferedMinor: number;
    accountingProfitMinor: number;
    addBacksMinor: number;
    deductionsMinor: number;
    taxAdjustedProfitMinor: number;
    estimatedCitMinor: number;
  };
  outputStatus: NigerianTaxOutputStatus;
  businesses: Array<{
    clientBusinessId: number | null;
    clientBusinessName: string;
    outputVatMinor: number;
    inputVatMinor: number;
    netVatMinor: number;
    whtDeductedMinor: number;
    whtSufferedMinor: number;
    recordCount: number;
  }>;
  vatBreakdownBySource: Array<{
    sourceType: string;
    outputVatMinor: number;
    inputVatMinor: number;
    netVatMinor: number;
    recordCount: number;
  }>;
  whtBreakdownByCounterparty: Array<{
    counterpartyName: string;
    direction: "DEDUCTED" | "SUFFERED" | "MIXED";
    deductedMinor: number;
    sufferedMinor: number;
    recordCount: number;
    missingCounterpartyTaxId: boolean;
  }>;
  whtBreakdownByCategory: Array<{
    taxCategory: string;
    deductedMinor: number;
    sufferedMinor: number;
    recordCount: number;
  }>;
  unresolvedSummary: {
    vat: number;
    wht: number;
    exceptions: number;
    total: number;
  };
  vatRows: Array<{
    id: number;
    sourceType: string;
    sourceRecordId: number | null;
    clientBusinessId: number | null;
    clientBusinessName: string | null;
    counterpartyName: string | null;
    direction: VatDirection;
    vatTreatment: VatTreatment;
    taxCategory: TaxCategory | null;
    basisAmountMinor: number;
    vatAmountMinor: number;
    totalAmountMinor: number | null;
    currency: string;
    sourceDocumentNumber: string | null;
    reviewed: boolean;
    reviewNote: string | null;
    occurredOn: string | null;
    flags: string[];
    evidenceCount: number;
  }>;
  whtRows: Array<{
    id: number;
    sourceType: string;
    sourceRecordId: number | null;
    clientBusinessId: number | null;
    clientBusinessName: string | null;
    counterpartyName: string | null;
    counterpartyTaxId: string | null;
    direction: WhtDirection;
    whtTreatment: WhtTreatment;
    taxCategory: TaxCategory | null;
    basisAmountMinor: number;
    whtRate: number;
    whtAmountMinor: number;
    currency: string;
    sourceDocumentNumber: string | null;
    reviewed: boolean;
    reviewNote: string | null;
    occurredOn: string | null;
    flags: string[];
    evidenceCount: number;
  }>;
  exceptions: Array<{
    taxType: TaxType;
    severity: ExceptionSeverity;
    sourceType: string;
    sourceRecordId: number | null;
    clientBusinessId: number | null;
    clientBusinessName: string | null;
    title: string;
    detail: string;
    reviewed: boolean;
  }>;
  filings: Array<{
    id: number;
    taxType: TaxType;
    status: FilingDraftStatus;
    outputStatus: NigerianTaxOutputStatus;
    exceptionCount: number;
    reference: string | null;
    readyAt: string | null;
    submittedAt: string | null;
  }>;
  computations: {
    VAT: {
      sourceCount: number;
      exceptionCount: number;
      outputVatMinor: number;
      inputVatMinor: number;
      netVatMinor: number;
    };
    WHT: {
      sourceCount: number;
      exceptionCount: number;
      whtDeductedMinor: number;
      whtSufferedMinor: number;
    };
    CIT: {
      sourceCount: number;
      exceptionCount: number;
      accountingProfitMinor: number;
      addBacksMinor: number;
      deductionsMinor: number;
      taxAdjustedProfitMinor: number;
      estimatedCitMinor: number;
      appliedRate: number;
      companyBand: string;
      rows: CitScheduleRow[];
      exceptions: string[];
      placeholders: string[];
    };
  };
};

function safeUpper(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizedText(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim()
    .toLowerCase();
}

function containsKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function roundRateAmount(amountMinor: number, rate: number) {
  return Math.round(amountMinor * (rate / 100));
}

function parsePayload<T>(payload?: string | null): T | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function toPayload(value: unknown) {
  return JSON.stringify(value);
}

function isEvidenceSatisfied(status: TaxEvidenceStatus, hasSourceDocument: boolean) {
  if (status === "VERIFIED" || status === "ATTACHED") return true;
  return hasSourceDocument;
}

function getPeriodBounds(period: TaxPeriodState) {
  const startDate = period.fromParam ? new Date(`${period.fromParam}T00:00:00.000Z`) : null;
  const endDate = period.toParam ? new Date(`${period.toParam}T23:59:59.999Z`) : null;
  return { startDate, endDate };
}

function getPeriodKey(period: TaxPeriodState, clientBusinessId?: number | null) {
  const suffix = clientBusinessId ? `business-${clientBusinessId}` : "workspace";
  if (period.mode === "month") {
    return `month:${period.monthInput}:${suffix}`;
  }
  if (period.mode === "quarter") {
    return `quarter:${period.yearInput}:q${period.quarterInput}:${suffix}`;
  }
  if (period.mode === "custom") {
    return `custom:${period.fromParam ?? "none"}:${period.toParam ?? "none"}:${suffix}`;
  }
  return `all:${suffix}`;
}

function getPeriodType(
  period: TaxPeriodState
): "MONTHLY" | "QUARTERLY" | "CUSTOM" | "ALL_TIME" {
  if (period.mode === "month") return "MONTHLY";
  if (period.mode === "quarter") return "QUARTERLY";
  if (period.mode === "custom") return "CUSTOM";
  return "ALL_TIME";
}

function resolveTaxPeriodRecordMeta(
  input: TaxEngineInput,
  fallbackCurrency: string
) {
  const { startDate, endDate } = getPeriodBounds(input.period);
  const now = new Date();

  return {
    periodKey: getPeriodKey(input.period, input.clientBusinessId),
    periodType: getPeriodType(input.period),
    periodStart:
      startDate ?? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
    periodEnd: endDate ?? now,
    year: startDate?.getUTCFullYear() ?? now.getUTCFullYear(),
    month:
      input.period.mode === "month"
        ? Number(input.period.monthInput.split("-")[1] ?? 0)
        : null,
    quarter:
      input.period.mode === "quarter"
        ? Number(input.period.quarterInput)
        : null,
    fallbackCurrency,
  };
}

function getTaxEngineRefreshKey(input: TaxEngineInput) {
  return `${input.workspaceId}:${getPeriodKey(input.period, input.clientBusinessId)}`;
}

function cleanupTaxEngineRefreshQueue(now = Date.now()) {
  for (const [key, entry] of taxEngineRefreshQueue.entries()) {
    if (
      entry.status === "FAILED" &&
      entry.failedAt &&
      now - entry.failedAt > TAX_ENGINE_REFRESH_FAILURE_COOLDOWN_MS
    ) {
      taxEngineRefreshQueue.delete(key);
    }
  }
}

function getQueuedTaxEngineRefresh(key: string) {
  cleanupTaxEngineRefreshQueue();
  return taxEngineRefreshQueue.get(key) ?? null;
}

function queueWorkspaceTaxEngineRefresh(
  input: TaxEngineInput,
  reason: string
) {
  const key = getTaxEngineRefreshKey(input);
  const now = Date.now();
  const existing = getQueuedTaxEngineRefresh(key);

  if (existing?.promise) {
    return existing;
  }

  if (
    existing?.status === "FAILED" &&
    existing.failedAt &&
    now - existing.failedAt < TAX_ENGINE_REFRESH_FAILURE_COOLDOWN_MS
  ) {
    return existing;
  }

  const state: TaxEngineQueuedRefreshState = {
    status: "QUEUED",
    promise: null,
    queuedAt: now,
    startedAt: null,
    failedAt: null,
    errorMessage: null,
  };
  const periodKey = getPeriodKey(input.period, input.clientBusinessId);
  const promise = (async () => {
    state.status = "PROCESSING";
    state.startedAt = Date.now();
    logInfo("tax-engine", "Refresh start", {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId ?? null,
      periodKey,
      reason,
    });

    try {
      const periodId = await syncWorkspaceTaxEngine(input);
      taxEngineRefreshQueue.delete(key);
      logInfo("tax-engine", "Refresh complete", {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        periodKey,
        periodId,
        reason,
      });
      return periodId;
    } catch (error) {
      state.status = "FAILED";
      state.promise = null;
      state.failedAt = Date.now();
      state.errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown tax engine refresh failure";
      logError("tax-engine", "Refresh failed", error, {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        periodKey,
        reason,
      });
      throw error;
    }
  })();

  state.promise = promise;
  taxEngineRefreshQueue.set(key, state);
  promise.catch(() => {});
  return state;
}

function buildTaxEngineRefreshSnapshot(input: {
  baseStatus: TaxEngineRefreshBaseStatus;
  lastComputedAt: Date | null;
  queuedRefresh: TaxEngineQueuedRefreshState | null;
}): PersistedOverview["refresh"] {
  const lastComputedAt = input.lastComputedAt?.toISOString() ?? null;

  if (input.queuedRefresh?.status === "QUEUED") {
    return {
      status: "QUEUED",
      lastComputedAt,
      queuedAt: new Date(input.queuedRefresh.queuedAt).toISOString(),
      startedAt: null,
      failedAt: null,
      errorMessage: null,
    };
  }

  if (input.queuedRefresh?.status === "PROCESSING") {
    return {
      status: "PROCESSING",
      lastComputedAt,
      queuedAt: new Date(input.queuedRefresh.queuedAt).toISOString(),
      startedAt: input.queuedRefresh.startedAt
        ? new Date(input.queuedRefresh.startedAt).toISOString()
        : null,
      failedAt: null,
      errorMessage: null,
    };
  }

  if (input.queuedRefresh?.status === "FAILED" && input.baseStatus !== "READY") {
    return {
      status: "FAILED",
      lastComputedAt,
      queuedAt: new Date(input.queuedRefresh.queuedAt).toISOString(),
      startedAt: input.queuedRefresh.startedAt
        ? new Date(input.queuedRefresh.startedAt).toISOString()
        : null,
      failedAt: input.queuedRefresh.failedAt
        ? new Date(input.queuedRefresh.failedAt).toISOString()
        : null,
      errorMessage: input.queuedRefresh.errorMessage,
    };
  }

  return {
    status: input.baseStatus,
    lastComputedAt,
    queuedAt: null,
    startedAt: null,
    failedAt: null,
    errorMessage: null,
  };
}

function inferTaxCategory(input: {
  explicit: TaxCategory | null;
  historyCategory?: TaxCategory | null;
  sourceKind: SourceKind;
  direction: TaxDirection;
  categoryName?: string | null;
  description?: string | null;
}) {
  if (input.explicit) return input.explicit;
  if (input.historyCategory) return input.historyCategory;
  const text = normalizedText(input.categoryName, input.description);
  if (containsKeyword(text, ["salary", "wages", "payroll", "staff"])) return "PAYROLL";
  if (containsKeyword(text, ["rent", "lease", "office space"])) return "RENT";
  if (containsKeyword(text, ["consult", "professional", "audit", "legal", "service fee"])) {
    return "PROFESSIONAL_SERVICE";
  }
  if (containsKeyword(text, ["asset", "equipment", "vehicle", "computer", "capital"])) {
    return "ASSET_PURCHASE";
  }
  if (containsKeyword(text, ["tax", "firs", "vat remittance", "wht remittance"])) {
    return "TAX_PAYMENT";
  }
  if (input.sourceKind === "INVOICE") {
    return containsKeyword(text, ["goods", "inventory", "stock", "sale of goods"])
      ? "SALES_GOODS"
      : "SALES_SERVICES";
  }
  if (input.direction === "INCOME") {
    return containsKeyword(text, ["goods", "inventory", "stock"])
      ? "SALES_GOODS"
      : "SALES_SERVICES";
  }
  if (containsKeyword(text, ["goods", "supplies", "inventory", "raw material"])) {
    return "PURCHASE_GOODS";
  }
  if (containsKeyword(text, ["service", "subscription", "software", "maintenance"])) {
    return "PURCHASE_SERVICES";
  }
  return input.direction === "EXPENSE" ? "OPERATING_EXPENSE" : "OTHER";
}

function recordHistoryCount(
  counts: Map<string, Map<TaxCategory, number>>,
  key: string,
  taxCategory: TaxCategory | null
) {
  if (!key || !taxCategory) return;
  const bucket = counts.get(key) ?? new Map<TaxCategory, number>();
  bucket.set(taxCategory, (bucket.get(taxCategory) ?? 0) + 1);
  counts.set(key, bucket);
}

function collapseHistoryCounts(
  counts: Map<string, Map<TaxCategory, number>>
): Map<string, TaxCategory> {
  const resolved = new Map<string, TaxCategory>();
  for (const [key, bucket] of counts.entries()) {
    const best = [...bucket.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    if (best) {
      resolved.set(key, best);
    }
  }
  return resolved;
}

function buildTaxCategoryHistoryMaps(input: {
  invoices: InvoiceTaxSourceRow[];
  ledgerTransactions: LedgerTransactionTaxSourceRow[];
  approvedDrafts: ApprovedDraftTaxSourceRow[];
  taxRecords: TaxRecordTaxSourceRow[];
}): TaxCategoryHistoryMaps {
  const counterpartyCounts = new Map<string, Map<TaxCategory, number>>();
  const categoryCounts = new Map<string, Map<TaxCategory, number>>();

  for (const invoice of input.invoices) {
    recordHistoryCount(
      counterpartyCounts,
      normalizedText(invoice.client.companyName ?? invoice.client.name),
      invoice.taxCategory
    );
  }

  for (const transaction of input.ledgerTransactions) {
    recordHistoryCount(
      counterpartyCounts,
      normalizedText(transaction.vendor?.name),
      transaction.taxCategory
    );
    recordHistoryCount(
      categoryCounts,
      normalizedText(transaction.category?.name),
      transaction.taxCategory
    );
  }

  for (const draft of input.approvedDrafts) {
    recordHistoryCount(
      counterpartyCounts,
      normalizedText(draft.vendor?.name ?? draft.vendorName),
      draft.taxCategory
    );
    recordHistoryCount(
      categoryCounts,
      normalizedText(draft.category?.name ?? draft.suggestedCategoryName),
      draft.taxCategory
    );
  }

  for (const record of input.taxRecords) {
    recordHistoryCount(
      counterpartyCounts,
      normalizedText(record.vendorName),
      record.taxCategory
    );
    recordHistoryCount(
      categoryCounts,
      normalizedText(record.category?.name),
      record.taxCategory
    );
  }

  return {
    counterparty: collapseHistoryCounts(counterpartyCounts),
    categoryName: collapseHistoryCounts(categoryCounts),
  };
}

function resolveHistoryCategory(
  signal: SourceTaxSignal,
  historyMaps: TaxCategoryHistoryMaps
) {
  return (
    historyMaps.counterparty.get(normalizedText(signal.counterpartyName)) ??
    historyMaps.categoryName.get(normalizedText(signal.categoryName)) ??
    null
  );
}

function inferVatTreatment(input: {
  explicit: VatTreatment;
  sourceKind: SourceKind;
  direction: TaxDirection;
  taxCategory: TaxCategory | null;
  amountMinor: number;
  vatAmountMinor: number;
}) {
  if (input.explicit !== "NONE") return input.explicit;
  if (input.vatAmountMinor > 0) {
    return input.direction === "INCOME" ? "OUTPUT" : "INPUT";
  }
  if (
    input.sourceKind === "INVOICE" &&
    input.amountMinor > 0 &&
    input.taxCategory !== "TAX_PAYMENT" &&
    input.taxCategory !== "PAYROLL"
  ) {
    return "OUTPUT";
  }
  return "NONE";
}

function inferWhtTreatment(input: {
  explicit: WhtTreatment;
  direction: TaxDirection;
  taxCategory: TaxCategory | null;
  whtAmountMinor: number;
}) {
  if (input.explicit !== "NONE") return input.explicit;
  if (input.whtAmountMinor > 0) {
    return input.direction === "EXPENSE" ? "PAYABLE" : "RECEIVABLE";
  }
  if (input.direction === "EXPENSE" && shouldExpectWht(input.taxCategory)) {
    return "PAYABLE";
  }
  return "NONE";
}

function shouldExpectWht(taxCategory: TaxCategory | null) {
  return (
    taxCategory === "PROFESSIONAL_SERVICE" ||
    taxCategory === "PURCHASE_SERVICES" ||
    taxCategory === "RENT"
  );
}

function inferExpectedWhtRate(taxCategory: TaxCategory | null, occurredOn?: Date | string | null) {
  return getNigeriaWhtRate(taxCategory, occurredOn);
}

function isVatSensitiveCategory(taxCategory: TaxCategory | null) {
  return !["PAYROLL", "TAX_PAYMENT", "OTHER"].includes(taxCategory ?? "OTHER");
}

function getDuplicateFingerprint(signal: SourceTaxSignal) {
  const dateKey = signal.occurredOn.toISOString().slice(0, 10);
  const counterparty = safeUpper(signal.counterpartyName) || "UNKNOWN";
  const docNumber = safeUpper(signal.sourceDocumentNumber) || "NO-DOC";
  return [
    signal.clientBusinessId ?? "workspace",
    dateKey,
    signal.amountMinor,
    counterparty,
    docNumber,
  ].join(":");
}

function buildVatFlags(signal: SourceTaxSignal, duplicates: SourceFingerprintMap) {
  const flags = [...signal.flags];
  const expectedVat = roundRateAmount(
    signal.subtotalMinor || signal.amountMinor,
    getNigeriaVatRate(signal.occurredOn)
  );
  const hasDoc = Boolean(signal.sourceDocumentNumber || signal.sourceDocumentId);
  const duplicateCount = duplicates.get(getDuplicateFingerprint(signal)) ?? 0;

  if (!isEvidenceSatisfied(signal.taxEvidenceStatus, hasDoc)) {
    flags.push("Missing supporting evidence");
  }
  if (
    signal.vatTreatment === "NONE" &&
    signal.supportsVat &&
    signal.amountMinor > 0 &&
    isVatSensitiveCategory(signal.taxCategory)
  ) {
    flags.push("Missing VAT treatment");
  }
  if (
    signal.vatTreatment !== "NONE" &&
    signal.vatTreatment !== "EXEMPT" &&
    signal.vatAmountMinor > 0 &&
    Math.abs(expectedVat - signal.vatAmountMinor) > 100
  ) {
    flags.push("Suspicious VAT math");
  }
  if (signal.vatTreatment === "EXEMPT") {
    flags.push("Exempt or zero-rated case needs review");
  }
  if (duplicateCount > 1) {
    flags.push("Possible duplicate tax source");
  }

  return Array.from(new Set(flags));
}

function buildWhtFlags(signal: SourceTaxSignal, duplicates: SourceFingerprintMap) {
  const flags = [...signal.flags];
  const hasDoc = Boolean(signal.sourceDocumentNumber || signal.sourceDocumentId);
  const duplicateCount = duplicates.get(getDuplicateFingerprint(signal)) ?? 0;
  const expectedRate = inferExpectedWhtRate(signal.taxCategory, signal.occurredOn);

  if (!isEvidenceSatisfied(signal.taxEvidenceStatus, hasDoc)) {
    flags.push("Missing supporting evidence");
  }
  if (signal.supportsWht && signal.whtTreatment === "NONE") {
    flags.push("Missing WHT treatment");
  }
  if (signal.supportsWht && !signal.counterpartyTaxId) {
    flags.push("Missing counterparty tax identity");
  }
  if (
    signal.whtTreatment !== "NONE" &&
    signal.whtAmountMinor > 0 &&
    signal.amountMinor > 0
  ) {
    const actualRate = Math.round((signal.whtAmountMinor / signal.amountMinor) * 1000) / 10;
    if (Math.abs(actualRate - expectedRate) > 2.5) {
      flags.push("Possible over or under withholding");
    }
  }
  if (duplicateCount > 1) {
    flags.push("Possible duplicate tax source");
  }

  return Array.from(new Set(flags));
}

function buildVatCandidate(
  signal: SourceTaxSignal,
  duplicates: SourceFingerprintMap,
  historyMaps: TaxCategoryHistoryMaps
): VatCandidate | null {
  const taxCategory = inferTaxCategory({
    explicit: signal.taxCategory,
    historyCategory: resolveHistoryCategory(signal, historyMaps),
    sourceKind: signal.sourceKind,
    direction: signal.direction,
    categoryName: signal.categoryName,
    description: signal.description,
  });
  const vatTreatment = inferVatTreatment({
    explicit: signal.vatTreatment,
    sourceKind: signal.sourceKind,
    direction: signal.direction,
    taxCategory,
    amountMinor: signal.amountMinor,
    vatAmountMinor: signal.vatAmountMinor,
  });
  const supportsVat =
    signal.vatAmountMinor > 0 ||
    signal.supportsVat ||
    (signal.sourceKind === "INVOICE" && signal.amountMinor > 0);
  if (!supportsVat && vatTreatment === "NONE") return null;

  const direction: VatDirection =
    vatTreatment === "INPUT" || signal.direction === "EXPENSE" ? "INPUT" : "OUTPUT";
  const basisAmountMinor = signal.subtotalMinor || signal.amountMinor;
  const vatRate = getNigeriaVatRate(signal.occurredOn);
  const vatAmountMinor =
    signal.vatAmountMinor > 0 ||
    vatTreatment === "NONE" ||
    vatTreatment === "EXEMPT"
      ? signal.vatAmountMinor
      : roundRateAmount(basisAmountMinor, vatRate);
  const confidence =
    signal.vatAmountMinor > 0 ? 0.95 : vatTreatment === "NONE" ? 0.55 : 0.72;

  return {
    engineKey: `vat:${signal.sourceKind}:${signal.sourceRecordId}:${direction}`,
    workspaceId: signal.workspaceId,
    clientBusinessId: signal.clientBusinessId,
    sourceType: signal.sourceKind,
    sourceRecordId: signal.sourceRecordId,
    sourceDocumentId: signal.sourceDocumentId,
    invoiceId: signal.sourceKind === "INVOICE" ? signal.sourceRecordId : null,
    ledgerTransactionId: signal.sourceKind === "LEDGER_TRANSACTION" ? signal.sourceRecordId : null,
    bookkeepingDraftId: signal.sourceKind === "BOOKKEEPING_DRAFT" ? signal.sourceRecordId : null,
    taxRecordId: signal.sourceKind === "TAX_RECORD" ? signal.sourceRecordId : null,
    bankTransactionId: null,
    sourceDocumentNumber: signal.sourceDocumentNumber,
    counterpartyName: signal.counterpartyName,
    taxCategory,
    vatTreatment,
    direction,
    basisAmountMinor,
    vatAmountMinor,
    totalAmountMinor: signal.amountMinor,
    currency: signal.currency,
    confidence,
    flags: buildVatFlags({ ...signal, taxCategory, vatTreatment }, duplicates),
  };
}

function buildWhtCandidate(
  signal: SourceTaxSignal,
  duplicates: SourceFingerprintMap,
  historyMaps: TaxCategoryHistoryMaps
): WhtCandidate | null {
  const taxCategory = inferTaxCategory({
    explicit: signal.taxCategory,
    historyCategory: resolveHistoryCategory(signal, historyMaps),
    sourceKind: signal.sourceKind,
    direction: signal.direction,
    categoryName: signal.categoryName,
    description: signal.description,
  });
  const supportsWht = signal.whtAmountMinor > 0 || signal.supportsWht || shouldExpectWht(taxCategory);
  const whtTreatment = inferWhtTreatment({
    explicit: signal.whtTreatment,
    direction: signal.direction,
    taxCategory,
    whtAmountMinor: signal.whtAmountMinor,
  });
  if (!supportsWht && whtTreatment === "NONE") return null;

  const direction: WhtDirection =
    whtTreatment === "RECEIVABLE"
      ? "SUFFERED"
      : whtTreatment === "PAYABLE"
        ? "DEDUCTED"
        : signal.direction === "EXPENSE"
          ? "DEDUCTED"
          : "SUFFERED";
  const basisAmountMinor = signal.subtotalMinor || signal.amountMinor;
  const inferredRate = inferExpectedWhtRate(taxCategory, signal.occurredOn);
  const inferredAmountMinor =
    signal.whtAmountMinor > 0
      ? signal.whtAmountMinor
      : whtTreatment !== "NONE" && basisAmountMinor > 0
        ? roundRateAmount(basisAmountMinor, inferredRate)
        : 0;
  const whtRate =
    signal.whtAmountMinor > 0 && basisAmountMinor > 0
      ? Math.round((signal.whtAmountMinor / basisAmountMinor) * 1000) / 10
      : inferredRate;
  const confidence =
    signal.whtAmountMinor > 0
      ? 0.95
      : inferredAmountMinor > 0
        ? 0.76
        : whtTreatment === "NONE"
          ? 0.45
          : 0.7;

  return {
    engineKey: `wht:${signal.sourceKind}:${signal.sourceRecordId}:${direction}`,
    workspaceId: signal.workspaceId,
    clientBusinessId: signal.clientBusinessId,
    sourceType: signal.sourceKind,
    sourceRecordId: signal.sourceRecordId,
    sourceDocumentId: signal.sourceDocumentId,
    invoiceId: signal.sourceKind === "INVOICE" ? signal.sourceRecordId : null,
    ledgerTransactionId: signal.sourceKind === "LEDGER_TRANSACTION" ? signal.sourceRecordId : null,
    bookkeepingDraftId: signal.sourceKind === "BOOKKEEPING_DRAFT" ? signal.sourceRecordId : null,
    taxRecordId: signal.sourceKind === "TAX_RECORD" ? signal.sourceRecordId : null,
    bankTransactionId: null,
    sourceDocumentNumber: signal.sourceDocumentNumber,
    counterpartyName: signal.counterpartyName,
    counterpartyTaxId: signal.counterpartyTaxId,
    taxCategory,
    whtTreatment,
    direction,
    basisAmountMinor,
    whtRate,
    whtAmountMinor: inferredAmountMinor,
    currency: signal.currency,
    confidence,
    flags: buildWhtFlags({ ...signal, taxCategory, whtTreatment }, duplicates),
  };
}

function getSourceDateRangeFilter(
  field: string,
  period: TaxPeriodState,
  clientBusinessId?: number | null
) {
  const { startDate, endDate } = getPeriodBounds(period);
  return {
    ...(clientBusinessId ? { clientBusinessId } : {}),
    ...(startDate || endDate
      ? {
          [field]: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };
}

async function loadTaxInputs(
  input: TaxEngineInput,
  fallbackCurrency: string
): Promise<TaxEngineLoadedInputs> {
  const { startDate, endDate } = getPeriodBounds(input.period);
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    workspaceId: input.workspaceId,
    ...(input.clientBusinessId ? { clientBusinessId: input.clientBusinessId } : {}),
    ...(startDate || endDate
      ? {
          issueDate: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    select: INVOICE_TAX_SOURCE_SELECT,
  });
  const ledgerTransactions = await prisma.ledgerTransaction.findMany({
    where: {
      clientBusiness: {
        workspaceId: input.workspaceId,
      },
      reviewStatus: "POSTED",
      ...getSourceDateRangeFilter("transactionDate", input.period, input.clientBusinessId),
    },
    select: LEDGER_TRANSACTION_TAX_SOURCE_SELECT,
  });
  const approvedDrafts = await prisma.bookkeepingDraft.findMany({
    where: {
      reviewStatus: "APPROVED",
      ledgerTransaction: null,
      upload: {
        workspaceId: input.workspaceId,
        ...(input.clientBusinessId ? { clientBusinessId: input.clientBusinessId } : {}),
      },
      ...(startDate || endDate
        ? {
            OR: [
              {
                approvedAt: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              },
              {
                proposedDate: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              },
            ],
          }
        : {}),
    },
    select: APPROVED_DRAFT_TAX_SOURCE_SELECT,
  });
  const taxRecords = await prisma.taxRecord.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.clientBusinessId ? { clientBusinessId: input.clientBusinessId } : {}),
      ...(startDate || endDate
        ? {
            occurredOn: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    },
    select: TAX_RECORD_TAX_SOURCE_SELECT,
  });

  const historyMaps = buildTaxCategoryHistoryMaps({
    invoices,
    ledgerTransactions,
    approvedDrafts,
    taxRecords,
  });

  const invoiceBackedTaxRecordIds = new Set(
    taxRecords.filter((record) => record.invoiceId).map((record) => record.id)
  );
  const signals: SourceTaxSignal[] = [];

  for (const invoice of invoices) {
    if (invoice.taxRecord?.id && invoiceBackedTaxRecordIds.has(invoice.taxRecord.id)) {
      continue;
    }
    const description = [
      `Invoice ${invoice.invoiceNumber}`,
      ...invoice.items.map((item) => item.description),
      invoice.notes ?? "",
    ]
      .filter(Boolean)
      .join(" - ");
    signals.push({
      sourceKind: "INVOICE",
      sourceRecordId: invoice.id,
      workspaceId: input.workspaceId,
      clientBusinessId: invoice.clientBusinessId ?? null,
      clientBusinessName: invoice.clientBusiness?.name ?? null,
      occurredOn: invoice.issueDate,
      description,
      counterpartyName: invoice.client.companyName ?? invoice.client.name,
      counterpartyTaxId: invoice.client.taxId ?? null,
      categoryName: null,
      direction: "INCOME",
      amountMinor: invoice.totalAmount,
      subtotalMinor: invoice.subtotal,
      vatAmountMinor: invoice.taxAmount,
      whtAmountMinor: 0,
      whtRate: 0,
      currency: invoice.clientBusiness?.defaultCurrency ?? fallbackCurrency,
      vatTreatment: invoice.vatTreatment,
      whtTreatment: invoice.whtTreatment,
      taxCategory: invoice.taxCategory,
      taxEvidenceStatus: invoice.taxEvidenceStatus,
      filingPeriodKey: invoice.filingPeriodKey,
      sourceDocumentNumber: invoice.sourceDocumentNumber ?? invoice.invoiceNumber,
      sourceDocumentId: invoice.id,
      includeInCit: false,
      supportsVat: true,
      supportsWht: invoice.whtTreatment !== "NONE",
      flags: invoice.clientBusinessId ? [] : ["Missing client business mapping"],
    });
  }

  for (const transaction of ledgerTransactions) {
    signals.push({
      sourceKind: "LEDGER_TRANSACTION",
      sourceRecordId: transaction.id,
      workspaceId: input.workspaceId,
      clientBusinessId: transaction.clientBusinessId,
      clientBusinessName: transaction.clientBusiness.name,
      occurredOn: transaction.transactionDate,
      description: transaction.description,
      counterpartyName: transaction.vendor?.name ?? null,
      counterpartyTaxId: transaction.vendor?.taxIdentificationNumber ?? null,
      categoryName: transaction.category?.name ?? "uncategorized",
      direction: transaction.direction === "MONEY_IN" ? "INCOME" : "EXPENSE",
      amountMinor: transaction.amountMinor,
      subtotalMinor: Math.max(0, transaction.amountMinor - transaction.vatAmountMinor),
      vatAmountMinor: transaction.vatAmountMinor,
      whtAmountMinor: transaction.whtAmountMinor,
      whtRate: 0,
      currency: transaction.currency || transaction.clientBusiness.defaultCurrency || fallbackCurrency,
      vatTreatment: transaction.vatTreatment,
      whtTreatment: transaction.whtTreatment,
      taxCategory: transaction.taxCategory,
      taxEvidenceStatus: transaction.taxEvidenceStatus,
      filingPeriodKey: transaction.filingPeriodKey,
      sourceDocumentNumber: transaction.sourceDocumentNumber ?? transaction.reference ?? null,
      sourceDocumentId: transaction.id,
      includeInCit: true,
      supportsVat: transaction.vatAmountMinor > 0,
      supportsWht:
        transaction.whtAmountMinor > 0 ||
        shouldExpectWht(transaction.taxCategory ?? null) ||
        transaction.whtTreatment !== "NONE",
      flags: [],
    });
  }

  for (const draft of approvedDrafts) {
    signals.push({
      sourceKind: "BOOKKEEPING_DRAFT",
      sourceRecordId: draft.id,
      workspaceId: input.workspaceId,
      clientBusinessId: draft.upload.clientBusinessId,
      clientBusinessName: draft.upload.clientBusiness?.name ?? null,
      occurredOn: draft.proposedDate ?? draft.approvedAt ?? draft.createdAt,
      description: draft.description ?? draft.reference ?? draft.upload.fileName,
      counterpartyName: draft.vendor?.name ?? draft.vendorName ?? null,
      counterpartyTaxId: draft.vendor?.taxIdentificationNumber ?? null,
      categoryName: draft.category?.name ?? draft.suggestedCategoryName ?? "uncategorized",
      direction: draft.direction === "MONEY_IN" ? "INCOME" : "EXPENSE",
      amountMinor: draft.totalAmountMinor ?? draft.amountMinor ?? 0,
      subtotalMinor:
        draft.subtotalMinor ??
        Math.max(0, (draft.totalAmountMinor ?? draft.amountMinor ?? 0) - draft.vatAmountMinor),
      vatAmountMinor: draft.vatAmountMinor,
      whtAmountMinor: draft.whtAmountMinor,
      whtRate: 0,
      currency:
        draft.currency || draft.upload.clientBusiness?.defaultCurrency || fallbackCurrency,
      vatTreatment: draft.vatTreatment,
      whtTreatment: draft.whtTreatment,
      taxCategory: draft.taxCategory,
      taxEvidenceStatus: draft.taxEvidenceStatus,
      filingPeriodKey: draft.filingPeriodKey,
      sourceDocumentNumber: draft.documentNumber ?? draft.reference ?? draft.upload.fileName,
      sourceDocumentId: draft.upload.id,
      includeInCit: true,
      supportsVat: draft.vatAmountMinor > 0,
      supportsWht:
        draft.whtAmountMinor > 0 ||
        shouldExpectWht(draft.taxCategory ?? null) ||
        draft.whtTreatment !== "NONE",
      flags: [],
    });
  }

  for (const record of taxRecords) {
    if (record.invoiceId) continue;
    signals.push({
      sourceKind: "TAX_RECORD",
      sourceRecordId: record.id,
      workspaceId: input.workspaceId,
      clientBusinessId: record.clientBusinessId ?? null,
      clientBusinessName: record.clientBusiness?.name ?? null,
      occurredOn: record.occurredOn,
      description: record.description ?? record.kind,
      counterpartyName: record.vendorName ?? null,
      counterpartyTaxId: null,
      categoryName: record.category?.name ?? "uncategorized",
      direction:
        record.kind.toUpperCase() === "INCOME" || record.vatTreatment === "OUTPUT"
          ? "INCOME"
          : "EXPENSE",
      amountMinor: record.amountKobo,
      subtotalMinor: record.netAmount > 0 ? record.netAmount : record.amountKobo,
      vatAmountMinor:
        record.kind.toUpperCase() === "VAT" || record.vatTreatment !== "NONE"
          ? record.computedTax
          : 0,
      whtAmountMinor:
        record.kind.toUpperCase() === "WHT" || record.whtTreatment !== "NONE"
          ? record.computedTax
          : 0,
      whtRate: record.taxRate,
      currency: record.currency || record.clientBusiness?.defaultCurrency || fallbackCurrency,
      vatTreatment: record.vatTreatment,
      whtTreatment: record.whtTreatment,
      taxCategory: record.taxCategory,
      taxEvidenceStatus: record.taxEvidenceStatus,
      filingPeriodKey: record.filingPeriodKey,
      sourceDocumentNumber: record.sourceDocumentNumber ?? null,
      sourceDocumentId: record.id,
      includeInCit:
        record.kind.toUpperCase() === "INCOME" || record.kind.toUpperCase() === "EXPENSE",
      supportsVat:
        record.kind.toUpperCase() === "VAT" ||
        record.vatTreatment !== "NONE" ||
        record.computedTax > 0,
      supportsWht:
        record.kind.toUpperCase() === "WHT" ||
        record.whtTreatment !== "NONE" ||
        record.computedTax > 0,
      flags: record.sourceDocumentNumber ? [] : ["Missing invoice number"],
    });
  }

  return {
    signals,
    historyMaps,
  };
}

function buildDuplicateIndex(signals: SourceTaxSignal[]) {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    const key = getDuplicateFingerprint(signal);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function buildCitSummary(input: {
  signals: SourceTaxSignal[];
  adjustments: Array<{
    taxType: TaxType;
    direction: "ADD_BACK" | "DEDUCTION" | "NEUTRAL";
    label: string;
    amountMinor: number;
    note: string | null;
    reason: string | null;
  }>;
}) {
  let incomeMinor = 0;
  let expenseMinor = 0;
  let autoAddBacksMinor = 0;
  const rows: CitScheduleRow[] = [];
  const exceptions: string[] = [];

  for (const signal of input.signals.filter((item) => item.includeInCit)) {
    const amount = signal.amountMinor;
    if (signal.direction === "INCOME") {
      incomeMinor += amount;
      rows.push({
        label: signal.description,
        amountMinor: amount,
        direction: "INCOME",
      });
      continue;
    }

    expenseMinor += amount;
    rows.push({
      label: signal.description,
      amountMinor: amount,
      direction: "EXPENSE",
    });

    const text = normalizedText(signal.description, signal.categoryName, signal.counterpartyName);
    if (containsKeyword(text, ["penalty", "fine", "sanction"])) {
      autoAddBacksMinor += amount;
      rows.push({
        label: "Regulatory penalties add-back",
        amountMinor: amount,
        direction: "ADD_BACK",
      });
    }
    if (containsKeyword(text, ["owner", "personal", "director"])) {
      autoAddBacksMinor += amount;
      rows.push({
        label: "Personal or owner benefit add-back",
        amountMinor: amount,
        direction: "ADD_BACK",
      });
    }
    if (containsKeyword(text, ["donation", "charity"])) {
      autoAddBacksMinor += amount;
      rows.push({
        label: "Donation add-back",
        amountMinor: amount,
        direction: "ADD_BACK",
      });
    }
  }

  const manualAddBacksMinor = input.adjustments
    .filter((adjustment) => adjustment.taxType === "CIT" && adjustment.direction === "ADD_BACK")
    .reduce((sum, adjustment) => sum + adjustment.amountMinor, 0);
  const manualDeductionsMinor = input.adjustments
    .filter((adjustment) => adjustment.taxType === "CIT" && adjustment.direction === "DEDUCTION")
    .reduce((sum, adjustment) => sum + adjustment.amountMinor, 0);

  for (const adjustment of input.adjustments.filter((value) => value.taxType === "CIT")) {
    rows.push({
      label: adjustment.label,
      amountMinor: adjustment.amountMinor,
      direction:
        adjustment.direction === "ADD_BACK"
          ? "ADD_BACK"
          : adjustment.direction === "DEDUCTION"
            ? "DEDUCTION"
            : "PLACEHOLDER",
      note: adjustment.note ?? adjustment.reason ?? undefined,
    });
  }

  const accountingProfitMinor = incomeMinor - expenseMinor;
  const addBacksMinor = autoAddBacksMinor + manualAddBacksMinor;
  const deductionsMinor = manualDeductionsMinor;
  const taxAdjustedProfitMinor = accountingProfitMinor + addBacksMinor - deductionsMinor;
  const annualTurnoverMinor = incomeMinor;
  const citEstimate = estimateNigeriaCit({
    taxAdjustedProfitMinor,
    annualTurnoverMinor,
  });
  const placeholders = [
    "Capital allowance review remains manual.",
    "Loss relief and prior-period utilization remain manual.",
    "Education tax and sector-specific rules remain outside this scaffold.",
    "CIT banding is estimated from turnover visible in the selected workspace period.",
  ];

  if (incomeMinor === 0) {
    exceptions.push("No income records were found for the selected period.");
  }
  if (expenseMinor === 0) {
    exceptions.push("No expense records were found for the selected period.");
  }
  if (rows.length === 0) {
    exceptions.push("CIT support schedule is empty for the selected scope.");
  }

  return {
    accountingProfitMinor,
    addBacksMinor,
    deductionsMinor,
    taxAdjustedProfitMinor,
    annualTurnoverMinor,
    estimatedCitMinor: citEstimate.estimatedCitMinor,
    appliedRate: citEstimate.rate,
    companyBand: citEstimate.band,
    rows,
    exceptions,
    placeholders,
  } satisfies CitSummary;
}

function pickFilingStatus(sourceCount: number): FilingDraftStatus {
  if (sourceCount === 0) return "DRAFT";
  return "READY_FOR_REVIEW";
}

function buildDraftSummaryPayload(input: {
  taxType: TaxType;
  sourceCount: number;
  exceptionCount: number;
  citSummary: CitSummary;
}) {
  if (input.taxType === "CIT") {
    return toPayload(input.citSummary);
  }

  return toPayload({
    sourceCount: input.sourceCount,
    exceptionCount: input.exceptionCount,
  });
}

function resolveSyncedFilingStatus(input: {
  currentStatus: FilingDraftStatus | null;
  sourceCount: number;
  exceptionCount: number;
  payloadChanged: boolean;
}) {
  const autoStatus = pickFilingStatus(input.sourceCount);

  if (!input.currentStatus) {
    return autoStatus;
  }

  if (
    input.currentStatus === "SUBMITTED" ||
    input.currentStatus === "SUBMITTED_MANUALLY" ||
    input.currentStatus === "CANCELLED"
  ) {
    return input.currentStatus;
  }

  if (
    (input.currentStatus === "APPROVED_FOR_SUBMISSION" ||
      input.currentStatus === "SUBMISSION_PENDING") &&
    input.payloadChanged
  ) {
    return "READY_FOR_REVIEW";
  }

  if (
    input.currentStatus === "APPROVED_FOR_SUBMISSION" ||
    input.currentStatus === "SUBMISSION_PENDING" ||
    input.currentStatus === "FAILED"
  ) {
    return input.currentStatus;
  }

  return autoStatus;
}

function mapFilingDraftOutputStatus(status: FilingDraftStatus): NigerianTaxOutputStatus {
  if (status === "SUBMITTED" || status === "SUBMITTED_MANUALLY") return "filed";
  if (status === "APPROVED_FOR_SUBMISSION" || status === "SUBMISSION_PENDING") {
    return "filing-ready";
  }
  if (status === "READY_FOR_REVIEW" || status === "FAILED") return "review-needed";
  return "estimate";
}

function buildTaxEnginePhaseError(phase: string, message: string) {
  return new Error(`[tax-engine:${phase}] ${message}`);
}

function assertValidWorkspaceId(workspaceId: number) {
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw buildTaxEnginePhaseError(
      "validate-inputs",
      "workspaceId must be a positive integer."
    );
  }
}

function assertValidTaxPeriodId(input: {
  taxPeriodId: number | null;
  workspaceId: number;
  clientBusinessId: number | null;
  periodKey: string;
  period: TaxPeriodState;
}) {
  if (typeof input.taxPeriodId === "number" && Number.isInteger(input.taxPeriodId) && input.taxPeriodId > 0) {
    return input.taxPeriodId;
  }

  logError(
    "tax-engine",
    "Missing taxPeriodId during tax engine sync",
    buildTaxEnginePhaseError(
      "validate-inputs",
      "taxPeriod.id was missing after create/update."
    ),
    {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      periodKey: input.periodKey,
      periodLabel: input.period.label,
      periodMode: input.period.mode,
    }
  );

  throw buildTaxEnginePhaseError(
    "validate-inputs",
    "Tax engine could not continue because the tax period ID is missing."
  );
}

function assertValidVatCandidate(candidate: VatCandidate) {
  if (!candidate.engineKey.trim()) {
    throw buildTaxEnginePhaseError(
      "build-vat-candidates",
      `Encountered a VAT candidate without an engine key for source ${candidate.sourceType}:${candidate.sourceRecordId}.`
    );
  }
  if (!Number.isInteger(candidate.sourceRecordId) || candidate.sourceRecordId <= 0) {
    throw buildTaxEnginePhaseError(
      "build-vat-candidates",
      `Encountered a VAT candidate with an invalid source record id for engine key ${candidate.engineKey}.`
    );
  }
  if (!candidate.currency.trim()) {
    throw buildTaxEnginePhaseError(
      "build-vat-candidates",
      `Encountered a VAT candidate without a currency for engine key ${candidate.engineKey}.`
    );
  }
}

function assertValidWhtCandidate(candidate: WhtCandidate) {
  if (!candidate.engineKey.trim()) {
    throw buildTaxEnginePhaseError(
      "build-wht-candidates",
      `Encountered a WHT candidate without an engine key for source ${candidate.sourceType}:${candidate.sourceRecordId}.`
    );
  }
  if (!Number.isInteger(candidate.sourceRecordId) || candidate.sourceRecordId <= 0) {
    throw buildTaxEnginePhaseError(
      "build-wht-candidates",
      `Encountered a WHT candidate with an invalid source record id for engine key ${candidate.engineKey}.`
    );
  }
  if (!candidate.currency.trim()) {
    throw buildTaxEnginePhaseError(
      "build-wht-candidates",
      `Encountered a WHT candidate without a currency for engine key ${candidate.engineKey}.`
    );
  }
}

async function loadTaxEngineWorkspaceSnapshot(
  workspaceId: number
): Promise<TaxEngineWorkspace> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      businessProfile: {
        select: {
          defaultCurrency: true,
        },
      },
    },
  });

  if (!workspace) {
    throw buildTaxEnginePhaseError(
      "validate-inputs",
      `Workspace ${workspaceId} was not found.`
    );
  }

  return workspace;
}

async function ensurePersistedTaxPeriod(input: TaxEngineInput) {
  assertValidWorkspaceId(input.workspaceId);
  const workspace = await loadTaxEngineWorkspaceSnapshot(input.workspaceId);
  const periodMeta = resolveTaxPeriodRecordMeta(
    input,
    workspace.businessProfile?.defaultCurrency ?? "NGN"
  );
  const createData = {
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    periodKey: periodMeta.periodKey,
    label: input.period.label,
    periodType: periodMeta.periodType,
    startDate: periodMeta.periodStart,
    endDate: periodMeta.periodEnd,
    year: periodMeta.year,
    month: periodMeta.month,
    quarter: periodMeta.quarter,
    currency: periodMeta.fallbackCurrency,
  } as const;

  if (typeof input.clientBusinessId === "number") {
    const taxPeriod = await prisma.taxPeriod.upsert({
      where: {
        workspaceId_clientBusinessId_periodKey: {
          workspaceId: input.workspaceId,
          clientBusinessId: input.clientBusinessId,
          periodKey: periodMeta.periodKey,
        },
      },
      update: {},
      create: createData,
      select: {
        id: true,
      },
    });

    return taxPeriod.id;
  }

  const existingPeriod = await prisma.taxPeriod.findFirst({
    where: {
      workspaceId: input.workspaceId,
      clientBusinessId: null,
      periodKey: periodMeta.periodKey,
    },
    select: {
      id: true,
    },
  });

  if (existingPeriod) {
    return existingPeriod.id;
  }

  try {
    const taxPeriod = await prisma.taxPeriod.create({
      data: createData,
      select: {
        id: true,
      },
    });
    return taxPeriod.id;
  } catch (error) {
    const racedPeriod = await prisma.taxPeriod.findFirst({
      where: {
        workspaceId: input.workspaceId,
        clientBusinessId: null,
        periodKey: periodMeta.periodKey,
      },
      select: {
        id: true,
      },
    });

    if (racedPeriod) {
      return racedPeriod.id;
    }

    throw error;
  }
}

async function ensureTaxPeriodRecord(
  tx: PrismaExecutor,
  input: TaxEngineInput,
  meta: {
    periodKey: string;
    periodType: ReturnType<typeof getPeriodType>;
    periodStart: Date;
    periodEnd: Date;
    year: number;
    month: number | null;
    quarter: number | null;
    fallbackCurrency: string;
  }
) {
  const existingPeriod = await tx.taxPeriod.findFirst({
    where: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId ?? null,
      periodKey: meta.periodKey,
    },
    select: {
      id: true,
      label: true,
      periodType: true,
      startDate: true,
      endDate: true,
      year: true,
      month: true,
      quarter: true,
      currency: true,
    },
  });

  const hasPeriodChanges = existingPeriod
    ? existingPeriod.label !== input.period.label ||
      existingPeriod.periodType !== meta.periodType ||
      existingPeriod.startDate.getTime() !== meta.periodStart.getTime() ||
      existingPeriod.endDate.getTime() !== meta.periodEnd.getTime() ||
      existingPeriod.year !== meta.year ||
      existingPeriod.month !== meta.month ||
      existingPeriod.quarter !== meta.quarter ||
      existingPeriod.currency !== meta.fallbackCurrency
    : false;

  const taxPeriod = !existingPeriod
    ? await tx.taxPeriod.create({
        data: {
          workspaceId: input.workspaceId,
          clientBusinessId: input.clientBusinessId ?? null,
          periodKey: meta.periodKey,
          label: input.period.label,
          periodType: meta.periodType,
          startDate: meta.periodStart,
          endDate: meta.periodEnd,
          year: meta.year,
          month: meta.month,
          quarter: meta.quarter,
          currency: meta.fallbackCurrency,
        },
      })
    : hasPeriodChanges
      ? await tx.taxPeriod.update({
          where: { id: existingPeriod.id },
          data: {
            label: input.period.label,
            periodType: meta.periodType,
            startDate: meta.periodStart,
            endDate: meta.periodEnd,
            year: meta.year,
            month: meta.month,
            quarter: meta.quarter,
            currency: meta.fallbackCurrency,
          },
        })
      : existingPeriod;

  const taxPeriodId = assertValidTaxPeriodId({
    taxPeriodId: taxPeriod?.id ?? null,
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    periodKey: meta.periodKey,
    period: input.period,
  });

  const persistedTaxPeriod = await tx.taxPeriod.findUnique({
    where: { id: taxPeriodId },
    select: { id: true, status: true },
  });

  if (!persistedTaxPeriod) {
    throw buildTaxEnginePhaseError(
      "validate-inputs",
      `Tax period ${taxPeriodId} was not found after create/update.`
    );
  }

  return {
    taxPeriodId,
  };
}

async function loadTaxAdjustments(
  tx: PrismaExecutor,
  input: TaxEngineInput,
  taxPeriodId: number
): Promise<TaxAdjustmentInput[]> {
  return tx.taxAdjustment.findMany({
    where: {
      workspaceId: input.workspaceId,
      taxPeriodId,
      ...(input.clientBusinessId ? { clientBusinessId: input.clientBusinessId } : {}),
    },
    select: {
      taxType: true,
      direction: true,
      label: true,
      amountMinor: true,
      note: true,
      reason: true,
    },
  });
}

async function prepareTaxEngineInputs(
  input: TaxEngineInput
): Promise<TaxEnginePreparedInputs> {
  assertValidWorkspaceId(input.workspaceId);
  const workspace = await loadTaxEngineWorkspaceSnapshot(input.workspaceId);
  const fallbackCurrency = workspace.businessProfile?.defaultCurrency ?? "NGN";
  const loadedInputs = await loadTaxInputs(input, fallbackCurrency);
  const vatCandidates = buildVatCandidates(loadedInputs);
  const whtCandidates = buildWhtCandidates(loadedInputs);
  const metrics = buildTaxComputationMetrics({
    vatCandidates,
    whtCandidates,
  });

  logInfo("tax-engine", "INPUTS PREPARED", {
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    signalCount: loadedInputs.signals.length,
    fallbackCurrency,
  });
  logInfo("tax-engine", "VAT CANDIDATES PREPARED", {
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    count: vatCandidates.length,
  });
  logInfo("tax-engine", "WHT CANDIDATES PREPARED", {
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    count: whtCandidates.length,
  });

  return {
    fallbackCurrency,
    signals: loadedInputs.signals,
    vatCandidates,
    whtCandidates,
    metrics,
  };
}

function buildVatCandidates(inputs: TaxEngineLoadedInputs) {
  const duplicates = buildDuplicateIndex(inputs.signals);
  return inputs.signals
    .map((signal) => buildVatCandidate(signal, duplicates, inputs.historyMaps))
    .filter((value): value is VatCandidate => Boolean(value))
    .sort((left, right) => left.engineKey.localeCompare(right.engineKey));
}

function buildWhtCandidates(inputs: TaxEngineLoadedInputs) {
  const duplicates = buildDuplicateIndex(inputs.signals);
  return inputs.signals
    .map((signal) => buildWhtCandidate(signal, duplicates, inputs.historyMaps))
    .filter((value): value is WhtCandidate => Boolean(value))
    .sort((left, right) => left.engineKey.localeCompare(right.engineKey));
}

async function reconcileVatRecords(
  tx: PrismaExecutor,
  taxPeriodId: number,
  vatCandidates: VatCandidate[]
): Promise<TaxRecordReconcileStats> {
  if (vatCandidates.length === 0) {
    const deleted = await tx.vATRecord.deleteMany({ where: { taxPeriodId } });
    return {
      staleDeletedCount: deleted.count,
      createdCount: 0,
      updatedCount: 0,
      totalCount: 0,
    };
  }

  const candidateEngineKeys = vatCandidates.map((row) => row.engineKey);
  const existingVatRows = await tx.vATRecord.findMany({
    where: {
      engineKey: {
        in: candidateEngineKeys,
      },
    },
    select: {
      engineKey: true,
    },
  });
  const staleDeleteResult = await tx.vATRecord.deleteMany({
    where: {
      taxPeriodId,
      engineKey: { notIn: candidateEngineKeys },
    },
  });
  const existingVatEngineKeys = new Set(existingVatRows.map((row) => row.engineKey));
  let createdCount = 0;
  let updatedCount = 0;

  for (const candidate of vatCandidates) {
    assertValidVatCandidate(candidate);
    const { flags, ...vatData } = candidate;

    if (existingVatEngineKeys.has(candidate.engineKey)) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    await tx.vATRecord.upsert({
      where: { engineKey: candidate.engineKey },
      create: {
        taxPeriodId,
        ...vatData,
        flagsPayload: toPayload(flags),
        reviewed: false,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNote: null,
      },
      update: {
        taxPeriodId,
        workspaceId: candidate.workspaceId,
        clientBusinessId: candidate.clientBusinessId,
        sourceType: candidate.sourceType,
        sourceRecordId: candidate.sourceRecordId,
        sourceDocumentId: candidate.sourceDocumentId,
        invoiceId: candidate.invoiceId,
        ledgerTransactionId: candidate.ledgerTransactionId,
        bookkeepingDraftId: candidate.bookkeepingDraftId,
        taxRecordId: candidate.taxRecordId,
        bankTransactionId: candidate.bankTransactionId,
        sourceDocumentNumber: candidate.sourceDocumentNumber,
        counterpartyName: candidate.counterpartyName,
        taxCategory: candidate.taxCategory,
        vatTreatment: candidate.vatTreatment,
        direction: candidate.direction,
        basisAmountMinor: candidate.basisAmountMinor,
        vatAmountMinor: candidate.vatAmountMinor,
        totalAmountMinor: candidate.totalAmountMinor,
        currency: candidate.currency,
        confidence: candidate.confidence,
        flagsPayload: toPayload(flags),
      },
    });
  }

  return {
    staleDeletedCount: staleDeleteResult.count,
    createdCount,
    updatedCount,
    totalCount: vatCandidates.length,
  };
}

async function reconcileWhtRecords(
  tx: PrismaExecutor,
  taxPeriodId: number,
  whtCandidates: WhtCandidate[]
): Promise<TaxRecordReconcileStats> {
  if (whtCandidates.length === 0) {
    const deleted = await tx.wHTRecord.deleteMany({ where: { taxPeriodId } });
    return {
      staleDeletedCount: deleted.count,
      createdCount: 0,
      updatedCount: 0,
      totalCount: 0,
    };
  }

  const candidateEngineKeys = whtCandidates.map((row) => row.engineKey);
  const existingWhtRows = await tx.wHTRecord.findMany({
    where: {
      engineKey: {
        in: candidateEngineKeys,
      },
    },
    select: {
      engineKey: true,
    },
  });
  const staleDeleteResult = await tx.wHTRecord.deleteMany({
    where: {
      taxPeriodId,
      engineKey: { notIn: candidateEngineKeys },
    },
  });
  const existingWhtEngineKeys = new Set(existingWhtRows.map((row) => row.engineKey));
  let createdCount = 0;
  let updatedCount = 0;

  for (const candidate of whtCandidates) {
    assertValidWhtCandidate(candidate);
    const { flags, ...whtData } = candidate;

    if (existingWhtEngineKeys.has(candidate.engineKey)) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    await tx.wHTRecord.upsert({
      where: { engineKey: candidate.engineKey },
      create: {
        taxPeriodId,
        ...whtData,
        flagsPayload: toPayload(flags),
        reviewed: false,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNote: null,
      },
      update: {
        taxPeriodId,
        workspaceId: candidate.workspaceId,
        clientBusinessId: candidate.clientBusinessId,
        sourceType: candidate.sourceType,
        sourceRecordId: candidate.sourceRecordId,
        sourceDocumentId: candidate.sourceDocumentId,
        invoiceId: candidate.invoiceId,
        ledgerTransactionId: candidate.ledgerTransactionId,
        bookkeepingDraftId: candidate.bookkeepingDraftId,
        taxRecordId: candidate.taxRecordId,
        bankTransactionId: candidate.bankTransactionId,
        sourceDocumentNumber: candidate.sourceDocumentNumber,
        counterpartyName: candidate.counterpartyName,
        counterpartyTaxId: candidate.counterpartyTaxId,
        taxCategory: candidate.taxCategory,
        whtTreatment: candidate.whtTreatment,
        direction: candidate.direction,
        basisAmountMinor: candidate.basisAmountMinor,
        whtRate: candidate.whtRate,
        whtAmountMinor: candidate.whtAmountMinor,
        currency: candidate.currency,
        confidence: candidate.confidence,
        flagsPayload: toPayload(flags),
      },
    });
  }

  return {
    staleDeletedCount: staleDeleteResult.count,
    createdCount,
    updatedCount,
    totalCount: whtCandidates.length,
  };
}

function buildTaxComputationMetrics(input: {
  vatCandidates: VatCandidate[];
  whtCandidates: WhtCandidate[];
}) {
  return {
    vatExceptionCount: input.vatCandidates.reduce(
      (count, candidate) => count + (candidate.flags.length > 0 ? 1 : 0),
      0
    ),
    whtExceptionCount: input.whtCandidates.reduce(
      (count, candidate) => count + (candidate.flags.length > 0 ? 1 : 0),
      0
    ),
    outputVatMinor: input.vatCandidates
      .filter((row) => row.direction === "OUTPUT")
      .reduce((sum, row) => sum + row.vatAmountMinor, 0),
    inputVatMinor: input.vatCandidates
      .filter((row) => row.direction === "INPUT")
      .reduce((sum, row) => sum + row.vatAmountMinor, 0),
    whtDeductedMinor: input.whtCandidates
      .filter((row) => row.direction === "DEDUCTED")
      .reduce((sum, row) => sum + row.whtAmountMinor, 0),
    whtSufferedMinor: input.whtCandidates
      .filter((row) => row.direction === "SUFFERED")
      .reduce((sum, row) => sum + row.whtAmountMinor, 0),
  } satisfies TaxEngineComputationMetrics;
}

async function persistTaxComputation(
  tx: PrismaExecutor,
  input: {
    workspaceId: number;
    clientBusinessId: number | null;
    taxPeriodId: number;
    taxType: TaxType;
    status: "DRAFT" | "REVIEW_READY" | "FINALIZED";
    currency: string;
    sourceCount: number;
    exceptionCount: number;
    summaryPayload: string;
    outputVatMinor?: number;
    inputVatMinor?: number;
    netVatMinor?: number;
    whtDeductedMinor?: number;
    whtSufferedMinor?: number;
    accountingProfitMinor?: number;
    addBacksMinor?: number;
    deductionsMinor?: number;
    taxAdjustedProfitMinor?: number;
  }
) {
  await tx.taxComputation.upsert({
    where: {
      taxPeriodId_taxType: {
        taxPeriodId: input.taxPeriodId,
        taxType: input.taxType,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      taxPeriodId: input.taxPeriodId,
      taxType: input.taxType,
      status: input.status,
      currency: input.currency,
      sourceCount: input.sourceCount,
      exceptionCount: input.exceptionCount,
      outputVatMinor: input.outputVatMinor ?? 0,
      inputVatMinor: input.inputVatMinor ?? 0,
      netVatMinor: input.netVatMinor ?? 0,
      whtDeductedMinor: input.whtDeductedMinor ?? 0,
      whtSufferedMinor: input.whtSufferedMinor ?? 0,
      accountingProfitMinor: input.accountingProfitMinor ?? 0,
      addBacksMinor: input.addBacksMinor ?? 0,
      deductionsMinor: input.deductionsMinor ?? 0,
      taxAdjustedProfitMinor: input.taxAdjustedProfitMinor ?? 0,
      rulesVersion: TAX_ENGINE_RULES_VERSION,
      summaryPayload: input.summaryPayload,
    },
    update: {
      status: input.status,
      currency: input.currency,
      sourceCount: input.sourceCount,
      exceptionCount: input.exceptionCount,
      outputVatMinor: input.outputVatMinor ?? 0,
      inputVatMinor: input.inputVatMinor ?? 0,
      netVatMinor: input.netVatMinor ?? 0,
      whtDeductedMinor: input.whtDeductedMinor ?? 0,
      whtSufferedMinor: input.whtSufferedMinor ?? 0,
      accountingProfitMinor: input.accountingProfitMinor ?? 0,
      addBacksMinor: input.addBacksMinor ?? 0,
      deductionsMinor: input.deductionsMinor ?? 0,
      taxAdjustedProfitMinor: input.taxAdjustedProfitMinor ?? 0,
      rulesVersion: TAX_ENGINE_RULES_VERSION,
      summaryPayload: input.summaryPayload,
      computedAt: new Date(),
    },
  });
}

async function syncWorkspaceTaxEngine(input: TaxEngineInput) {
  const periodKey = getPeriodKey(input.period, input.clientBusinessId);
  let preparedInputs: TaxEnginePreparedInputs;

  try {
    preparedInputs = await prepareTaxEngineInputs(input);
  } catch (error) {
    logError("tax-engine", "Tax engine input preparation failed", error, {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId ?? null,
      periodKey,
      phase: "prepare-inputs",
    });
    throw error;
  }

  return await prisma.$transaction(async (tx) => {
    let phase = "tx-start";

    try {
      logInfo("tax-engine", "TX START", {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        periodKey,
      });

      phase = "validate-inputs";
      assertValidWorkspaceId(input.workspaceId);
      const periodMeta = resolveTaxPeriodRecordMeta(
        input,
        preparedInputs.fallbackCurrency
      );
      const { taxPeriodId } = await ensureTaxPeriodRecord(tx, input, {
        ...periodMeta,
      });

      phase = "load-adjustments";
      const adjustments = await loadTaxAdjustments(tx, input, taxPeriodId);
      logInfo("tax-engine", "INPUTS LOADED", {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        taxPeriodId,
        signalCount: preparedInputs.signals.length,
        adjustmentCount: adjustments.length,
      });

      phase = "build-vat-candidates";
      logInfo("tax-engine", "VAT CANDIDATE COUNT", {
        taxPeriodId,
        count: preparedInputs.vatCandidates.length,
      });

      phase = "build-wht-candidates";
      logInfo("tax-engine", "WHT CANDIDATE COUNT", {
        taxPeriodId,
        count: preparedInputs.whtCandidates.length,
      });

      const citSummary = buildCitSummary({
        signals: preparedInputs.signals,
        adjustments,
      });

      phase = "reconcile-vat";
      const vatReconcileStats = await reconcileVatRecords(
        tx,
        taxPeriodId,
        preparedInputs.vatCandidates
      );
      logInfo("tax-engine", "VAT DONE", {
        taxPeriodId,
        ...vatReconcileStats,
      });

      phase = "reconcile-wht";
      const whtReconcileStats = await reconcileWhtRecords(
        tx,
        taxPeriodId,
        preparedInputs.whtCandidates
      );
      logInfo("tax-engine", "WHT DONE", {
        taxPeriodId,
        ...whtReconcileStats,
      });

      phase = "persist-tax-computation";
      const metrics = preparedInputs.metrics;

      await persistTaxComputation(tx, {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        taxPeriodId,
        taxType: "VAT",
        status: metrics.vatExceptionCount > 0 ? "REVIEW_READY" : "FINALIZED",
        currency: preparedInputs.fallbackCurrency,
        sourceCount: preparedInputs.vatCandidates.length,
        exceptionCount: metrics.vatExceptionCount,
        outputVatMinor: metrics.outputVatMinor,
        inputVatMinor: metrics.inputVatMinor,
        netVatMinor: metrics.outputVatMinor - metrics.inputVatMinor,
        summaryPayload: toPayload({
          generatedFrom: "live-accounting-data",
          exceptionCount: metrics.vatExceptionCount,
          outputStatus: resolveNigerianTaxOutputStatus({
            sourceCount: preparedInputs.vatCandidates.length,
            exceptionCount: metrics.vatExceptionCount,
          }),
          rulesVersion: TAX_ENGINE_RULES_VERSION,
        }),
      });

      await persistTaxComputation(tx, {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        taxPeriodId,
        taxType: "WHT",
        status: metrics.whtExceptionCount > 0 ? "REVIEW_READY" : "FINALIZED",
        currency: preparedInputs.fallbackCurrency,
        sourceCount: preparedInputs.whtCandidates.length,
        exceptionCount: metrics.whtExceptionCount,
        whtDeductedMinor: metrics.whtDeductedMinor,
        whtSufferedMinor: metrics.whtSufferedMinor,
        summaryPayload: toPayload({
          generatedFrom: "live-accounting-data",
          exceptionCount: metrics.whtExceptionCount,
          outputStatus: resolveNigerianTaxOutputStatus({
            sourceCount: preparedInputs.whtCandidates.length,
            exceptionCount: metrics.whtExceptionCount,
          }),
          rulesVersion: TAX_ENGINE_RULES_VERSION,
        }),
      });

      await persistTaxComputation(tx, {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        taxPeriodId,
        taxType: "CIT",
        status: citSummary.exceptions.length > 0 ? "REVIEW_READY" : "DRAFT",
        currency: preparedInputs.fallbackCurrency,
        sourceCount: citSummary.rows.length,
        exceptionCount: citSummary.exceptions.length,
        accountingProfitMinor: citSummary.accountingProfitMinor,
        addBacksMinor: citSummary.addBacksMinor,
        deductionsMinor: citSummary.deductionsMinor,
        taxAdjustedProfitMinor: citSummary.taxAdjustedProfitMinor,
        summaryPayload: toPayload(citSummary),
      });
      logInfo("tax-engine", "SUMMARY SAVED", {
        taxPeriodId,
        vatSourceCount: preparedInputs.vatCandidates.length,
        whtSourceCount: preparedInputs.whtCandidates.length,
        citSourceCount: citSummary.rows.length,
      });

      phase = "sync-filing-drafts";
      for (const taxType of ["VAT", "WHT", "CIT"] as const) {
        const sourceCount =
          taxType === "VAT"
            ? preparedInputs.vatCandidates.length
            : taxType === "WHT"
              ? preparedInputs.whtCandidates.length
              : citSummary.rows.length;
        const exceptionCount =
          taxType === "VAT"
            ? metrics.vatExceptionCount
            : taxType === "WHT"
              ? metrics.whtExceptionCount
              : citSummary.exceptions.length;
        const nextSummaryPayload = buildDraftSummaryPayload({
          taxType,
          sourceCount,
          exceptionCount,
          citSummary,
        });
        const existingDraft = await tx.filingDraft.findUnique({
          where: {
            taxPeriodId_taxType: {
              taxPeriodId,
              taxType,
            },
          },
          select: {
            id: true,
            status: true,
            summaryPayload: true,
            exceptionCount: true,
            readyAt: true,
            reviewedAt: true,
            reviewedByUserId: true,
          },
        });
        const nextStatus = resolveSyncedFilingStatus({
          currentStatus: existingDraft?.status ?? null,
          sourceCount,
          exceptionCount,
          payloadChanged:
            existingDraft?.summaryPayload !== nextSummaryPayload ||
            existingDraft?.exceptionCount !== exceptionCount,
        });
        const resetReviewMetadata =
          existingDraft?.status !== nextStatus && nextStatus === "READY_FOR_REVIEW";

        const draft = existingDraft
          ? await tx.filingDraft.update({
              where: { id: existingDraft.id },
              data: {
                status: nextStatus,
                reference: `${periodKey}:${taxType}`.toUpperCase(),
                title: `${taxType} filing draft - ${input.period.label}`,
                summaryPayload: nextSummaryPayload,
                exceptionCount,
                readyAt:
                  sourceCount > 0 ? existingDraft.readyAt ?? new Date() : null,
                reviewedAt: resetReviewMetadata ? null : existingDraft.reviewedAt,
                reviewedByUserId: resetReviewMetadata
                  ? null
                  : existingDraft.reviewedByUserId,
              },
            })
          : await tx.filingDraft.create({
              data: {
                workspaceId: input.workspaceId,
                clientBusinessId: input.clientBusinessId ?? null,
                taxPeriodId,
                taxType,
                status: nextStatus,
                reference: `${periodKey}:${taxType}`.toUpperCase(),
                title: `${taxType} filing draft - ${input.period.label}`,
                summaryPayload: nextSummaryPayload,
                exceptionCount,
                readyAt: sourceCount > 0 ? new Date() : null,
              },
            });

        await tx.filingItem.deleteMany({ where: { filingDraftId: draft.id } });

        if (taxType === "VAT" && preparedInputs.vatCandidates.length > 0) {
          const vatRows = await tx.vATRecord.findMany({
            where: { taxPeriodId },
            select: {
              id: true,
              sourceType: true,
              sourceRecordId: true,
              basisAmountMinor: true,
              vatAmountMinor: true,
              flagsPayload: true,
            },
          });
          await tx.filingItem.createMany({
            data: vatRows.map((row) => ({
              filingDraftId: draft.id,
              vatRecordId: row.id,
              label: `${row.sourceType} ${row.sourceRecordId ?? ""}`.trim(),
              sourceType: row.sourceType,
              sourceRecordId: row.sourceRecordId,
              amountMinor: row.basisAmountMinor,
              taxAmountMinor: row.vatAmountMinor,
              status:
                (parsePayload<string[]>(row.flagsPayload)?.length ?? 0) > 0
                  ? "EXCEPTION"
                  : "INCLUDED",
              flagsPayload: row.flagsPayload,
            })),
          });
        }

        if (taxType === "WHT" && preparedInputs.whtCandidates.length > 0) {
          const whtRows = await tx.wHTRecord.findMany({
            where: { taxPeriodId },
            select: {
              id: true,
              sourceType: true,
              sourceRecordId: true,
              basisAmountMinor: true,
              whtAmountMinor: true,
              flagsPayload: true,
            },
          });
          await tx.filingItem.createMany({
            data: whtRows.map((row) => ({
              filingDraftId: draft.id,
              whtRecordId: row.id,
              label: `${row.sourceType} ${row.sourceRecordId ?? ""}`.trim(),
              sourceType: row.sourceType,
              sourceRecordId: row.sourceRecordId,
              amountMinor: row.basisAmountMinor,
              taxAmountMinor: row.whtAmountMinor,
              status:
                (parsePayload<string[]>(row.flagsPayload)?.length ?? 0) > 0
                  ? "EXCEPTION"
                  : "INCLUDED",
              flagsPayload: row.flagsPayload,
            })),
          });
        }

        if (taxType === "CIT") {
          const citItems = citSummary.rows.map((row, index) => ({
            filingDraftId: draft.id,
            label: row.label,
            sourceType: row.direction,
            sourceRecordId: index + 1,
            amountMinor: row.amountMinor,
            taxAmountMinor:
              row.direction === "ADD_BACK" || row.direction === "DEDUCTION"
                ? row.amountMinor
                : null,
            status:
              row.direction === "PLACEHOLDER"
                ? ("PENDING" as const)
                : ("INCLUDED" as const),
            note: row.note ?? null,
          }));
          if (citItems.length > 0) {
            await tx.filingItem.createMany({ data: citItems });
          }
        }
      }

      phase = "finalize-tax-period";
      await tx.taxPeriod.update({
        where: { id: taxPeriodId },
        data: {
          status:
            metrics.vatExceptionCount +
              metrics.whtExceptionCount +
              citSummary.exceptions.length >
            0
              ? "IN_REVIEW"
              : "READY",
        },
      });

      logInfo("tax-engine", "TX END", {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        taxPeriodId,
      });

      return taxPeriodId;
    } catch (error) {
      logError("tax-engine", "Tax engine sync failed", error, {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        periodKey,
        phase,
      });
      throw error;
    }
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });
}

export function buildStoredTaxPeriodState(period: {
  label: string;
  periodType: string;
  startDate: Date;
  endDate: Date;
  month: number | null;
  quarter: number | null;
  year: number;
}): TaxPeriodState {
  const fromParam = period.startDate.toISOString().slice(0, 10);
  const toParam = period.endDate.toISOString().slice(0, 10);
  const monthInput =
    period.month && period.periodType === "MONTHLY"
      ? `${period.year}-${String(period.month).padStart(2, "0")}`
      : fromParam.slice(0, 7);
  return {
    mode:
      period.periodType === "MONTHLY"
        ? "month"
        : period.periodType === "QUARTERLY"
          ? "quarter"
          : period.periodType === "CUSTOM"
            ? "custom"
            : "all",
    label: period.label,
    fromParam: period.periodType === "ALL_TIME" ? undefined : fromParam,
    toParam: period.periodType === "ALL_TIME" ? undefined : toParam,
    monthInput,
    quarterInput: period.quarter ? String(period.quarter) : "1",
    yearInput: String(period.year),
    fromInput: period.periodType === "ALL_TIME" ? "" : fromParam,
    toInput: period.periodType === "ALL_TIME" ? "" : toParam,
    errorMsg: null,
  };
}

export async function recomputeStoredTaxPeriod(periodId: number) {
  const period = await prisma.taxPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: {
      id: true,
      workspaceId: true,
      clientBusinessId: true,
      label: true,
      periodType: true,
      startDate: true,
      endDate: true,
      month: true,
      quarter: true,
      year: true,
    },
  });

  return syncWorkspaceTaxEngine({
    workspaceId: period.workspaceId,
    clientBusinessId: period.clientBusinessId,
    period: buildStoredTaxPeriodState(period),
  });
}

export async function queueStoredTaxPeriodRecompute(
  periodId: number,
  reason = "stored-period-refresh"
) {
  const period = await prisma.taxPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: {
      id: true,
      workspaceId: true,
      clientBusinessId: true,
      label: true,
      periodType: true,
      startDate: true,
      endDate: true,
      month: true,
      quarter: true,
      year: true,
    },
  });

  queueWorkspaceTaxEngineRefresh(
    {
      workspaceId: period.workspaceId,
      clientBusinessId: period.clientBusinessId,
      period: buildStoredTaxPeriodState(period),
    },
    reason
  );
}

export async function computeWorkspaceTaxPeriod(
  input: TaxEngineInput,
  options?: {
    refresh?: boolean;
  }
) {
  if (!options?.refresh) {
    const existingPeriod = await prisma.taxPeriod.findFirst({
      where: {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId ?? null,
        periodKey: getPeriodKey(input.period, input.clientBusinessId),
      },
      select: {
        id: true,
        computations: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (existingPeriod?.computations.length) {
      return existingPeriod.id;
    }
  }

  return syncWorkspaceTaxEngine(input);
}

function getExceptionSeverity(detail: string): ExceptionSeverity {
  if (
    detail.includes("Missing VAT treatment") ||
    detail.includes("Missing WHT treatment") ||
    detail.includes("Missing counterparty tax identity")
  ) {
    return "HIGH";
  }
  if (detail.includes("Suspicious") || detail.includes("duplicate")) return "MEDIUM";
  return "LOW";
}

function applyReviewedFilter<T extends { reviewed: boolean; flags?: string[] }>(
  rows: T[],
  reviewed: ReviewedFilter
) {
  if (reviewed === "REVIEWED") {
    return rows.filter((row) => row.reviewed);
  }
  if (reviewed === "UNREVIEWED") {
    return rows.filter((row) => !row.reviewed);
  }
  if (reviewed === "UNRESOLVED") {
    return rows.filter((row) => !row.reviewed || (row.flags?.length ?? 0) > 0);
  }
  return rows;
}

export async function getWorkspaceTaxEngineOverview(
  input: EngineFilters
): Promise<PersistedOverview> {
  const refreshInput: TaxEngineInput = {
    workspaceId: input.workspaceId,
    clientBusinessId: input.clientBusinessId ?? null,
    period: input.period,
  };
  const periodId = await ensurePersistedTaxPeriod(refreshInput);

  const period = await prisma.taxPeriod.findUniqueOrThrow({
    where: { id: periodId },
  });
  const businesses = await prisma.clientBusiness.findMany({
    where: {
      workspaceId: input.workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
    orderBy: { name: "asc" },
  });
  const vatRowsRaw = await prisma.vATRecord.findMany({
    where: {
      taxPeriodId: periodId,
    },
    include: {
      clientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
      invoice: {
        select: {
          issueDate: true,
        },
      },
      ledgerTransaction: {
        select: {
          transactionDate: true,
        },
      },
      bookkeepingDraft: {
        select: {
          proposedDate: true,
          approvedAt: true,
          createdAt: true,
        },
      },
      taxRecord: {
        select: {
          occurredOn: true,
        },
      },
      evidence: {
        select: { id: true },
      },
    },
    orderBy: [{ reviewed: "asc" }, { createdAt: "desc" }],
  });
  const whtRowsRaw = await prisma.wHTRecord.findMany({
    where: {
      taxPeriodId: periodId,
    },
    include: {
      clientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
      invoice: {
        select: {
          issueDate: true,
        },
      },
      ledgerTransaction: {
        select: {
          transactionDate: true,
        },
      },
      bookkeepingDraft: {
        select: {
          proposedDate: true,
          approvedAt: true,
          createdAt: true,
        },
      },
      taxRecord: {
        select: {
          occurredOn: true,
        },
      },
      evidence: {
        select: { id: true },
      },
    },
    orderBy: [{ reviewed: "asc" }, { createdAt: "desc" }],
  });
  const computations = await prisma.taxComputation.findMany({
    where: {
      taxPeriodId: periodId,
    },
  });
  const filings = await prisma.filingDraft.findMany({
    where: {
      taxPeriodId: periodId,
    },
    orderBy: { taxType: "asc" },
  });

  const vatRows = applyReviewedFilter(
    vatRowsRaw.map((row) => {
      const occurredOn =
        row.invoice?.issueDate ??
        row.ledgerTransaction?.transactionDate ??
        row.bookkeepingDraft?.proposedDate ??
        row.bookkeepingDraft?.approvedAt ??
        row.bookkeepingDraft?.createdAt ??
        row.taxRecord?.occurredOn ??
        null;
      return {
        id: row.id,
        sourceType: row.sourceType,
        sourceRecordId: row.sourceRecordId,
        clientBusinessId: row.clientBusinessId,
        clientBusinessName: row.clientBusiness?.name ?? null,
        counterpartyName: row.counterpartyName,
        direction: row.direction as VatDirection,
        vatTreatment: row.vatTreatment,
        taxCategory: row.taxCategory,
        basisAmountMinor: row.basisAmountMinor,
        vatAmountMinor: row.vatAmountMinor,
        totalAmountMinor: row.totalAmountMinor,
        currency: row.currency,
        sourceDocumentNumber: row.sourceDocumentNumber,
        reviewed: row.reviewed,
        reviewNote: row.reviewNote,
        occurredOn: occurredOn?.toISOString() ?? null,
        flags: parsePayload<string[]>(row.flagsPayload) ?? [],
        evidenceCount: row.evidence.length,
      };
    }),
    input.reviewed ?? "ALL"
  );

  const whtRows = applyReviewedFilter(
    whtRowsRaw.map((row) => {
      const occurredOn =
        row.invoice?.issueDate ??
        row.ledgerTransaction?.transactionDate ??
        row.bookkeepingDraft?.proposedDate ??
        row.bookkeepingDraft?.approvedAt ??
        row.bookkeepingDraft?.createdAt ??
        row.taxRecord?.occurredOn ??
        null;
      return {
        id: row.id,
        sourceType: row.sourceType,
        sourceRecordId: row.sourceRecordId,
        clientBusinessId: row.clientBusinessId,
        clientBusinessName: row.clientBusiness?.name ?? null,
        counterpartyName: row.counterpartyName,
        counterpartyTaxId: row.counterpartyTaxId,
        direction: row.direction as WhtDirection,
        whtTreatment: row.whtTreatment,
        taxCategory: row.taxCategory,
        basisAmountMinor: row.basisAmountMinor,
        whtRate: row.whtRate,
        whtAmountMinor: row.whtAmountMinor,
        currency: row.currency,
        sourceDocumentNumber: row.sourceDocumentNumber,
        reviewed: row.reviewed,
        reviewNote: row.reviewNote,
        occurredOn: occurredOn?.toISOString() ?? null,
        flags: parsePayload<string[]>(row.flagsPayload) ?? [],
        evidenceCount: row.evidence.length,
      };
    }),
    input.reviewed ?? "ALL"
  );

  const vatComputation = computations.find((row) => row.taxType === "VAT");
  const whtComputation = computations.find((row) => row.taxType === "WHT");
  const citComputation = computations.find((row) => row.taxType === "CIT");
  const citPayload = parsePayload<CitSummary>(citComputation?.summaryPayload);
  const latestComputedAt =
    computations.length > 0
      ? computations.reduce<Date | null>(
          (latest, row) =>
            !latest || row.computedAt.getTime() > latest.getTime()
              ? row.computedAt
              : latest,
          null
        )
      : null;
  const baseRefreshStatus: TaxEngineRefreshBaseStatus =
    computations.length === 0
      ? "MISSING"
      : latestComputedAt &&
          Date.now() - latestComputedAt.getTime() > TAX_ENGINE_REFRESH_STALE_MS
        ? "STALE"
        : "READY";
  const vatBreakdownSourceMap = new Map<
    string,
    {
      sourceType: string;
      outputVatMinor: number;
      inputVatMinor: number;
      netVatMinor: number;
      recordCount: number;
    }
  >();
  const whtCounterpartyMap = new Map<
    string,
    {
      counterpartyName: string;
      direction: "DEDUCTED" | "SUFFERED" | "MIXED";
      deductedMinor: number;
      sufferedMinor: number;
      recordCount: number;
      missingCounterpartyTaxId: boolean;
    }
  >();
  const whtCategoryMap = new Map<
    string,
    {
      taxCategory: string;
      deductedMinor: number;
      sufferedMinor: number;
      recordCount: number;
    }
  >();

  const businessMap = new Map<
    number | null,
    {
      clientBusinessId: number | null;
      clientBusinessName: string;
      outputVatMinor: number;
      inputVatMinor: number;
      netVatMinor: number;
      whtDeductedMinor: number;
      whtSufferedMinor: number;
      recordCount: number;
    }
  >();

  for (const row of vatRows) {
    const vatSourceBucket =
      vatBreakdownSourceMap.get(row.sourceType) ??
      {
        sourceType: row.sourceType,
        outputVatMinor: 0,
        inputVatMinor: 0,
        netVatMinor: 0,
        recordCount: 0,
      };
    if (row.direction === "OUTPUT") {
      vatSourceBucket.outputVatMinor += row.vatAmountMinor;
    } else {
      vatSourceBucket.inputVatMinor += row.vatAmountMinor;
    }
    vatSourceBucket.netVatMinor =
      vatSourceBucket.outputVatMinor - vatSourceBucket.inputVatMinor;
    vatSourceBucket.recordCount += 1;
    vatBreakdownSourceMap.set(row.sourceType, vatSourceBucket);

    const key = row.clientBusinessId ?? null;
    const bucket =
      businessMap.get(key) ??
      {
        clientBusinessId: row.clientBusinessId ?? null,
        clientBusinessName: row.clientBusinessName ?? "Workspace-level",
        outputVatMinor: 0,
        inputVatMinor: 0,
        netVatMinor: 0,
        whtDeductedMinor: 0,
        whtSufferedMinor: 0,
        recordCount: 0,
      };
    if (row.direction === "OUTPUT") {
      bucket.outputVatMinor += row.vatAmountMinor;
    } else {
      bucket.inputVatMinor += row.vatAmountMinor;
    }
    bucket.netVatMinor = bucket.outputVatMinor - bucket.inputVatMinor;
    bucket.recordCount += 1;
    businessMap.set(key, bucket);
  }
  for (const row of whtRows) {
    const counterpartyKey = row.counterpartyName ?? "Unknown counterparty";
    const counterpartyBucket =
      whtCounterpartyMap.get(counterpartyKey) ??
      {
        counterpartyName: counterpartyKey,
        direction: "MIXED" as const,
        deductedMinor: 0,
        sufferedMinor: 0,
        recordCount: 0,
        missingCounterpartyTaxId: false,
      };
    if (row.direction === "DEDUCTED") {
      counterpartyBucket.deductedMinor += row.whtAmountMinor;
    } else {
      counterpartyBucket.sufferedMinor += row.whtAmountMinor;
    }
    counterpartyBucket.direction =
      counterpartyBucket.deductedMinor > 0 && counterpartyBucket.sufferedMinor > 0
        ? "MIXED"
        : counterpartyBucket.deductedMinor > 0
          ? "DEDUCTED"
          : "SUFFERED";
    counterpartyBucket.recordCount += 1;
    counterpartyBucket.missingCounterpartyTaxId =
      counterpartyBucket.missingCounterpartyTaxId || !row.counterpartyTaxId;
    whtCounterpartyMap.set(counterpartyKey, counterpartyBucket);

    const categoryKey = row.taxCategory ?? "UNCLASSIFIED";
    const categoryBucket =
      whtCategoryMap.get(categoryKey) ??
      {
        taxCategory: categoryKey,
        deductedMinor: 0,
        sufferedMinor: 0,
        recordCount: 0,
      };
    if (row.direction === "DEDUCTED") {
      categoryBucket.deductedMinor += row.whtAmountMinor;
    } else {
      categoryBucket.sufferedMinor += row.whtAmountMinor;
    }
    categoryBucket.recordCount += 1;
    whtCategoryMap.set(categoryKey, categoryBucket);

    const key = row.clientBusinessId ?? null;
    const bucket =
      businessMap.get(key) ??
      {
        clientBusinessId: row.clientBusinessId ?? null,
        clientBusinessName: row.clientBusinessName ?? "Workspace-level",
        outputVatMinor: 0,
        inputVatMinor: 0,
        netVatMinor: 0,
        whtDeductedMinor: 0,
        whtSufferedMinor: 0,
        recordCount: 0,
      };
    if (row.direction === "DEDUCTED") {
      bucket.whtDeductedMinor += row.whtAmountMinor;
    } else {
      bucket.whtSufferedMinor += row.whtAmountMinor;
    }
    bucket.recordCount += 1;
    businessMap.set(key, bucket);
  }

  const exceptions = [
    ...vatRows.flatMap((row) =>
      row.flags.map((flag) => ({
        taxType: "VAT" as const,
        severity: getExceptionSeverity(flag),
        sourceType: row.sourceType,
        sourceRecordId: row.sourceRecordId,
        clientBusinessId: row.clientBusinessId,
        clientBusinessName: row.clientBusinessName,
        title: flag,
        detail: `${row.sourceType} ${row.sourceRecordId ?? ""}`.trim(),
        reviewed: row.reviewed,
      }))
    ),
    ...whtRows.flatMap((row) =>
      row.flags.map((flag) => ({
        taxType: "WHT" as const,
        severity: getExceptionSeverity(flag),
        sourceType: row.sourceType,
        sourceRecordId: row.sourceRecordId,
        clientBusinessId: row.clientBusinessId,
        clientBusinessName: row.clientBusinessName,
        title: flag,
        detail: `${row.sourceType} ${row.sourceRecordId ?? ""}`.trim(),
        reviewed: row.reviewed,
      }))
    ),
    ...(citPayload?.exceptions ?? []).map((item) => ({
      taxType: "CIT" as const,
      severity: "MEDIUM" as const,
      sourceType: "CIT_SCHEDULE",
      sourceRecordId: null,
      clientBusinessId: input.clientBusinessId ?? null,
      clientBusinessName: null,
      title: item,
      detail: period.label,
      reviewed: false,
    })),
  ].sort((left, right) => {
    const score = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return score[right.severity] - score[left.severity];
  });
  const filteredVatRows =
    input.taxType && input.taxType !== "ALL" && input.taxType !== "VAT" ? [] : vatRows;
  const filteredWhtRows =
    input.taxType && input.taxType !== "ALL" && input.taxType !== "WHT" ? [] : whtRows;
  const filteredExceptions =
    input.taxType && input.taxType !== "ALL"
      ? exceptions.filter((item) => item.taxType === input.taxType)
      : exceptions;
  if (baseRefreshStatus !== "READY") {
    queueWorkspaceTaxEngineRefresh(
      refreshInput,
      baseRefreshStatus === "MISSING"
        ? "overview-missing-snapshot"
        : "overview-stale-snapshot"
    );
  }
  const refresh = buildTaxEngineRefreshSnapshot({
    baseStatus: baseRefreshStatus,
    lastComputedAt: latestComputedAt,
    queuedRefresh: getQueuedTaxEngineRefresh(
      getTaxEngineRefreshKey(refreshInput)
    ),
  });

  return {
    period: {
      id: period.id,
      key: period.periodKey,
      label: period.label,
      type: period.periodType,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      currency: period.currency,
      status: period.status,
    },
    filters: {
      clientBusinessId: input.clientBusinessId ?? null,
      reviewed: input.reviewed ?? "ALL",
      taxType: input.taxType ?? "ALL",
    },
    refresh,
    clientBusinesses: businesses,
    totals: {
      outputVatMinor: vatRows
        .filter((row) => row.direction === "OUTPUT")
        .reduce((sum, row) => sum + row.vatAmountMinor, 0),
      inputVatMinor: vatRows
        .filter((row) => row.direction === "INPUT")
        .reduce((sum, row) => sum + row.vatAmountMinor, 0),
      netVatMinor:
        vatRows
          .filter((row) => row.direction === "OUTPUT")
          .reduce((sum, row) => sum + row.vatAmountMinor, 0) -
        vatRows
          .filter((row) => row.direction === "INPUT")
          .reduce((sum, row) => sum + row.vatAmountMinor, 0),
      whtDeductedMinor: whtRows
        .filter((row) => row.direction === "DEDUCTED")
        .reduce((sum, row) => sum + row.whtAmountMinor, 0),
      whtSufferedMinor: whtRows
        .filter((row) => row.direction === "SUFFERED")
        .reduce((sum, row) => sum + row.whtAmountMinor, 0),
      accountingProfitMinor: citComputation?.accountingProfitMinor ?? 0,
      addBacksMinor: citComputation?.addBacksMinor ?? 0,
      deductionsMinor: citComputation?.deductionsMinor ?? 0,
      taxAdjustedProfitMinor: citComputation?.taxAdjustedProfitMinor ?? 0,
      estimatedCitMinor: citPayload?.estimatedCitMinor ?? 0,
    },
    outputStatus: resolveNigerianTaxOutputStatus({
      sourceCount:
        (vatComputation?.sourceCount ?? 0) +
        (whtComputation?.sourceCount ?? 0) +
        (citComputation?.sourceCount ?? 0),
      exceptionCount:
        (vatComputation?.exceptionCount ?? 0) +
        (whtComputation?.exceptionCount ?? 0) +
        (citComputation?.exceptionCount ?? 0),
      isEstimate: baseRefreshStatus !== "READY",
      filingApproved: filings.some((draft) => draft.status === "APPROVED_FOR_SUBMISSION"),
      filed: filings.some((draft) => draft.status === "SUBMITTED" || draft.status === "SUBMITTED_MANUALLY"),
    }),
    businesses: Array.from(businessMap.values()).sort((left, right) =>
      left.clientBusinessName.localeCompare(right.clientBusinessName)
    ),
    vatBreakdownBySource: Array.from(vatBreakdownSourceMap.values()).sort(
      (left, right) => right.recordCount - left.recordCount
    ),
    whtBreakdownByCounterparty: Array.from(whtCounterpartyMap.values()).sort(
      (left, right) =>
        right.deductedMinor +
        right.sufferedMinor -
        (left.deductedMinor + left.sufferedMinor)
    ),
    whtBreakdownByCategory: Array.from(whtCategoryMap.values()).sort(
      (left, right) =>
        right.deductedMinor +
        right.sufferedMinor -
        (left.deductedMinor + left.sufferedMinor)
    ),
    unresolvedSummary: {
      vat: filteredVatRows.filter((row) => !row.reviewed || row.flags.length > 0).length,
      wht: filteredWhtRows.filter((row) => !row.reviewed || row.flags.length > 0).length,
      exceptions: filteredExceptions.filter((row) => !row.reviewed).length,
      total:
        filteredVatRows.filter((row) => !row.reviewed || row.flags.length > 0).length +
        filteredWhtRows.filter((row) => !row.reviewed || row.flags.length > 0).length +
        filteredExceptions.filter((row) => !row.reviewed).length,
    },
    vatRows: filteredVatRows,
    whtRows: filteredWhtRows,
    exceptions: filteredExceptions,
    filings: filings.map((draft) => ({
      id: draft.id,
      taxType: draft.taxType,
      status: draft.status,
      outputStatus: mapFilingDraftOutputStatus(draft.status),
      exceptionCount: draft.exceptionCount,
      reference: draft.reference,
      readyAt: draft.readyAt?.toISOString() ?? null,
      submittedAt: draft.submittedAt?.toISOString() ?? null,
    })),
    computations: {
      VAT: {
        sourceCount: vatComputation?.sourceCount ?? 0,
        exceptionCount: vatComputation?.exceptionCount ?? 0,
        outputVatMinor: vatComputation?.outputVatMinor ?? 0,
        inputVatMinor: vatComputation?.inputVatMinor ?? 0,
        netVatMinor: vatComputation?.netVatMinor ?? 0,
      },
      WHT: {
        sourceCount: whtComputation?.sourceCount ?? 0,
        exceptionCount: whtComputation?.exceptionCount ?? 0,
        whtDeductedMinor: whtComputation?.whtDeductedMinor ?? 0,
        whtSufferedMinor: whtComputation?.whtSufferedMinor ?? 0,
      },
      CIT: {
        sourceCount: citComputation?.sourceCount ?? 0,
        exceptionCount: citComputation?.exceptionCount ?? 0,
        accountingProfitMinor: citComputation?.accountingProfitMinor ?? 0,
        addBacksMinor: citComputation?.addBacksMinor ?? 0,
        deductionsMinor: citComputation?.deductionsMinor ?? 0,
        taxAdjustedProfitMinor: citComputation?.taxAdjustedProfitMinor ?? 0,
        estimatedCitMinor: citPayload?.estimatedCitMinor ?? 0,
        appliedRate: citPayload?.appliedRate ?? 0,
        companyBand: citPayload?.companyBand ?? "UNKNOWN",
        rows: citPayload?.rows ?? [],
        exceptions: citPayload?.exceptions ?? [],
        placeholders: citPayload?.placeholders ?? [],
      },
    },
  } satisfies PersistedOverview;
}

export function parseReviewedFilter(value: string | string[] | undefined): ReviewedFilter {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (
    normalized === "REVIEWED" ||
    normalized === "UNREVIEWED" ||
    normalized === "UNRESOLVED"
  ) {
    return normalized;
  }
  return "ALL";
}

export function parseTaxTypeFilter(value: string | string[] | undefined): TaxTypeFilter {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "VAT" || normalized === "WHT" || normalized === "CIT") {
    return normalized as TaxType;
  }
  return "ALL";
}

export function parseClientBusinessFilter(value: string | string[] | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function formatCurrency(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export async function getLatestTaxSnapshot(input: {
  userId: number;
  workspaceId?: number | null;
}): Promise<ComputedTaxSnapshot | null> {
  console.log("Fetching snapshot", input);

  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return null;
  }

  const workspaceId =
    input.workspaceId && Number.isInteger(input.workspaceId) && input.workspaceId > 0
      ? input.workspaceId
      : null;

  const where: Prisma.TaxSnapshotWhereInput = {
    userId: input.userId,
    status: "completed",
    ...(workspaceId ? { workspaceId } : {}),
  };

  const latestSnapshot = await withPrismaRetry(
    () =>
      prisma.taxSnapshot.findFirst({
        where,
        orderBy: {
          version: "desc",
        },
      }),
    {
      label: "get_latest_tax_snapshot",
    }
  ).catch((error) => {
    logInfo("tax-engine", "No snapshot yet", {
      ...input,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!latestSnapshot) {
    console.log("[TaxBook] No tax snapshot yet (expected for new workspace)", input);
    return null;
  }

  return latestSnapshot;
}

export async function getDashboardTaxSnapshotSummary(input: {
  userId: number;
  workspaceId?: number | null;
}): Promise<DashboardTaxSnapshotSummary | null> {
  console.log("Fetching snapshot", input);

  if (!Number.isInteger(input.userId) || input.userId <= 0 || !input.workspaceId) {
    return null;
  }

  const snapshots = await withPrismaRetry(
    () =>
      prisma.taxSnapshot.findMany({
        where: {
          userId: input.userId,
          workspaceId: input.workspaceId,
          status: "completed",
        },
        orderBy: [{ periodKey: "asc" }, { version: "desc" }],
      }),
    {
      label: "get_dashboard_tax_snapshot_summary",
    }
  ).catch((error) => {
    logInfo("tax-engine", "No snapshot yet", {
      ...input,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  });

  const latestByPeriod = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const periodKey = snapshot.periodKey || snapshot.period;
    if (!latestByPeriod.has(periodKey)) {
      latestByPeriod.set(periodKey, snapshot);
    }
  }

  const latestSnapshots = Array.from(latestByPeriod.values());
  if (latestSnapshots.length === 0) {
    console.log("[TaxBook] No tax snapshot yet (expected for new workspace)", input);
    return null;
  }

  const summary = latestSnapshots.reduce<DashboardTaxSnapshotSummary>(
    (summary, snapshot) => ({
      totalIncome: summary.totalIncome + snapshot.totalIncome,
      totalExpense: summary.totalExpense + snapshot.totalExpense,
      taxableProfit: summary.taxableProfit + snapshot.taxableProfit,
      taxPayable: summary.taxPayable + snapshot.taxPayable,
      estimatedTax: summary.estimatedTax + snapshot.estimatedTax,
      transactionCount: summary.transactionCount + snapshot.transactionCount,
      categorizedCount: summary.categorizedCount + snapshot.categorizedCount,
      uncategorizedCount: 0,
      isRoughEstimate: false,
      warnings: [],
      assumptions: [],
      status: "completed",
      version: Math.max(summary.version, snapshot.version),
      createdAt: snapshot.createdAt > summary.createdAt ? snapshot.createdAt : summary.createdAt,
      periodCount: summary.periodCount + 1,
    }),
    {
      totalIncome: 0,
      totalExpense: 0,
      taxableProfit: 0,
      taxPayable: 0,
      estimatedTax: 0,
      transactionCount: 0,
      categorizedCount: 0,
      uncategorizedCount: 0,
      isRoughEstimate: false,
      warnings: [],
      assumptions: [],
      status: "completed",
      version: 0,
      createdAt: new Date(0),
      periodCount: 0,
    }
  );
  const explainability = buildTaxSnapshotExplainableSummary(summary);

  return {
    ...summary,
    uncategorizedCount: explainability.uncategorizedCount,
    isRoughEstimate: explainability.isRoughEstimate,
    warnings: explainability.warnings,
    assumptions: explainability.assumptions,
  };
}

export async function computeAndSaveTaxSnapshot(
  input: TaxSnapshotPeriodInput
): Promise<ComputedTaxSnapshot> {
  const workspaceId = input.workspaceId ?? null;

  if (!workspaceId) {
    throw new Error("A workspace is required before tax can be recalculated.");
  }

  return createTaxSnapshot({
    userId: input.userId,
    workspaceId,
    period: input.period,
  });
}

export function buildTaxEngineExportQuery(input: {
  period: TaxPeriodState;
  clientBusinessId?: number | null;
  reviewed?: ReviewedFilter;
  taxType?: TaxTypeFilter;
}) {
  const params = new URLSearchParams();
  params.set("period", input.period.mode);
  if (input.period.monthInput) params.set("month", input.period.monthInput);
  if (input.period.quarterInput) params.set("quarter", input.period.quarterInput);
  if (input.period.yearInput) params.set("year", input.period.yearInput);
  if (input.period.fromParam) params.set("from", input.period.fromParam);
  if (input.period.toParam) params.set("to", input.period.toParam);
  if (input.clientBusinessId) params.set("clientBusinessId", String(input.clientBusinessId));
  if (input.reviewed && input.reviewed !== "ALL") params.set("reviewed", input.reviewed);
  if (input.taxType && input.taxType !== "ALL") params.set("taxType", input.taxType);
  return params.toString();
}

export function toCsvRows(rows: Array<Array<string | number | null | undefined>>) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          if (text.includes('"')) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          if (text.includes(",") || text.includes("\n") || text.includes("\r")) {
            return `"${text}"`;
          }
          return text;
        })
        .join(",")
    )
    .join("\n");
}
