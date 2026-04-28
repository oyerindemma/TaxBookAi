import "server-only";

import type {
  BankTransactionReviewStatus,
  BankTransactionTaxTreatmentSource,
  Prisma,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { buildFallbackTextSuggestion } from "@/lib/bookkeeping-ai";
import { logError, logWarn } from "@/lib/logger";
import { NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";
import { getNigeriaVatRate, getNigeriaWhtRate } from "@/lib/nigeria-tax-rules";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";

const TRANSACTION_TAX_ENGINE_VERSION = "ng-transaction-tax-v1-2026-04-04";
const TRANSACTION_TAX_EXPORT_SCHEMA_VERSION = 1;
const DEFAULT_DRILLDOWN_LIMIT = 200;
const TRANSACTION_TAX_FULL_QUERY_SUPPORT = {
  tables: ["BankTransaction", "BankAccount", "ClientBusiness", "TransactionCategory"],
  columns: [
    "BankTransaction.workspaceId",
    "BankTransaction.bankAccountId",
    "BankTransaction.clientBusinessId",
    "BankTransaction.categoryId",
    "BankTransaction.transactionDate",
    "BankTransaction.description",
    "BankTransaction.reference",
    "BankTransaction.amount",
    "BankTransaction.currency",
    "BankTransaction.reviewStatus",
    "BankTransaction.reviewNotes",
    "BankTransaction.vatTreatment",
    "BankTransaction.whtTreatment",
    "BankTransaction.vatRate",
    "BankTransaction.whtRate",
    "BankTransaction.vatAmountMinor",
    "BankTransaction.whtAmountMinor",
    "BankTransaction.taxTreatmentSource",
    "BankTransaction.suggestedVatTreatment",
    "BankTransaction.suggestedWhtTreatment",
    "BankAccount.name",
    "BankAccount.bankName",
    "BankAccount.accountNumber",
    "BankAccount.currency",
    "ClientBusiness.name",
    "ClientBusiness.defaultCurrency",
    "TransactionCategory.name",
    "TransactionCategory.type",
  ],
} as const;
const TRANSACTION_TAX_FALLBACK_QUERY_SUPPORT = {
  tables: ["BankTransaction", "BankAccount", "ClientBusiness"],
  columns: [
    "BankTransaction.workspaceId",
    "BankTransaction.bankAccountId",
    "BankTransaction.clientBusinessId",
    "BankTransaction.matchedLedgerTransactionId",
    "BankTransaction.transactionDate",
    "BankTransaction.description",
    "BankTransaction.reference",
    "BankTransaction.amount",
    "BankTransaction.currency",
    "BankTransaction.reviewNotes",
    "BankTransaction.suggestedVatTreatment",
    "BankTransaction.suggestedWhtTreatment",
    "BankAccount.name",
    "BankAccount.bankName",
    "BankAccount.accountNumber",
    "BankAccount.currency",
    "ClientBusiness.name",
    "ClientBusiness.defaultCurrency",
  ],
} as const;
const DASHBOARD_LEDGER_TAX_CARD_SUPPORT = {
  tables: ["LedgerTransaction", "ClientBusiness"],
  columns: [
    "LedgerTransaction.clientBusinessId",
    "LedgerTransaction.transactionDate",
    "LedgerTransaction.currency",
    "LedgerTransaction.reviewStatus",
    "LedgerTransaction.vatTreatment",
    "LedgerTransaction.whtTreatment",
    "LedgerTransaction.vatAmountMinor",
    "LedgerTransaction.whtAmountMinor",
    "ClientBusiness.workspaceId",
    "ClientBusiness.archivedAt",
  ],
} as const;
const transactionTaxWarningKeys = new Set<string>();

export type TransactionTaxType = "VAT" | "WHT";
export type TransactionTaxDirection = "INCREASES_DUE" | "REDUCES_DUE";
export type TransactionTaxChangeDirection = "UP" | "DOWN" | "FLAT" | "NEW";
export type TransactionTaxPeriodPreset =
  | "CURRENT_MONTH"
  | "PREVIOUS_MONTH"
  | "LAST_30_DAYS"
  | "CURRENT_QUARTER"
  | "YEAR_TO_DATE"
  | "CUSTOM";

const transactionTaxSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  currency: true,
  reviewStatus: true,
  reviewNotes: true,
  vatTreatment: true,
  whtTreatment: true,
  vatRate: true,
  whtRate: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  taxTreatmentSource: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
  bankAccount: {
    select: {
      id: true,
      name: true,
      bankName: true,
      accountNumber: true,
      currency: true,
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

const transactionTaxFallbackSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  currency: true,
  matchedLedgerTransactionId: true,
  reviewNotes: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
  bankAccount: {
    select: {
      id: true,
      name: true,
      bankName: true,
      accountNumber: true,
      currency: true,
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

const dashboardLedgerTaxCardSelect = {
  transactionDate: true,
  currency: true,
  reviewStatus: true,
  vatTreatment: true,
  whtTreatment: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
} satisfies Prisma.LedgerTransactionSelect;

type TransactionTaxRecordPayload = Prisma.BankTransactionGetPayload<{
  select: typeof transactionTaxSelect;
}>;

type TransactionTaxFallbackRecordPayload = Prisma.BankTransactionGetPayload<{
  select: typeof transactionTaxFallbackSelect;
}>;

type DashboardLedgerTaxCardRecord = Prisma.LedgerTransactionGetPayload<{
  select: typeof dashboardLedgerTaxCardSelect;
}>;

type TransactionTaxRecord = {
  id: number;
  transactionDate: Date;
  description: string;
  reference: string | null;
  amount: number;
  currency: string;
  reviewStatus: BankTransactionReviewStatus;
  reviewNotes: string | null;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  taxTreatmentSource: BankTransactionTaxTreatmentSource;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
  bankAccount: {
    id: number;
    name: string;
    bankName: string;
    accountNumber: string;
    currency: string;
  };
  clientBusiness: {
    id: number;
    name: string;
    defaultCurrency: string;
  } | null;
  category: {
    id: number;
    name: string;
    type: string;
  } | null;
};

export type TransactionTaxFilters = {
  workspaceId: number;
  query?: string | null;
  reviewStatus?: BankTransactionReviewStatus | null;
  clientBusinessId?: number | null;
  bankAccountId?: number | null;
  categoryId?: number | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  periodPreset?: TransactionTaxPeriodPreset | null;
  defaultDateWindowApplied?: boolean;
  drilldownLimit?: number;
};

export type TransactionTaxBreakdownRow = {
  key: string;
  label: string;
  transactionCount: number;
  grossAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  averageRate: number;
};

export type TransactionTaxDrilldownRow = {
  id: number;
  transactionDate: string;
  description: string;
  reference: string | null;
  amountMinor: number;
  currency: string;
  reviewStatus: BankTransactionReviewStatus;
  reviewNotes: string | null;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  taxTreatmentSource: BankTransactionTaxTreatmentSource;
  usesSuggestedFallback: boolean;
  bankAccount: {
    id: number;
    name: string;
    bankName: string;
    accountNumber: string;
    currency: string;
  };
  clientBusiness: {
    id: number;
    name: string;
    defaultCurrency: string;
  } | null;
  category: {
    id: number;
    name: string;
    type: string;
  } | null;
  trace: {
    sourceRecordType: "BANK_TRANSACTION";
    sourceRecordId: number;
    sourceRecordHref: string;
    vatLiabilityEffectMinor: number;
    whtLiabilityEffectMinor: number;
    totalLiabilityEffectMinor: number;
    explanation: string;
  };
};

export type TransactionTaxLiabilityDriver = {
  key: string;
  label: string;
  taxType: TransactionTaxType;
  direction: TransactionTaxDirection;
  transactionCount: number;
  amountMinor: number;
  previousAmountMinor: number | null;
  changeMinor: number | null;
  reason: string;
};

export type TransactionTaxLiabilityExplanation = {
  taxType: TransactionTaxType;
  label: string;
  currentDueMinor: number;
  previousDueMinor: number | null;
  changeMinor: number | null;
  changeDirection: TransactionTaxChangeDirection;
  summary: string;
  drivers: TransactionTaxLiabilityDriver[];
  topTransactions: TransactionTaxDrilldownRow[];
};

export type TransactionTaxFutureModule = {
  key: "PAYE" | "CIT";
  label: string;
  status: "PLANNED";
  note: string;
};

export type TransactionTaxSummary = {
  engineVersion: string;
  exportSchemaVersion: number;
  generatedAt: string;
  currency: string;
  scope: {
    workspaceId: number;
    query: string | null;
    reviewStatus: BankTransactionReviewStatus | "ALL";
    clientBusinessId: number | null;
    bankAccountId: number | null;
    categoryId: number | null;
    dateFrom: string | null;
    dateTo: string | null;
    dateLabel: string;
    periodPreset: TransactionTaxPeriodPreset;
    defaultDateWindowApplied: boolean;
  };
  cards: {
    vatOutputMinor: number;
    vatInputMinor: number;
    vatNetMinor: number;
    whtPayableMinor: number;
    whtReceivableMinor: number;
    estimatedTaxExposureMinor: number;
  };
  liability: {
    vatDueMinor: number;
    whtDueMinor: number;
    totalDueMinor: number;
    refreshedAt: string;
    mode: "TRANSACTION_DERIVED";
    refreshIntervalMs: number;
  };
  explanations: {
    comparisonDateLabel: string | null;
    taxes: TransactionTaxLiabilityExplanation[];
    futureModules: TransactionTaxFutureModule[];
  };
  vat: {
    outputVatMinor: number;
    inputVatMinor: number;
    exemptTransactionCount: number;
    taxableTransactionCount: number;
    grossAmountMinor: number;
    taxableAmountMinor: number;
    netVatMinor: number;
    rows: TransactionTaxBreakdownRow[];
  };
  wht: {
    payableMinor: number;
    receivableMinor: number;
    taxableTransactionCount: number;
    grossAmountMinor: number;
    netWhtMinor: number;
    rows: TransactionTaxBreakdownRow[];
  };
  transactions: TransactionTaxDrilldownRow[];
  totalMatchingTransactions: number;
  hasMoreTransactions: boolean;
  options: {
    clientBusinesses: Array<{
      id: number;
      name: string;
    }>;
    bankAccounts: Array<{
      id: number;
      name: string;
    }>;
    categories: Array<{
      id: number;
      name: string;
      clientBusinessName: string;
    }>;
  };
  export: {
    schemaVersion: number;
    countryCode: "NG";
    authority: string;
    generatedAt: string;
    engineVersion: string;
    scope: TransactionTaxSummary["scope"];
    cards: TransactionTaxSummary["cards"];
    liability: TransactionTaxSummary["liability"];
    explanations: TransactionTaxSummary["explanations"];
    vat: TransactionTaxSummary["vat"];
    wht: TransactionTaxSummary["wht"];
    transactions: TransactionTaxDrilldownRow[];
  };
};

export type DashboardTaxCardSnapshot = {
  dateLabel: string;
  vatNetMinor: number;
  whtPayableMinor: number;
  vatDueMinor: number;
  whtDueMinor: number;
  totalDueMinor: number;
  whtReceivableMinor: number;
  estimatedTaxExposureMinor: number;
  vatDueExplanation: string;
  whtDueExplanation: string;
  totalDueExplanation: string;
  generatedAt: string;
};

const TRANSACTION_TAX_SUMMARY_CACHE_TTL_MS = 5_000;
const globalForTransactionTax = globalThis as typeof globalThis & {
  taxSummaryCache?: Map<string, Promise<TransactionTaxSummary>>;
  taxSummaryCacheTimers?: Map<string, ReturnType<typeof setTimeout>>;
};
const taxSummaryCache =
  globalForTransactionTax.taxSummaryCache ??
  new Map<string, Promise<TransactionTaxSummary>>();
const taxSummaryCacheTimers =
  globalForTransactionTax.taxSummaryCacheTimers ??
  new Map<string, ReturnType<typeof setTimeout>>();

if (process.env.NODE_ENV !== "production") {
  globalForTransactionTax.taxSummaryCache = taxSummaryCache;
  globalForTransactionTax.taxSummaryCacheTimers = taxSummaryCacheTimers;
}

type ResolvedTransactionTax = {
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  taxTreatmentSource: BankTransactionTaxTreatmentSource;
  usesSuggestedFallback: boolean;
};

function logTransactionTaxWarningOnce(key: string, message: string, metadata?: Record<string, unknown>) {
  if (transactionTaxWarningKeys.has(key)) {
    return;
  }

  transactionTaxWarningKeys.add(key);
  logWarn("transaction-tax", message, metadata);
}

function normalizeString(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function estimateInclusiveVat(amountMinor: number, rate: number) {
  const normalizedRate = normalizeRate(rate);
  if (normalizedRate <= 0) return 0;
  return Math.round((amountMinor * normalizedRate) / (100 + normalizedRate));
}

export function estimateWithholdingTax(amountMinor: number, rate: number) {
  const normalizedRate = normalizeRate(rate);
  if (normalizedRate <= 0) return 0;
  return Math.round(amountMinor * (normalizedRate / 100));
}

function buildSuggestedTaxSignals(input: {
  description: string;
  reference: string | null;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
}) {
  const suggestion = buildFallbackTextSuggestion(
    `${input.description} ${input.reference ?? ""}`.trim()
  );

  return {
    vatRate:
      input.suggestedVatTreatment !== "NONE"
        ? normalizeRate(suggestion.vat.suggestedRate) || NIGERIA_TAX_CONFIG.vat.standardRate
        : normalizeRate(suggestion.vat.suggestedRate),
    whtRate:
      input.suggestedWhtTreatment !== "NONE"
        ? normalizeRate(suggestion.wht.suggestedRate) ||
          NIGERIA_TAX_CONFIG.wht.heuristicDefaultRate
        : normalizeRate(suggestion.wht.suggestedRate),
  };
}

function buildStoredTaxValues(input: {
  amountMinor: number;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  occurredOn?: Date | string | null;
}) {
  const vatRate =
    input.vatTreatment !== "NONE" && input.vatTreatment !== "EXEMPT"
      ? normalizeRate(input.vatRate) || getNigeriaVatRate(input.occurredOn)
      : 0;
  const whtRate =
    input.whtTreatment !== "NONE"
      ? normalizeRate(input.whtRate) || getNigeriaWhtRate(null, input.occurredOn)
      : 0;

  return {
    vatTreatment: input.vatTreatment,
    whtTreatment: input.whtTreatment,
    vatRate,
    whtRate,
    vatAmountMinor:
      input.vatTreatment === "NONE" || input.vatTreatment === "EXEMPT"
        ? 0
        : input.vatAmountMinor > 0
          ? input.vatAmountMinor
          : estimateInclusiveVat(input.amountMinor, vatRate),
    whtAmountMinor:
      input.whtTreatment === "NONE"
        ? 0
        : input.whtAmountMinor > 0
          ? input.whtAmountMinor
          : estimateWithholdingTax(input.amountMinor, whtRate),
  };
}

export function resolveBankTransactionTax(input: {
  amountMinor: number;
  description: string;
  reference: string | null;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  taxTreatmentSource: BankTransactionTaxTreatmentSource;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
  occurredOn?: Date | string | null;
}): ResolvedTransactionTax {
  const hasStoredTaxValues =
    input.vatTreatment !== "NONE" ||
    input.whtTreatment !== "NONE" ||
    normalizeRate(input.vatRate) > 0 ||
    normalizeRate(input.whtRate) > 0 ||
    input.vatAmountMinor > 0 ||
    input.whtAmountMinor > 0;

  if (input.taxTreatmentSource === "MANUAL") {
    return {
      ...buildStoredTaxValues(input),
      taxTreatmentSource: input.taxTreatmentSource,
      usesSuggestedFallback: false,
    };
  }

  if (input.taxTreatmentSource === "SUGGESTED" && hasStoredTaxValues) {
    return {
      ...buildStoredTaxValues(input),
      taxTreatmentSource: input.taxTreatmentSource,
      usesSuggestedFallback: false,
    };
  }

  const suggestedSignals = buildSuggestedTaxSignals({
    description: input.description,
    reference: input.reference,
    suggestedVatTreatment: input.suggestedVatTreatment,
    suggestedWhtTreatment: input.suggestedWhtTreatment,
  });

  return {
    vatTreatment: input.suggestedVatTreatment,
    whtTreatment: input.suggestedWhtTreatment,
    vatRate:
      input.suggestedVatTreatment !== "NONE" && input.suggestedVatTreatment !== "EXEMPT"
        ? suggestedSignals.vatRate || getNigeriaVatRate(input.occurredOn)
        : 0,
    whtRate:
      input.suggestedWhtTreatment !== "NONE"
        ? suggestedSignals.whtRate || getNigeriaWhtRate(null, input.occurredOn)
        : 0,
    vatAmountMinor:
      input.suggestedVatTreatment === "NONE" || input.suggestedVatTreatment === "EXEMPT"
        ? 0
        : estimateInclusiveVat(
            input.amountMinor,
            suggestedSignals.vatRate || getNigeriaVatRate(input.occurredOn)
          ),
    whtAmountMinor:
      input.suggestedWhtTreatment === "NONE"
        ? 0
        : estimateWithholdingTax(
            input.amountMinor,
            suggestedSignals.whtRate || getNigeriaWhtRate(null, input.occurredOn)
          ),
    taxTreatmentSource: input.taxTreatmentSource,
    usesSuggestedFallback: true,
  };
}

export function buildManualBankTransactionTaxUpdate(input: {
  amountMinor: number;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate?: number | null;
  whtRate?: number | null;
  occurredOn?: Date | string | null;
}) {
  const resolved = buildStoredTaxValues({
    amountMinor: input.amountMinor,
    vatTreatment: input.vatTreatment,
    whtTreatment: input.whtTreatment,
    vatRate: input.vatRate ?? 0,
    whtRate: input.whtRate ?? 0,
    vatAmountMinor: 0,
    whtAmountMinor: 0,
    occurredOn: input.occurredOn,
  });

  return {
    vatTreatment: resolved.vatTreatment,
    whtTreatment: resolved.whtTreatment,
    vatRate: resolved.vatRate,
    whtRate: resolved.whtRate,
    vatAmountMinor: resolved.vatAmountMinor,
    whtAmountMinor: resolved.whtAmountMinor,
    taxTreatmentSource: "MANUAL" as const,
  };
}

export function buildSuggestedBankTransactionTaxUpdate(input: {
  amountMinor: number;
  description: string;
  reference: string | null;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
  occurredOn?: Date | string | null;
}) {
  const resolved = resolveBankTransactionTax({
    amountMinor: input.amountMinor,
    description: input.description,
    reference: input.reference,
    vatTreatment: "NONE",
    whtTreatment: "NONE",
    vatRate: 0,
    whtRate: 0,
    vatAmountMinor: 0,
    whtAmountMinor: 0,
    taxTreatmentSource: "SUGGESTED",
    suggestedVatTreatment: input.suggestedVatTreatment,
    suggestedWhtTreatment: input.suggestedWhtTreatment,
    occurredOn: input.occurredOn,
  });

  return {
    vatTreatment: resolved.vatTreatment,
    whtTreatment: resolved.whtTreatment,
    vatRate: resolved.vatRate,
    whtRate: resolved.whtRate,
    vatAmountMinor: resolved.vatAmountMinor,
    whtAmountMinor: resolved.whtAmountMinor,
    taxTreatmentSource: "SUGGESTED" as const,
  };
}

function buildTransactionTaxWhere(input: TransactionTaxFilters) {
  const normalizedQuery = normalizeString(input.query);

  return {
    workspaceId: input.workspaceId,
    reviewStatus: input.reviewStatus ?? undefined,
    clientBusinessId: input.clientBusinessId ?? undefined,
    bankAccountId: input.bankAccountId ?? undefined,
    categoryId: input.categoryId ?? undefined,
    transactionDate:
      input.dateFrom || input.dateTo
        ? {
            gte: input.dateFrom ?? undefined,
            lte: input.dateTo ?? undefined,
          }
        : undefined,
    OR: normalizedQuery
      ? [
          {
            description: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reference: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reviewNotes: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            category: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            bankAccount: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            clientBusiness: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
        ]
      : undefined,
  } satisfies Prisma.BankTransactionWhereInput;
}

function buildCompatibleTransactionTaxWhere(input: TransactionTaxFilters) {
  if (input.categoryId || (input.reviewStatus && input.reviewStatus !== "POSTED")) {
    return null;
  }

  const normalizedQuery = normalizeString(input.query);

  return {
    workspaceId: input.workspaceId,
    matchedLedgerTransactionId:
      input.reviewStatus === "POSTED"
        ? {
            not: null,
          }
        : undefined,
    clientBusinessId: input.clientBusinessId ?? undefined,
    bankAccountId: input.bankAccountId ?? undefined,
    transactionDate:
      input.dateFrom || input.dateTo
        ? {
            gte: input.dateFrom ?? undefined,
            lte: input.dateTo ?? undefined,
          }
        : undefined,
    OR: normalizedQuery
      ? [
          {
            description: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reference: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reviewNotes: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            bankAccount: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            clientBusiness: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
        ]
      : undefined,
  } satisfies Prisma.BankTransactionWhereInput;
}

function normalizeTransactionTaxRecord(
  record: TransactionTaxRecordPayload | TransactionTaxFallbackRecordPayload
): TransactionTaxRecord {
  return {
    id: record.id,
    transactionDate: record.transactionDate,
    description: record.description,
    reference: record.reference,
    amount: record.amount,
    currency: record.currency,
    reviewStatus:
      "reviewStatus" in record
        ? record.reviewStatus
        : record.matchedLedgerTransactionId
          ? "POSTED"
          : "IMPORTED",
    reviewNotes: record.reviewNotes,
    vatTreatment: "vatTreatment" in record ? record.vatTreatment : "NONE",
    whtTreatment: "whtTreatment" in record ? record.whtTreatment : "NONE",
    vatRate: "vatRate" in record ? record.vatRate : 0,
    whtRate: "whtRate" in record ? record.whtRate : 0,
    vatAmountMinor: "vatAmountMinor" in record ? record.vatAmountMinor : 0,
    whtAmountMinor: "whtAmountMinor" in record ? record.whtAmountMinor : 0,
    taxTreatmentSource: "taxTreatmentSource" in record ? record.taxTreatmentSource : "UNSET",
    suggestedVatTreatment: record.suggestedVatTreatment,
    suggestedWhtTreatment: record.suggestedWhtTreatment,
    bankAccount: record.bankAccount,
    clientBusiness: record.clientBusiness,
    category:
      "category" in record
        ? record.category
          ? {
              id: record.category.id,
              name: record.category.name,
              type: record.category.type,
            }
          : null
        : null,
  };
}

async function loadTransactionTaxRecords(
  where: Prisma.BankTransactionWhereInput,
  useCompatibleQuery: boolean
) {
  if (useCompatibleQuery) {
    const records = await prisma.bankTransaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      select: transactionTaxFallbackSelect,
    });

    return records.map(normalizeTransactionTaxRecord);
  }

  const records = await prisma.bankTransaction.findMany({
    where,
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    select: transactionTaxSelect,
  });

  return records.map(normalizeTransactionTaxRecord);
}

async function loadTransactionTaxOptions(
  workspaceId: number
): Promise<TransactionTaxSummary["options"]> {
  try {
    const clientBusinesses = await prisma.clientBusiness.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    });

    const bankAccounts = await prisma.bankAccount.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    });

    const categories = await prisma.transactionCategory.findMany({
      where: {
        clientBusiness: {
          workspaceId,
          archivedAt: null,
        },
      },
      orderBy: [{ clientBusiness: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        clientBusiness: {
          select: {
            name: true,
          },
        },
      },
    });

    return {
      clientBusinesses,
      bankAccounts,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        clientBusinessName: category.clientBusiness.name,
      })),
    };
  } catch (error) {
    logError("transaction-tax", "Failed to load transaction tax filter options; returning empty options.", error, {
      workspaceId,
    });

    return {
      clientBusinesses: [],
      bankAccounts: [],
      categories: [],
    };
  }
}

function resolveCurrency(records: TransactionTaxRecord[]) {
  const currencies = new Set(records.map((record) => record.currency).filter(Boolean));
  if (currencies.size === 0) return "NGN";
  return currencies.size === 1 ? [...currencies][0] : "NGN";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function buildDateLabel(dateFrom?: Date | null, dateTo?: Date | null) {
  if (dateFrom && dateTo) {
    return `${formatDate(dateFrom)} - ${formatDate(dateTo)}`;
  }
  if (dateFrom) {
    return `From ${formatDate(dateFrom)}`;
  }
  if (dateTo) {
    return `Until ${formatDate(dateTo)}`;
  }
  return "All transaction history";
}

function buildTransactionTaxSummaryCacheKey(
  input: TransactionTaxFilters,
  periodPreset: TransactionTaxPeriodPreset,
  drilldownLimit: number
) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    query: normalizeString(input.query).toLowerCase(),
    reviewStatus: input.reviewStatus ?? "ALL",
    clientBusinessId: input.clientBusinessId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    categoryId: input.categoryId ?? null,
    dateFrom: input.dateFrom?.toISOString() ?? null,
    dateTo: input.dateTo?.toISOString() ?? null,
    periodPreset,
    defaultDateWindowApplied: Boolean(input.defaultDateWindowApplied),
    drilldownLimit,
  });
}

function clearTransactionTaxSummaryCacheEntry(cacheKey: string) {
  const timer = taxSummaryCacheTimers.get(cacheKey);
  if (timer) {
    clearTimeout(timer);
    taxSummaryCacheTimers.delete(cacheKey);
  }

  taxSummaryCache.delete(cacheKey);
}

function scheduleTransactionTaxSummaryCacheExpiry(cacheKey: string) {
  const existingTimer = taxSummaryCacheTimers.get(cacheKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    taxSummaryCache.delete(cacheKey);
    taxSummaryCacheTimers.delete(cacheKey);
  }, TRANSACTION_TAX_SUMMARY_CACHE_TTL_MS);

  timer.unref?.();
  taxSummaryCacheTimers.set(cacheKey, timer);
}

export function getTransactionTaxPeriodPresetRange(
  preset: TransactionTaxPeriodPreset,
  now = new Date()
) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (preset) {
    case "PREVIOUS_MONTH": {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      return { dateFrom: start, dateTo: end };
    }
    case "LAST_30_DAYS": {
      const end = new Date(Date.UTC(year, month, now.getUTCDate(), 23, 59, 59, 999));
      const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
      start.setUTCHours(0, 0, 0, 0);
      return { dateFrom: start, dateTo: end };
    }
    case "CURRENT_QUARTER": {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const start = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, quarterStartMonth + 3, 0, 23, 59, 59, 999));
      return { dateFrom: start, dateTo: end };
    }
    case "YEAR_TO_DATE": {
      const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, now.getUTCDate(), 23, 59, 59, 999));
      return { dateFrom: start, dateTo: end };
    }
    case "CUSTOM":
      return { dateFrom: null, dateTo: null };
    case "CURRENT_MONTH":
    default:
      return getDefaultTransactionTaxDateRange(now);
  }
}

function resolvePeriodPreset(input: {
  periodPreset?: TransactionTaxPeriodPreset | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}) {
  if (input.dateFrom || input.dateTo) {
    return "CUSTOM" satisfies TransactionTaxPeriodPreset;
  }

  return input.periodPreset ?? "CURRENT_MONTH";
}

function getComparisonDateRange(dateFrom?: Date | null, dateTo?: Date | null) {
  if (!dateFrom || !dateTo) {
    return null;
  }

  const durationMs = Math.max(24 * 60 * 60 * 1000, dateTo.getTime() - dateFrom.getTime() + 1);
  const previousDateTo = new Date(dateFrom.getTime() - 1);
  const previousDateFrom = new Date(previousDateTo.getTime() - durationMs + 1);

  return {
    dateFrom: previousDateFrom,
    dateTo: previousDateTo,
    dateLabel: buildDateLabel(previousDateFrom, previousDateTo),
  };
}

function getVatLiabilityEffect(tax: ResolvedTransactionTax) {
  if (tax.vatTreatment === "OUTPUT") return tax.vatAmountMinor;
  if (tax.vatTreatment === "INPUT") return -tax.vatAmountMinor;
  return 0;
}

function getWhtLiabilityEffect(tax: ResolvedTransactionTax) {
  if (tax.whtTreatment === "PAYABLE") return tax.whtAmountMinor;
  if (tax.whtTreatment === "RECEIVABLE") return -tax.whtAmountMinor;
  return 0;
}

function getTaxTypeContribution(
  taxType: TransactionTaxType,
  tax: ResolvedTransactionTax
) {
  return taxType === "VAT" ? getVatLiabilityEffect(tax) : getWhtLiabilityEffect(tax);
}

function getTaxChangeDirection(
  currentAmountMinor: number,
  previousAmountMinor: number | null
): TransactionTaxChangeDirection {
  if (previousAmountMinor === null) return "NEW";
  if (currentAmountMinor > previousAmountMinor) return "UP";
  if (currentAmountMinor < previousAmountMinor) return "DOWN";
  return "FLAT";
}

function formatTaxTypeLabel(taxType: TransactionTaxType) {
  return taxType === "VAT" ? "VAT" : "WHT";
}

function buildTaxDriverReason(input: {
  taxType: TransactionTaxType;
  direction: TransactionTaxDirection;
  label: string;
}) {
  if (input.taxType === "VAT") {
    return input.direction === "INCREASES_DUE"
      ? `${input.label} is contributing output VAT that increases the current due position.`
      : `${input.label} is contributing input VAT relief that reduces the current due position.`;
  }

  return input.direction === "INCREASES_DUE"
    ? `${input.label} is contributing payable withholding that increases the current due position.`
    : `${input.label} is contributing receivable withholding credit that reduces the current due position.`;
}

function buildTraceExplanation(record: TransactionTaxRecord, tax: ResolvedTransactionTax) {
  const vatEffect = getVatLiabilityEffect(tax);
  const whtEffect = getWhtLiabilityEffect(tax);
  const reasons: string[] = [];

  if (vatEffect > 0) {
    reasons.push(`Output VAT increases due by ${formatCurrencyMinor(vatEffect, record.currency)}.`);
  } else if (vatEffect < 0) {
    reasons.push(`Input VAT reduces due by ${formatCurrencyMinor(Math.abs(vatEffect), record.currency)}.`);
  }

  if (whtEffect > 0) {
    reasons.push(`WHT payable increases due by ${formatCurrencyMinor(whtEffect, record.currency)}.`);
  } else if (whtEffect < 0) {
    reasons.push(`WHT receivable reduces due by ${formatCurrencyMinor(Math.abs(whtEffect), record.currency)}.`);
  }

  if (tax.taxTreatmentSource === "MANUAL") {
    reasons.push("Treatment was manually set.");
  } else if (tax.taxTreatmentSource === "SUGGESTED") {
    reasons.push("Treatment was stored from an approved suggestion.");
  } else if (tax.usesSuggestedFallback) {
    reasons.push("Treatment currently falls back to the suggestion layer.");
  }

  return reasons.join(" ") || "This transaction does not currently move VAT or WHT due.";
}

function formatCurrencyMinor(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function buildDriverBucketLabel(
  record: TransactionTaxRecord,
  taxType: TransactionTaxType,
  tax: ResolvedTransactionTax
) {
  const baseLabel = record.category?.name ?? "uncategorized";
  const treatmentLabel =
    taxType === "VAT"
      ? tax.vatTreatment === "OUTPUT"
        ? "Output VAT"
        : tax.vatTreatment === "INPUT"
          ? "Input VAT"
          : "VAT"
      : tax.whtTreatment === "PAYABLE"
        ? "WHT payable"
        : tax.whtTreatment === "RECEIVABLE"
          ? "WHT receivable"
          : "WHT";

  return `${baseLabel} · ${treatmentLabel}`;
}

function buildLiabilityDriverRows(input: {
  taxType: TransactionTaxType;
  currentRecords: Array<TransactionTaxRecord & { tax: ResolvedTransactionTax }>;
  previousRecords: Array<TransactionTaxRecord & { tax: ResolvedTransactionTax }>;
}) {
  const currentBuckets = new Map<
    string,
    {
      key: string;
      label: string;
      direction: TransactionTaxDirection;
      amountMinor: number;
      transactionCount: number;
    }
  >();

  for (const record of input.currentRecords) {
    const contribution = getTaxTypeContribution(input.taxType, record.tax);
    if (contribution === 0) continue;

    const direction: TransactionTaxDirection =
      contribution >= 0 ? "INCREASES_DUE" : "REDUCES_DUE";
    const label = buildDriverBucketLabel(record, input.taxType, record.tax);
    const key = `${direction}:${label}`;
    const bucket = currentBuckets.get(key) ?? {
      key,
      label,
      direction,
      amountMinor: 0,
      transactionCount: 0,
    };
    bucket.amountMinor += Math.abs(contribution);
    bucket.transactionCount += 1;
    currentBuckets.set(key, bucket);
  }

  const previousBuckets = new Map<string, number>();
  for (const record of input.previousRecords) {
    const contribution = getTaxTypeContribution(input.taxType, record.tax);
    if (contribution === 0) continue;

    const direction: TransactionTaxDirection =
      contribution >= 0 ? "INCREASES_DUE" : "REDUCES_DUE";
    const label = buildDriverBucketLabel(record, input.taxType, record.tax);
    const key = `${direction}:${label}`;
    previousBuckets.set(key, (previousBuckets.get(key) ?? 0) + Math.abs(contribution));
  }

  return Array.from(currentBuckets.values())
    .map((bucket) => {
      const previousAmountMinor = previousBuckets.get(bucket.key) ?? 0;
      const changeMinor = bucket.amountMinor - previousAmountMinor;

      return {
        key: bucket.key,
        label: bucket.label,
        taxType: input.taxType,
        direction: bucket.direction,
        transactionCount: bucket.transactionCount,
        amountMinor: bucket.amountMinor,
        previousAmountMinor,
        changeMinor,
        reason: buildTaxDriverReason({
          taxType: input.taxType,
          direction: bucket.direction,
          label: bucket.label,
        }),
      } satisfies TransactionTaxLiabilityDriver;
    })
    .sort((left, right) => Math.abs(right.changeMinor ?? right.amountMinor) - Math.abs(left.changeMinor ?? left.amountMinor))
    .slice(0, 6);
}

function buildLiabilityExplanationSummary(input: {
  taxType: TransactionTaxType;
  currency: string;
  currentDueMinor: number;
  previousDueMinor: number | null;
  comparisonDateLabel: string | null;
  drivers: TransactionTaxLiabilityDriver[];
}) {
  const label = formatTaxTypeLabel(input.taxType);
  if (input.previousDueMinor === null || !input.comparisonDateLabel) {
    return `${label} due is currently ${formatCurrencyMinor(input.currentDueMinor, input.currency)} for the selected period.`;
  }

  const changeMinor = input.currentDueMinor - input.previousDueMinor;
  const topDriver = input.drivers[0];
  if (changeMinor === 0) {
    return `${label} due is flat versus ${input.comparisonDateLabel}. ${topDriver ? topDriver.reason : "The same transaction mix is still driving the liability."}`;
  }

  const direction = changeMinor > 0 ? "rose" : "fell";
  return `${label} due ${direction} by ${formatCurrencyMinor(Math.abs(changeMinor), input.currency)} versus ${input.comparisonDateLabel}. ${topDriver ? topDriver.reason : "The change is driven by the current transaction mix."}`;
}

function buildVatRows(records: Array<TransactionTaxRecord & { tax: ResolvedTransactionTax }>) {
  const buckets = new Map<VatTreatment, TransactionTaxBreakdownRow>([
    [
      "OUTPUT",
      {
        key: "OUTPUT",
        label: "Output VAT",
        transactionCount: 0,
        grossAmountMinor: 0,
        taxableAmountMinor: 0,
        taxAmountMinor: 0,
        averageRate: 0,
      },
    ],
    [
      "INPUT",
      {
        key: "INPUT",
        label: "Input VAT",
        transactionCount: 0,
        grossAmountMinor: 0,
        taxableAmountMinor: 0,
        taxAmountMinor: 0,
        averageRate: 0,
      },
    ],
    [
      "EXEMPT",
      {
        key: "EXEMPT",
        label: "Exempt",
        transactionCount: 0,
        grossAmountMinor: 0,
        taxableAmountMinor: 0,
        taxAmountMinor: 0,
        averageRate: 0,
      },
    ],
  ]);

  let outputVatMinor = 0;
  let inputVatMinor = 0;
  let exemptTransactionCount = 0;
  let taxableTransactionCount = 0;
  let grossAmountMinor = 0;
  let taxableAmountMinor = 0;

  for (const record of records) {
    const bucket = buckets.get(record.tax.vatTreatment);
    if (!bucket) continue;

    const vatTaxableAmount =
      record.tax.vatTreatment === "NONE" || record.tax.vatTreatment === "EXEMPT"
        ? 0
        : Math.max(record.amount - record.tax.vatAmountMinor, 0);

    bucket.transactionCount += 1;
    bucket.grossAmountMinor += record.amount;
    bucket.taxableAmountMinor += vatTaxableAmount;
    bucket.taxAmountMinor += record.tax.vatAmountMinor;
    bucket.averageRate += record.tax.vatRate;

    grossAmountMinor += record.amount;
    taxableAmountMinor += vatTaxableAmount;

    if (record.tax.vatTreatment === "OUTPUT") {
      outputVatMinor += record.tax.vatAmountMinor;
      taxableTransactionCount += 1;
    } else if (record.tax.vatTreatment === "INPUT") {
      inputVatMinor += record.tax.vatAmountMinor;
      taxableTransactionCount += 1;
    } else if (record.tax.vatTreatment === "EXEMPT") {
      exemptTransactionCount += 1;
    }
  }

  const rows = Array.from(buckets.values())
    .filter((row) => row.transactionCount > 0)
    .map((row) => ({
      ...row,
      averageRate:
        row.transactionCount > 0 ? Math.round((row.averageRate / row.transactionCount) * 100) / 100 : 0,
    }));

  return {
    outputVatMinor,
    inputVatMinor,
    exemptTransactionCount,
    taxableTransactionCount,
    grossAmountMinor,
    taxableAmountMinor,
    netVatMinor: outputVatMinor - inputVatMinor,
    rows,
  };
}

function buildWhtRows(records: Array<TransactionTaxRecord & { tax: ResolvedTransactionTax }>) {
  const buckets = new Map<WhtTreatment, TransactionTaxBreakdownRow>([
    [
      "PAYABLE",
      {
        key: "PAYABLE",
        label: "WHT payable",
        transactionCount: 0,
        grossAmountMinor: 0,
        taxableAmountMinor: 0,
        taxAmountMinor: 0,
        averageRate: 0,
      },
    ],
    [
      "RECEIVABLE",
      {
        key: "RECEIVABLE",
        label: "WHT receivable",
        transactionCount: 0,
        grossAmountMinor: 0,
        taxableAmountMinor: 0,
        taxAmountMinor: 0,
        averageRate: 0,
      },
    ],
  ]);

  let payableMinor = 0;
  let receivableMinor = 0;
  let taxableTransactionCount = 0;
  let grossAmountMinor = 0;

  for (const record of records) {
    const bucket = buckets.get(record.tax.whtTreatment);
    if (!bucket) continue;

    bucket.transactionCount += 1;
    bucket.grossAmountMinor += record.amount;
    bucket.taxableAmountMinor += record.amount;
    bucket.taxAmountMinor += record.tax.whtAmountMinor;
    bucket.averageRate += record.tax.whtRate;

    grossAmountMinor += record.amount;
    taxableTransactionCount += 1;

    if (record.tax.whtTreatment === "PAYABLE") {
      payableMinor += record.tax.whtAmountMinor;
    } else if (record.tax.whtTreatment === "RECEIVABLE") {
      receivableMinor += record.tax.whtAmountMinor;
    }
  }

  const rows = Array.from(buckets.values())
    .filter((row) => row.transactionCount > 0)
    .map((row) => ({
      ...row,
      averageRate:
        row.transactionCount > 0 ? Math.round((row.averageRate / row.transactionCount) * 100) / 100 : 0,
    }));

  return {
    payableMinor,
    receivableMinor,
    taxableTransactionCount,
    grossAmountMinor,
    netWhtMinor: receivableMinor - payableMinor,
    rows,
  };
}

function serializeTaxTransactionRow(
  record: TransactionTaxRecord,
  tax: ResolvedTransactionTax
): TransactionTaxDrilldownRow {
  const vatLiabilityEffectMinor = getVatLiabilityEffect(tax);
  const whtLiabilityEffectMinor = getWhtLiabilityEffect(tax);

  return {
    id: record.id,
    transactionDate: record.transactionDate.toISOString(),
    description: record.description,
    reference: record.reference,
    amountMinor: record.amount,
    currency: record.currency,
    reviewStatus: record.reviewStatus,
    reviewNotes: record.reviewNotes,
    vatTreatment: tax.vatTreatment,
    whtTreatment: tax.whtTreatment,
    vatRate: tax.vatRate,
    whtRate: tax.whtRate,
    vatAmountMinor: tax.vatAmountMinor,
    whtAmountMinor: tax.whtAmountMinor,
    taxTreatmentSource: tax.taxTreatmentSource,
    usesSuggestedFallback: tax.usesSuggestedFallback,
    bankAccount: {
      id: record.bankAccount.id,
      name: record.bankAccount.name,
      bankName: record.bankAccount.bankName,
      accountNumber: record.bankAccount.accountNumber,
      currency: record.bankAccount.currency,
    },
    clientBusiness: record.clientBusiness
      ? {
          id: record.clientBusiness.id,
          name: record.clientBusiness.name,
          defaultCurrency: record.clientBusiness.defaultCurrency,
        }
      : null,
    category: record.category
      ? {
          id: record.category.id,
          name: record.category.name,
          type: record.category.type,
        }
      : null,
    trace: {
      sourceRecordType: "BANK_TRANSACTION",
      sourceRecordId: record.id,
      sourceRecordHref: `/dashboard/banking/review?transactionId=${record.id}`,
      vatLiabilityEffectMinor,
      whtLiabilityEffectMinor,
      totalLiabilityEffectMinor: vatLiabilityEffectMinor + whtLiabilityEffectMinor,
      explanation: buildTraceExplanation(record, tax),
    },
  };
}

export function getDefaultTransactionTaxDateRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  return {
    dateFrom: start,
    dateTo: end,
  };
}

export function formatDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildResolvedRecords(records: TransactionTaxRecord[]) {
  return records.map((record) => ({
    ...record,
    tax: resolveBankTransactionTax({
      amountMinor: record.amount,
      description: record.description,
      reference: record.reference,
      vatTreatment: record.vatTreatment,
      whtTreatment: record.whtTreatment,
      vatRate: record.vatRate,
      whtRate: record.whtRate,
      vatAmountMinor: record.vatAmountMinor,
      whtAmountMinor: record.whtAmountMinor,
      taxTreatmentSource: record.taxTreatmentSource,
      suggestedVatTreatment: record.suggestedVatTreatment,
      suggestedWhtTreatment: record.suggestedWhtTreatment,
      occurredOn: record.transactionDate,
    }),
  }));
}

function buildLiabilityExplanation(input: {
  taxType: TransactionTaxType;
  currency: string;
  currentDueMinor: number;
  previousDueMinor: number | null;
  comparisonDateLabel: string | null;
  currentRecords: Array<TransactionTaxRecord & { tax: ResolvedTransactionTax }>;
  previousRecords: Array<TransactionTaxRecord & { tax: ResolvedTransactionTax }>;
}) {
  const drivers = buildLiabilityDriverRows({
    taxType: input.taxType,
    currentRecords: input.currentRecords,
    previousRecords: input.previousRecords,
  });
  const topTransactions = input.currentRecords
    .filter((record) => getTaxTypeContribution(input.taxType, record.tax) !== 0)
    .sort(
      (left, right) =>
        Math.abs(getTaxTypeContribution(input.taxType, right.tax)) -
        Math.abs(getTaxTypeContribution(input.taxType, left.tax))
    )
    .slice(0, 5)
    .map((record) => serializeTaxTransactionRow(record, record.tax));

  return {
    taxType: input.taxType,
    label: input.taxType === "VAT" ? "VAT due" : "WHT due",
    currentDueMinor: input.currentDueMinor,
    previousDueMinor: input.previousDueMinor,
    changeMinor:
      input.previousDueMinor === null ? null : input.currentDueMinor - input.previousDueMinor,
    changeDirection: getTaxChangeDirection(input.currentDueMinor, input.previousDueMinor),
    summary: buildLiabilityExplanationSummary({
      taxType: input.taxType,
      currency: input.currency,
      currentDueMinor: input.currentDueMinor,
      previousDueMinor: input.previousDueMinor,
      comparisonDateLabel: input.comparisonDateLabel,
      drivers,
    }),
    drivers,
    topTransactions,
  } satisfies TransactionTaxLiabilityExplanation;
}

function buildTransactionTaxSummaryFromRecords(input: {
  filters: TransactionTaxFilters;
  periodPreset: TransactionTaxPeriodPreset;
  dateLabel: string;
  comparisonRange: ReturnType<typeof getComparisonDateRange>;
  drilldownLimit: number;
  generatedAt: Date;
  records: TransactionTaxRecord[];
  previousRecords: TransactionTaxRecord[];
  options: TransactionTaxSummary["options"];
}) {
  const recordsWithTax = buildResolvedRecords(input.records);
  const previousRecordsWithTax = buildResolvedRecords(input.previousRecords);

  const vat = buildVatRows(recordsWithTax);
  const wht = buildWhtRows(recordsWithTax);
  const previousVat = buildVatRows(previousRecordsWithTax);
  const previousWht = buildWhtRows(previousRecordsWithTax);
  const transactions = recordsWithTax
    .slice(0, input.drilldownLimit)
    .map((record) => serializeTaxTransactionRow(record, record.tax));

  const scope = {
    workspaceId: input.filters.workspaceId,
    query: normalizeString(input.filters.query) || null,
    reviewStatus: input.filters.reviewStatus ?? "ALL",
    clientBusinessId: input.filters.clientBusinessId ?? null,
    bankAccountId: input.filters.bankAccountId ?? null,
    categoryId: input.filters.categoryId ?? null,
    dateFrom: input.filters.dateFrom?.toISOString() ?? null,
    dateTo: input.filters.dateTo?.toISOString() ?? null,
    dateLabel: input.dateLabel,
    periodPreset: input.periodPreset,
    defaultDateWindowApplied: Boolean(input.filters.defaultDateWindowApplied),
  } satisfies TransactionTaxSummary["scope"];

  const cards = {
    vatOutputMinor: vat.outputVatMinor,
    vatInputMinor: vat.inputVatMinor,
    vatNetMinor: vat.netVatMinor,
    whtPayableMinor: wht.payableMinor,
    whtReceivableMinor: wht.receivableMinor,
    estimatedTaxExposureMinor: Math.max(vat.netVatMinor, 0) + wht.payableMinor,
  } satisfies TransactionTaxSummary["cards"];

  const liability = {
    vatDueMinor: Math.max(vat.netVatMinor, 0),
    whtDueMinor: Math.max(wht.payableMinor - wht.receivableMinor, 0),
    totalDueMinor:
      Math.max(vat.netVatMinor, 0) + Math.max(wht.payableMinor - wht.receivableMinor, 0),
    refreshedAt: input.generatedAt.toISOString(),
    mode: "TRANSACTION_DERIVED" as const,
    refreshIntervalMs: 20000,
  } satisfies TransactionTaxSummary["liability"];

  const explanations = {
    comparisonDateLabel: input.comparisonRange?.dateLabel ?? null,
    taxes: [
      buildLiabilityExplanation({
        taxType: "VAT",
        currency: resolveCurrency(input.records),
        currentDueMinor: liability.vatDueMinor,
        previousDueMinor: input.comparisonRange ? Math.max(previousVat.netVatMinor, 0) : null,
        comparisonDateLabel: input.comparisonRange?.dateLabel ?? null,
        currentRecords: recordsWithTax,
        previousRecords: previousRecordsWithTax,
      }),
      buildLiabilityExplanation({
        taxType: "WHT",
        currency: resolveCurrency(input.records),
        currentDueMinor: liability.whtDueMinor,
        previousDueMinor: input.comparisonRange
          ? Math.max(previousWht.payableMinor - previousWht.receivableMinor, 0)
          : null,
        comparisonDateLabel: input.comparisonRange?.dateLabel ?? null,
        currentRecords: recordsWithTax,
        previousRecords: previousRecordsWithTax,
      }),
    ],
    futureModules: [
      {
        key: "PAYE",
        label: "PAYE",
        status: "PLANNED",
        note: "Payroll liabilities can plug into the same live center once employee-level tax sources are mapped.",
      },
      {
        key: "CIT",
        label: "CIT",
        status: "PLANNED",
        note: "CIT can reuse this liability shell later while keeping its own support schedules and adjustments.",
      },
    ],
  } satisfies TransactionTaxSummary["explanations"];

  return {
    engineVersion: TRANSACTION_TAX_ENGINE_VERSION,
    exportSchemaVersion: TRANSACTION_TAX_EXPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    currency: resolveCurrency(input.records),
    scope,
    cards,
    liability,
    explanations,
    vat,
    wht,
    transactions,
    totalMatchingTransactions: input.records.length,
    hasMoreTransactions: input.records.length > input.drilldownLimit,
    options: input.options,
    export: {
      schemaVersion: TRANSACTION_TAX_EXPORT_SCHEMA_VERSION,
      countryCode: "NG",
      authority: NIGERIA_TAX_CONFIG.authority,
      generatedAt: input.generatedAt.toISOString(),
      engineVersion: TRANSACTION_TAX_ENGINE_VERSION,
      scope,
      cards,
      liability,
      explanations,
      vat,
      wht,
      transactions,
    },
  } satisfies TransactionTaxSummary;
}

async function loadWorkspaceTransactionTaxSummary(input: TransactionTaxFilters) {
  const periodPreset = resolvePeriodPreset(input);
  const comparisonRange = getComparisonDateRange(input.dateFrom, input.dateTo);
  const drilldownLimit = Math.max(1, Math.min(input.drilldownLimit ?? DEFAULT_DRILLDOWN_LIMIT, 500));
  const generatedAt = new Date();
  const dateLabel = buildDateLabel(input.dateFrom, input.dateTo);
  const buildSummary = (
    records: TransactionTaxRecord[],
    previousRecords: TransactionTaxRecord[],
    options: TransactionTaxSummary["options"]
  ) =>
    buildTransactionTaxSummaryFromRecords({
      filters: input,
      periodPreset,
      dateLabel,
      comparisonRange,
      drilldownLimit,
      generatedAt,
      records,
      previousRecords,
      options,
    });

  try {
    const supportsFullQuery = await hasPrismaDatabaseSupport(TRANSACTION_TAX_FULL_QUERY_SUPPORT);
    const useCompatibleQuery = !supportsFullQuery;
    const where = supportsFullQuery
      ? buildTransactionTaxWhere(input)
      : buildCompatibleTransactionTaxWhere(input);
    const previousWhere = comparisonRange
      ? supportsFullQuery
        ? buildTransactionTaxWhere({
            ...input,
            dateFrom: comparisonRange.dateFrom,
            dateTo: comparisonRange.dateTo,
          })
        : buildCompatibleTransactionTaxWhere({
            ...input,
            dateFrom: comparisonRange.dateFrom,
            dateTo: comparisonRange.dateTo,
          })
      : null;

    if (useCompatibleQuery) {
      const supportsCompatibleQuery = await hasPrismaDatabaseSupport(
        TRANSACTION_TAX_FALLBACK_QUERY_SUPPORT
      );
      if (!supportsCompatibleQuery) {
        logTransactionTaxWarningOnce(
          "missing-compatible-support",
          "Transaction tax summary support is incomplete in the current database; returning an empty summary.",
          {
            workspaceId: input.workspaceId,
          }
        );

        const options = await loadTransactionTaxOptions(input.workspaceId);
        return buildSummary([], [], options);
      }

      logTransactionTaxWarningOnce(
        "compatible-fallback",
        "Stored transaction tax columns are unavailable in the current database; using the suggested-tax fallback query.",
        {
          workspaceId: input.workspaceId,
        }
      );
    }

    if (!where) {
      logTransactionTaxWarningOnce(
        "unsupported-compatible-filters",
        "Transaction tax summary filters require columns that are not available in the current database yet; returning an empty summary.",
        {
          workspaceId: input.workspaceId,
          reviewStatus: input.reviewStatus ?? null,
          categoryId: input.categoryId ?? null,
        }
      );

      const options = await loadTransactionTaxOptions(input.workspaceId);
      return buildSummary([], [], options);
    }

    // Keep the summary path read-heavy and sequential so SSR doesn't fan out
    // multiple Prisma queries at once against a tight serverless pool.
    const records = await loadTransactionTaxRecords(where, useCompatibleQuery);
    const previousRecords = previousWhere
      ? await loadTransactionTaxRecords(previousWhere, useCompatibleQuery)
      : [];
    const options = await loadTransactionTaxOptions(input.workspaceId);

    return buildSummary(records, previousRecords, options);
  } catch (error) {
    if (
      isPrismaSchemaCompatibilityError(error, {
        tables: [...TRANSACTION_TAX_FULL_QUERY_SUPPORT.tables],
        columns: [
          ...TRANSACTION_TAX_FULL_QUERY_SUPPORT.columns,
          ...TRANSACTION_TAX_FALLBACK_QUERY_SUPPORT.columns,
        ],
      })
    ) {
      logTransactionTaxWarningOnce(
        "runtime-compatibility-fallback",
        "Transaction tax summary hit a database compatibility mismatch at runtime; returning an empty summary.",
        {
          workspaceId: input.workspaceId,
        }
      );
    } else {
      logError(
        "transaction-tax",
        "Transaction tax summary failed; returning a safe empty summary.",
        error,
        {
          workspaceId: input.workspaceId,
        }
      );
    }

    const options = await loadTransactionTaxOptions(input.workspaceId);
    return buildSummary([], [], options);
  }
}

export async function getWorkspaceTransactionTaxSummary(input: TransactionTaxFilters) {
  const periodPreset = resolvePeriodPreset(input);
  const drilldownLimit = Math.max(1, Math.min(input.drilldownLimit ?? DEFAULT_DRILLDOWN_LIMIT, 500));
  const cacheKey = buildTransactionTaxSummaryCacheKey(input, periodPreset, drilldownLimit);
  const cached = taxSummaryCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const summaryPromise = loadWorkspaceTransactionTaxSummary(input);
  taxSummaryCache.set(cacheKey, summaryPromise);

  summaryPromise
    .then(() => {
      scheduleTransactionTaxSummaryCacheExpiry(cacheKey);
    })
    .catch(() => {
      clearTransactionTaxSummaryCacheEntry(cacheKey);
    });

  return summaryPromise;
}

async function getDashboardLedgerTaxCardSnapshot(input: {
  workspaceId: number;
  dateFrom: Date;
  dateTo: Date;
}): Promise<DashboardTaxCardSnapshot> {
  const records = await prisma.ledgerTransaction.findMany({
    where: {
      clientBusiness: {
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
      reviewStatus: "POSTED",
      transactionDate: {
        gte: input.dateFrom,
        lte: input.dateTo,
      },
    },
    select: dashboardLedgerTaxCardSelect,
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
  });

  let vatOutputMinor = 0;
  let vatInputMinor = 0;
  let whtPayableMinor = 0;
  let whtReceivableMinor = 0;
  let vatTransactionCount = 0;
  let whtTransactionCount = 0;

  for (const record of records) {
    if (record.vatAmountMinor > 0) {
      if (record.vatTreatment === "OUTPUT") {
        vatOutputMinor += record.vatAmountMinor;
        vatTransactionCount += 1;
      } else if (record.vatTreatment === "INPUT") {
        vatInputMinor += record.vatAmountMinor;
        vatTransactionCount += 1;
      }
    }

    if (record.whtAmountMinor > 0) {
      if (record.whtTreatment === "PAYABLE") {
        whtPayableMinor += record.whtAmountMinor;
        whtTransactionCount += 1;
      } else if (record.whtTreatment === "RECEIVABLE") {
        whtReceivableMinor += record.whtAmountMinor;
        whtTransactionCount += 1;
      }
    }
  }

  const dateLabel = buildDateLabel(input.dateFrom, input.dateTo);
  const vatNetMinor = vatOutputMinor - vatInputMinor;
  const vatDueMinor = Math.max(vatNetMinor, 0);
  const whtDueMinor = Math.max(whtPayableMinor - whtReceivableMinor, 0);

  return {
    dateLabel,
    vatNetMinor,
    whtPayableMinor,
    vatDueMinor,
    whtDueMinor,
    totalDueMinor: vatDueMinor + whtDueMinor,
    whtReceivableMinor,
    estimatedTaxExposureMinor: vatDueMinor + whtPayableMinor,
    vatDueExplanation:
      vatTransactionCount > 0
        ? `VAT due is computed from posted ledger transactions for ${dateLabel}, using output VAT minus input VAT.`
        : `No posted ledger VAT activity was recorded for ${dateLabel}.`,
    whtDueExplanation:
      whtTransactionCount > 0
        ? `WHT due is computed from posted ledger transactions for ${dateLabel}, using payable WHT minus receivable WHT.`
        : `No posted ledger WHT activity was recorded for ${dateLabel}.`,
    totalDueExplanation: `Current VAT due plus WHT due from posted ledger transactions for ${dateLabel}.`,
    generatedAt: new Date().toISOString(),
  } satisfies DashboardTaxCardSnapshot;
}

export async function getDashboardTaxCardSnapshot(workspaceId: number) {
  const { dateFrom, dateTo } = getDefaultTransactionTaxDateRange();
  try {
    if (await hasPrismaDatabaseSupport(DASHBOARD_LEDGER_TAX_CARD_SUPPORT)) {
      return await getDashboardLedgerTaxCardSnapshot({
        workspaceId,
        dateFrom,
        dateTo,
      });
    }

    logTransactionTaxWarningOnce(
      "dashboard-ledger-tax-card-support-fallback",
      "Dashboard tax cards are falling back to BankTransaction tax data because the posted-ledger tax columns are unavailable in the current database.",
      {
        workspaceId,
      }
    );
  } catch (error) {
    if (
      isPrismaSchemaCompatibilityError(error, {
        tables: [...DASHBOARD_LEDGER_TAX_CARD_SUPPORT.tables],
        columns: [...DASHBOARD_LEDGER_TAX_CARD_SUPPORT.columns],
      })
    ) {
      logTransactionTaxWarningOnce(
        "dashboard-ledger-tax-card-runtime-fallback",
        "Dashboard tax cards hit a ledger schema mismatch at runtime and are falling back to BankTransaction tax data.",
        {
          workspaceId,
        }
      );
    } else {
      logError(
        "transaction-tax",
        "Dashboard tax card ledger query failed; falling back to BankTransaction tax data.",
        error,
        {
          workspaceId,
        }
      );
    }
  }

  const summary = await getWorkspaceTransactionTaxSummary({
    workspaceId,
    reviewStatus: "POSTED",
    dateFrom,
    dateTo,
    defaultDateWindowApplied: true,
    drilldownLimit: 1,
  });

  const vatExplanation = summary.explanations.taxes.find((item) => item.taxType === "VAT");
  const whtExplanation = summary.explanations.taxes.find((item) => item.taxType === "WHT");

  return {
    dateLabel: summary.scope.dateLabel,
    vatNetMinor: summary.cards.vatNetMinor,
    whtPayableMinor: summary.cards.whtPayableMinor,
    vatDueMinor: summary.liability.vatDueMinor,
    whtDueMinor: summary.liability.whtDueMinor,
    totalDueMinor: summary.liability.totalDueMinor,
    whtReceivableMinor: summary.cards.whtReceivableMinor,
    estimatedTaxExposureMinor: summary.cards.estimatedTaxExposureMinor,
    vatDueExplanation:
      vatExplanation?.summary ??
      `VAT due is computed from transaction tax treatments for ${summary.scope.dateLabel}.`,
    whtDueExplanation:
      whtExplanation?.summary ??
      `WHT due is computed from transaction tax treatments for ${summary.scope.dateLabel}.`,
    totalDueExplanation: `Current VAT due plus WHT due for ${summary.scope.dateLabel}.`,
    generatedAt: summary.generatedAt,
  } satisfies DashboardTaxCardSnapshot;
}
