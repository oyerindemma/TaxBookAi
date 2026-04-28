import "server-only";

import type { Prisma } from "@prisma/client";
import { getWorkspaceFilingReadiness } from "@/lib/filing-readiness";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import { getWorkspaceTransactionTaxSummary } from "@/lib/transaction-tax";
import type {
  ExplainMyNumbersAnalyticsSnapshot,
  ExplainMyNumbersContributionRow,
  ExplainMyNumbersDelta,
  ExplainMyNumbersPeriodPreset,
  ExplainMyNumbersPeriodRange,
  ExplainMyNumbersSource,
  ExplainMyNumbersTaxDriver,
} from "@/lib/explain-my-numbers-types";

const CONTRIBUTION_LIMIT = 5;
const CONTRIBUTION_SOURCE_LIMIT = 2;
const TAX_SOURCE_LIMIT = 6;
const EXPLAIN_ANALYTICS_SCHEMA_TABLES = [
  "Workspace",
  "WorkspaceSubscription",
  "ClientBusiness",
  "TransactionCategory",
  "Vendor",
  "LedgerTransaction",
  "BankAccount",
  "BankTransaction",
  "TaxRecord",
] as const;
const EXPLAIN_ANALYTICS_SCHEMA_COLUMNS = [
  "Workspace.",
  "WorkspaceSubscription.",
  "ClientBusiness.",
  "TransactionCategory.",
  "Vendor.",
  "LedgerTransaction.",
  "BankAccount.",
  "BankTransaction.",
  "TaxRecord.",
] as const;
const EXPLAIN_TAX_MOVEMENT_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.reviewStatus",
    "BankTransaction.vatTreatment",
    "BankTransaction.whtTreatment",
    "BankTransaction.vatRate",
    "BankTransaction.whtRate",
    "BankTransaction.vatAmountMinor",
    "BankTransaction.whtAmountMinor",
    "BankTransaction.taxTreatmentSource",
  ],
} as const;
const EXPLAIN_LEDGER_ANALYTICS_BASE_SUPPORT = {
  tables: ["LedgerTransaction", "ClientBusiness", "TransactionCategory", "Vendor", "BankTransaction"],
  columns: [
    "LedgerTransaction.reviewStatus",
    "LedgerTransaction.taxCategory",
    "LedgerTransaction.bankTransactionId",
  ],
} as const;
const EXPLAIN_LEDGER_ANALYTICS_ENRICHED_SUPPORT = {
  tables: ["BankTransaction"],
  columns: ["BankTransaction.normalizedMerchantName"],
} as const;
const explainAnalyticsWarningKeys = new Set<string>();

const ledgerTransactionExplainSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  direction: true,
  amountMinor: true,
  currency: true,
  taxCategory: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
    },
  },
  vendor: {
    select: {
      id: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  bankTransaction: {
    select: {
      id: true,
      normalizedMerchantName: true,
      description: true,
      reference: true,
    },
  },
} satisfies Prisma.LedgerTransactionSelect;

const ledgerTransactionExplainFallbackSelect = {
  id: true,
  transactionDate: true,
  description: true,
  reference: true,
  direction: true,
  amountMinor: true,
  currency: true,
  taxCategory: true,
  clientBusiness: {
    select: {
      id: true,
      name: true,
    },
  },
  vendor: {
    select: {
      id: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  bankTransaction: {
    select: {
      id: true,
      description: true,
      reference: true,
    },
  },
} satisfies Prisma.LedgerTransactionSelect;

type ExplainLedgerTransactionQueryRecord = Prisma.LedgerTransactionGetPayload<{
  select: typeof ledgerTransactionExplainSelect;
}>;
type ExplainLegacyLedgerTransactionQueryRecord = Prisma.LedgerTransactionGetPayload<{
  select: typeof ledgerTransactionExplainFallbackSelect;
}>;
type ExplainLedgerTransaction = {
  id: number;
  transactionDate: Date;
  description: string;
  reference: string | null;
  direction: ExplainLedgerTransactionQueryRecord["direction"];
  amountMinor: number;
  currency: string;
  taxCategory: ExplainLedgerTransactionQueryRecord["taxCategory"];
  clientBusiness: {
    id: number;
    name: string;
  };
  vendor: {
    id: number;
    name: string;
  } | null;
  category: {
    id: number;
    name: string;
    type: string;
  } | null;
  bankTransaction: {
    id: number;
    normalizedMerchantName: string | null;
    description: string;
    reference: string | null;
  } | null;
};

function logExplainAnalyticsWarningOnce(
  key: string,
  message: string,
  metadata: Record<string, unknown>
) {
  if (explainAnalyticsWarningKeys.has(key)) {
    return;
  }

  explainAnalyticsWarningKeys.add(key);
  logWarn("explain-my-numbers", message, metadata);
}

function normalizeExplainLedgerTransaction(
  record: ExplainLedgerTransactionQueryRecord | ExplainLegacyLedgerTransactionQueryRecord
): ExplainLedgerTransaction {
  return {
    id: record.id,
    transactionDate: record.transactionDate,
    description: record.description,
    reference: record.reference,
    direction: record.direction,
    amountMinor: record.amountMinor,
    currency: record.currency,
    taxCategory: record.taxCategory,
    clientBusiness: {
      id: record.clientBusiness.id,
      name: record.clientBusiness.name,
    },
    vendor: record.vendor
      ? {
          id: record.vendor.id,
          name: record.vendor.name,
        }
      : null,
    category: record.category
      ? {
          id: record.category.id,
          name: record.category.name,
          type: record.category.type,
        }
      : null,
    bankTransaction: record.bankTransaction
      ? {
          id: record.bankTransaction.id,
          normalizedMerchantName:
            "normalizedMerchantName" in record.bankTransaction
              ? record.bankTransaction.normalizedMerchantName ?? null
              : null,
          description: record.bankTransaction.description,
          reference: record.bankTransaction.reference,
        }
      : null,
  };
}

function isExplainAnalyticsSchemaCompatibilityError(error: unknown) {
  return isPrismaSchemaCompatibilityError(error, {
    tables: [...EXPLAIN_ANALYTICS_SCHEMA_TABLES],
    columns: [...EXPLAIN_ANALYTICS_SCHEMA_COLUMNS],
  });
}

async function runExplainAnalyticsQuerySafely<T>(input: {
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
    const schemaCompatibilityError = isExplainAnalyticsSchemaCompatibilityError(error);
    logError(
      "explain-my-numbers",
      `Explain-my-numbers ${input.label} failed; using a safe fallback.`,
      error,
      {
        workspaceId: input.workspaceId,
        failureKind: schemaCompatibilityError ? "SCHEMA_MISMATCH" : "QUERY_ERROR",
        schemaCompatibilityError,
      }
    );

    return input.fallback();
  }
}

async function loadExplainLedgerTransactions(input: {
  workspaceId: number;
  earliestFrom: Date;
  latestTo: Date;
}) {
  const supportsBaseQuery = await hasPrismaDatabaseSupport(
    EXPLAIN_LEDGER_ANALYTICS_BASE_SUPPORT
  );

  if (!supportsBaseQuery) {
    logExplainAnalyticsWarningOnce(
      "ledger-query-unavailable",
      "Explain-my-numbers ledger analytics are unavailable in the current database and will return an empty result.",
      {
        workspaceId: input.workspaceId,
        failureKind: "SCHEMA_MISMATCH",
      }
    );

    return [] satisfies ExplainLedgerTransaction[];
  }

  const supportsEnhancedBankTransactionFields = await hasPrismaDatabaseSupport(
    EXPLAIN_LEDGER_ANALYTICS_ENRICHED_SUPPORT
  );
  const queryInput = {
    where: {
      clientBusiness: {
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
      transactionDate: {
        gte: input.earliestFrom,
        lte: input.latestTo,
      },
      OR: [
        {
          reviewStatus: "POSTED" as const,
        },
        {
          taxCategory: "TAX_PAYMENT" as const,
        },
      ],
    },
    orderBy: {
      transactionDate: "desc" as const,
    },
  };

  if (!supportsEnhancedBankTransactionFields) {
    logExplainAnalyticsWarningOnce(
      "ledger-query-legacy-bank-transaction-enrichment",
      "Explain-my-numbers ledger analytics are using a legacy-safe bank transaction enrichment query because optional BankTransaction columns are unavailable.",
      {
        workspaceId: input.workspaceId,
        failureKind: "SCHEMA_MISMATCH",
      }
    );
  }

  try {
    const records = await prisma.ledgerTransaction.findMany({
      ...queryInput,
      select: supportsEnhancedBankTransactionFields
        ? ledgerTransactionExplainSelect
        : ledgerTransactionExplainFallbackSelect,
    });

    return records.map(normalizeExplainLedgerTransaction);
  } catch (error) {
    if (
      supportsEnhancedBankTransactionFields &&
      isPrismaSchemaCompatibilityError(error, {
        tables: [...EXPLAIN_LEDGER_ANALYTICS_ENRICHED_SUPPORT.tables],
        columns: [...EXPLAIN_LEDGER_ANALYTICS_ENRICHED_SUPPORT.columns],
      })
    ) {
      logExplainAnalyticsWarningOnce(
        "ledger-query-runtime-fallback",
        "Explain-my-numbers ledger analytics hit a runtime schema mismatch and are retrying with a legacy-safe bank transaction enrichment query.",
        {
          workspaceId: input.workspaceId,
          failureKind: "SCHEMA_MISMATCH",
        }
      );

      const fallbackRecords = await prisma.ledgerTransaction.findMany({
        ...queryInput,
        select: ledgerTransactionExplainFallbackSelect,
      });

      return fallbackRecords.map(normalizeExplainLedgerTransaction);
    }

    throw error;
  }
}

function buildEmptyExplainMyNumbersAnalyticsSnapshot(input: {
  period: ExplainMyNumbersPeriodRange;
  comparisonPeriod?: ExplainMyNumbersPeriodRange | null;
}): ExplainMyNumbersAnalyticsSnapshot {
  return {
    currency: "NGN",
    period: {
      current: input.period,
      previous: input.comparisonPeriod ?? null,
    },
    overview: {
      revenue: buildDelta(0, 0),
      expenses: buildDelta(0, 0),
      netProfit: buildDelta(0, 0),
      currentTransactionCount: 0,
      previousTransactionCount: 0,
    },
    expenseChange: {
      topCategories: [],
      topVendors: [],
    },
    taxMovement: null,
    filingReadiness: null,
  };
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}

function startOfQuarter(date: Date) {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
}

function endOfQuarter(date: Date) {
  const start = startOfQuarter(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0, 23, 59, 59, 999));
}

function startOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function endOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

function startOfWeekMonday(date: Date) {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999)
  );
}

function shiftMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12, 0, 0, 0));
}

function shiftDays(date: Date, amount: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount, 12, 0, 0, 0)
  );
}

function getQuarterNumber(date: Date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

export function resolveExplainMyNumbersPeriodPreset(question: string): ExplainMyNumbersPeriodPreset {
  const normalized = question.toLowerCase();

  if (normalized.includes("last 30") || normalized.includes("past 30")) {
    return "LAST_30_DAYS";
  }
  if (normalized.includes("this week") || normalized.includes("current week")) {
    return "THIS_WEEK";
  }
  if (normalized.includes("last month") || normalized.includes("previous month")) {
    return "LAST_MONTH";
  }
  if (normalized.includes("last quarter") || normalized.includes("previous quarter")) {
    return "LAST_QUARTER";
  }
  if (normalized.includes("this quarter") || normalized.includes("current quarter")) {
    return "THIS_QUARTER";
  }
  if (normalized.includes("this year") || normalized.includes("current year")) {
    return "THIS_YEAR";
  }

  return "THIS_MONTH";
}

export function buildExplainMyNumbersPeriodRange(
  preset: ExplainMyNumbersPeriodPreset,
  now = new Date()
): ExplainMyNumbersPeriodRange {
  const currentDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
  );

  if (preset === "THIS_WEEK") {
    const from = startOfWeekMonday(currentDate);
    const to = endOfWeekSunday(currentDate);
    return {
      preset,
      label: "this week",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "LAST_30_DAYS") {
    const to = new Date(
      Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate(), 23, 59, 59, 999)
    );
    const from = shiftDays(currentDate, -29);
    return {
      preset,
      label: "the last 30 days",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "LAST_MONTH") {
    const anchor = shiftMonths(currentDate, -1);
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    return {
      preset,
      label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "THIS_QUARTER") {
    const from = startOfQuarter(currentDate);
    const to = endOfQuarter(currentDate);
    return {
      preset,
      label: `Q${getQuarterNumber(currentDate)} ${currentDate.getUTCFullYear()}`,
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "LAST_QUARTER") {
    const anchor = shiftMonths(currentDate, -3);
    const from = startOfQuarter(anchor);
    const to = endOfQuarter(anchor);
    return {
      preset,
      label: `Q${getQuarterNumber(anchor)} ${anchor.getUTCFullYear()}`,
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (preset === "THIS_YEAR") {
    const from = startOfYear(currentDate);
    const to = endOfYear(currentDate);
    return {
      preset,
      label: String(currentDate.getUTCFullYear()),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  const from = startOfMonth(currentDate);
  const to = endOfMonth(currentDate);
  return {
    preset: "THIS_MONTH",
    label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    from,
    to,
    fromParam: formatDateParam(from),
    toParam: formatDateParam(to),
  };
}

export function getExplainMyNumbersComparisonRange(
  current: ExplainMyNumbersPeriodRange
): ExplainMyNumbersPeriodRange | null {
  if (current.preset === "THIS_WEEK") {
    const from = shiftDays(current.from, -7);
    const to = shiftDays(current.to, -7);
    return {
      preset: "THIS_WEEK",
      label: "the prior week",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (current.preset === "LAST_30_DAYS") {
    const from = shiftDays(current.from, -30);
    const to = shiftDays(current.from, -1);
    return {
      preset: "LAST_30_DAYS",
      label: "the prior 30 days",
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (current.preset === "THIS_MONTH") {
    return buildExplainMyNumbersPeriodRange("LAST_MONTH", current.from);
  }

  if (current.preset === "THIS_QUARTER") {
    return buildExplainMyNumbersPeriodRange("LAST_QUARTER", current.from);
  }

  if (current.preset === "THIS_YEAR") {
    const year = current.from.getUTCFullYear() - 1;
    const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    return {
      preset: "THIS_YEAR",
      label: String(year),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (current.preset === "LAST_MONTH") {
    const anchor = shiftMonths(current.from, -1);
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    return {
      preset: "LAST_MONTH",
      label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  if (current.preset === "LAST_QUARTER") {
    const anchor = shiftMonths(current.from, -3);
    const from = startOfQuarter(anchor);
    const to = endOfQuarter(anchor);
    return {
      preset: "LAST_QUARTER",
      label: `Q${getQuarterNumber(anchor)} ${anchor.getUTCFullYear()}`,
      from,
      to,
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
    };
  }

  return null;
}

function buildDelta(currentMinor: number, previousMinor: number): ExplainMyNumbersDelta {
  const deltaMinor = currentMinor - previousMinor;
  if (previousMinor === 0 && currentMinor > 0) {
    return {
      currentMinor,
      previousMinor,
      deltaMinor,
      deltaPercentage: null,
      direction: "NEW",
    };
  }

  const deltaPercentage =
    previousMinor === 0 ? 0 : Math.abs(deltaMinor) / Math.abs(previousMinor);
  const direction =
    deltaMinor > 0 ? "UP" : deltaMinor < 0 ? "DOWN" : "FLAT";

  return {
    currentMinor,
    previousMinor,
    deltaMinor,
    deltaPercentage,
    direction,
  };
}

function withinRange(date: Date, range: ExplainMyNumbersPeriodRange) {
  return date.getTime() >= range.from.getTime() && date.getTime() <= range.to.getTime();
}

function resolveCurrency(
  rows: ExplainLedgerTransaction[],
  fallback = "NGN"
) {
  const currencies = new Set(rows.map((row) => row.currency).filter(Boolean));
  if (currencies.size === 1) {
    return Array.from(currencies)[0] ?? fallback;
  }
  return fallback;
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

function truncate(value: string | null | undefined, maxLength = 44) {
  const normalized = value?.trim();
  if (!normalized) return "Untitled record";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getLedgerRecordKind(record: ExplainLedgerTransaction) {
  if (record.taxCategory === "TAX_PAYMENT") return "TAX";
  if (record.direction === "MONEY_IN") return "INCOME";
  if (record.direction === "MONEY_OUT") return "EXPENSE";
  return "JOURNAL";
}

function buildLedgerTransactionSource(record: ExplainLedgerTransaction): ExplainMyNumbersSource {
  const title = truncate(record.description);
  const detail = `${formatDate(record.transactionDate)} · ${formatMoney(
    record.amountMinor,
    record.currency
  )}`;

  if (record.bankTransaction?.id) {
    return {
      id: `bank-transaction-${record.bankTransaction.id}`,
      kind: "bank_transaction",
      title,
      detail,
      href: `/dashboard/banking/review?transactionId=${record.bankTransaction.id}`,
      badge: record.clientBusiness.name,
    };
  }

  return {
    id: `ledger-transaction-${record.id}`,
    kind: "ledger_transaction",
    title,
    detail,
    href: null,
    badge: record.clientBusiness.name,
  };
}

function resolveVendorLabel(record: ExplainLedgerTransaction) {
  return (
    record.vendor?.name?.trim() ||
    record.bankTransaction?.normalizedMerchantName?.trim() ||
    record.bankTransaction?.description?.trim() ||
    record.description.trim() ||
    "Unassigned vendor"
  );
}

function resolveCategoryLabel(record: ExplainLedgerTransaction) {
  return record.category?.name?.trim() || "Uncategorized";
}

type ContributionBucket = {
  key: string;
  label: string;
  currentMinor: number;
  previousMinor: number;
  currentCount: number;
  previousCount: number;
  currentSamples: ExplainLedgerTransaction[];
  previousSamples: ExplainLedgerTransaction[];
};

function buildContributionRows(input: {
  current: ExplainLedgerTransaction[];
  previous: ExplainLedgerTransaction[];
  currency: string;
  labelForRecord: (record: ExplainLedgerTransaction) => string;
  sourceKind: "category" | "vendor";
}): ExplainMyNumbersContributionRow[] {
  const buckets = new Map<string, ContributionBucket>();

  const addRecord = (record: ExplainLedgerTransaction, period: "current" | "previous") => {
    const label = input.labelForRecord(record);
    const key = label.toLowerCase();
    const bucket = buckets.get(key) ?? {
      key,
      label,
      currentMinor: 0,
      previousMinor: 0,
      currentCount: 0,
      previousCount: 0,
      currentSamples: [],
      previousSamples: [],
    };

    if (period === "current") {
      bucket.currentMinor += record.amountMinor;
      bucket.currentCount += 1;
      bucket.currentSamples.push(record);
    } else {
      bucket.previousMinor += record.amountMinor;
      bucket.previousCount += 1;
      bucket.previousSamples.push(record);
    }

    buckets.set(key, bucket);
  };

  input.current.forEach((record) => addRecord(record, "current"));
  input.previous.forEach((record) => addRecord(record, "previous"));

  return Array.from(buckets.values())
    .map((bucket) => {
      const samples =
        bucket.currentSamples.length > 0 ? bucket.currentSamples : bucket.previousSamples;
      const sampleSources = samples
        .sort((left, right) => right.amountMinor - left.amountMinor)
        .slice(0, CONTRIBUTION_SOURCE_LIMIT)
        .map((record) => ({
          ...buildLedgerTransactionSource(record),
          kind: input.sourceKind,
          badge: `${bucket.label} · ${formatMoney(record.amountMinor, input.currency)}`,
        }));

      return {
        key: bucket.key,
        label: bucket.label,
        currentMinor: bucket.currentMinor,
        previousMinor: bucket.previousMinor,
        deltaMinor: bucket.currentMinor - bucket.previousMinor,
        currentCount: bucket.currentCount,
        previousCount: bucket.previousCount,
        sampleSources,
      } satisfies ExplainMyNumbersContributionRow;
    })
    .sort((left, right) => Math.abs(right.deltaMinor) - Math.abs(left.deltaMinor))
    .slice(0, CONTRIBUTION_LIMIT);
}

export async function getWorkspaceExplainMyNumbersAnalytics(input: {
  workspaceId: number;
  period: ExplainMyNumbersPeriodRange;
  comparisonPeriod?: ExplainMyNumbersPeriodRange | null;
  includeTax?: boolean;
  includeFilingReadiness?: boolean;
}): Promise<ExplainMyNumbersAnalyticsSnapshot> {
  const comparisonPeriod = input.comparisonPeriod ?? null;
  const earliestFrom = comparisonPeriod?.from ?? input.period.from;
  const latestTo = input.period.to;

  try {
    const [ledgerTransactions, taxMovement, filingReadiness] = await Promise.all([
      runExplainAnalyticsQuerySafely({
        workspaceId: input.workspaceId,
        label: "ledger analytics query",
        query: loadExplainLedgerTransactions({
          workspaceId: input.workspaceId,
          earliestFrom,
          latestTo,
        }),
        fallback: () => [],
      }),
      input.includeTax
        ? runExplainAnalyticsQuerySafely({
            workspaceId: input.workspaceId,
            label: "tax movement analytics",
            support: EXPLAIN_TAX_MOVEMENT_SUPPORT,
            query: (async () => {
              const [current, previous] = await Promise.all([
                getWorkspaceTransactionTaxSummary({
                  workspaceId: input.workspaceId,
                  reviewStatus: "POSTED",
                  dateFrom: input.period.from,
                  dateTo: input.period.to,
                  periodPreset: "CUSTOM",
                  defaultDateWindowApplied: false,
                  drilldownLimit: TAX_SOURCE_LIMIT,
                }),
                comparisonPeriod
                  ? getWorkspaceTransactionTaxSummary({
                      workspaceId: input.workspaceId,
                      reviewStatus: "POSTED",
                      dateFrom: comparisonPeriod.from,
                      dateTo: comparisonPeriod.to,
                      periodPreset: "CUSTOM",
                      defaultDateWindowApplied: false,
                      drilldownLimit: TAX_SOURCE_LIMIT,
                    })
                  : Promise.resolve(null),
              ]);

              const currentDrivers = current.explanations.taxes.flatMap((tax) =>
                tax.drivers.map(
                  (driver) =>
                    ({
                      key: `${tax.taxType}-${driver.key}`,
                      label: driver.label,
                      taxType: tax.taxType,
                      amountMinor: driver.amountMinor,
                      changeMinor: driver.changeMinor,
                      reason: driver.reason,
                    }) satisfies ExplainMyNumbersTaxDriver
                )
              );

              const sources = current.explanations.taxes
                .flatMap((tax) => tax.topTransactions)
                .slice(0, TAX_SOURCE_LIMIT)
                .map((transaction) => ({
                  id: `tax-transaction-${transaction.id}`,
                  kind: "tax_driver" as const,
                  title: truncate(transaction.description),
                  detail: `${formatDate(new Date(transaction.transactionDate))} · ${formatMoney(
                    transaction.trace.totalLiabilityEffectMinor,
                    transaction.currency
                  )}`,
                  href: transaction.trace.sourceRecordHref,
                  badge: `${transaction.trace.sourceRecordType} · ${transaction.taxTreatmentSource}`,
                }));

              return {
                currentTotalDueMinor: current.liability.totalDueMinor,
                previousTotalDueMinor: previous?.liability.totalDueMinor ?? 0,
                deltaMinor:
                  current.liability.totalDueMinor - (previous?.liability.totalDueMinor ?? 0),
                currentVatDueMinor: current.liability.vatDueMinor,
                previousVatDueMinor: previous?.liability.vatDueMinor ?? 0,
                currentWhtDueMinor: current.liability.whtDueMinor,
                previousWhtDueMinor: previous?.liability.whtDueMinor ?? 0,
                explanationSummary: current.explanations.taxes.map((tax) => tax.summary).join(" "),
                topDrivers: currentDrivers
                  .sort(
                    (left, right) =>
                      Math.abs(right.changeMinor ?? right.amountMinor) -
                      Math.abs(left.changeMinor ?? left.amountMinor)
                  )
                  .slice(0, 4),
                sources,
              };
            })(),
            fallback: () => null,
          })
        : Promise.resolve(null),
      input.includeFilingReadiness
        ? runExplainAnalyticsQuerySafely({
            workspaceId: input.workspaceId,
            label: "filing readiness analytics",
            query: getWorkspaceFilingReadiness({
              workspaceId: input.workspaceId,
              defaultDateWindowApplied: true,
            }).then((readiness) => ({
              score: readiness.score,
              status: readiness.status,
              narrative: readiness.narrative,
              blockerCount: readiness.blockerCount,
              blockers: readiness.blockers.slice(0, 4).map((blocker) => ({
                title: blocker.title,
                detail: blocker.detail,
                severity: blocker.severity,
                href: blocker.href,
              })),
              recommendations: readiness.recommendations.slice(0, 4).map((recommendation) => ({
                title: recommendation.title,
                detail: recommendation.detail,
                href: recommendation.href,
                actionLabel: recommendation.actionLabel,
              })),
            })),
            fallback: () => null,
          })
        : Promise.resolve(null),
    ]);

    const currency = resolveCurrency(ledgerTransactions);
    const currentTransactions = ledgerTransactions.filter((record) =>
      withinRange(record.transactionDate, input.period)
    );
    const previousTransactions = comparisonPeriod
      ? ledgerTransactions.filter((record) => withinRange(record.transactionDate, comparisonPeriod))
      : [];

    const currentRevenueMinor = currentTransactions.reduce((sum, record) => {
      return getLedgerRecordKind(record) === "INCOME" ? sum + record.amountMinor : sum;
    }, 0);
    const previousRevenueMinor = previousTransactions.reduce((sum, record) => {
      return getLedgerRecordKind(record) === "INCOME" ? sum + record.amountMinor : sum;
    }, 0);

    const currentExpenseTransactions = currentTransactions.filter(
      (record) => getLedgerRecordKind(record) === "EXPENSE"
    );
    const previousExpenseTransactions = previousTransactions.filter(
      (record) => getLedgerRecordKind(record) === "EXPENSE"
    );

    const currentExpensesMinor = currentExpenseTransactions.reduce(
      (sum, record) => sum + record.amountMinor,
      0
    );
    const previousExpensesMinor = previousExpenseTransactions.reduce(
      (sum, record) => sum + record.amountMinor,
      0
    );

    return {
      currency,
      period: {
        current: input.period,
        previous: comparisonPeriod,
      },
      overview: {
        revenue: buildDelta(currentRevenueMinor, previousRevenueMinor),
        expenses: buildDelta(currentExpensesMinor, previousExpensesMinor),
        netProfit: buildDelta(
          currentRevenueMinor - currentExpensesMinor,
          previousRevenueMinor - previousExpensesMinor
        ),
        currentTransactionCount: currentTransactions.length,
        previousTransactionCount: previousTransactions.length,
      },
      expenseChange: {
        topCategories: buildContributionRows({
          current: currentExpenseTransactions,
          previous: previousExpenseTransactions,
          currency,
          labelForRecord: resolveCategoryLabel,
          sourceKind: "category",
        }),
        topVendors: buildContributionRows({
          current: currentExpenseTransactions,
          previous: previousExpenseTransactions,
          currency,
          labelForRecord: resolveVendorLabel,
          sourceKind: "vendor",
        }),
      },
      taxMovement,
      filingReadiness,
    };
  } catch (error) {
    logError(
      "explain-my-numbers",
      "Failed to build explain-my-numbers analytics; returning an empty analytics snapshot.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyExplainMyNumbersAnalyticsSnapshot({
      period: input.period,
      comparisonPeriod,
    });
  }
}
