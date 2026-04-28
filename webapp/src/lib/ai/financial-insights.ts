import "server-only";

import type { Prisma } from "@prisma/client";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getWorkspacePeriodComparison,
  type PeriodComparisonMode,
  type WorkspacePeriodComparison,
} from "@/lib/accounting/period-compare";

export type FinancialInsightType =
  | "expense_spike"
  | "revenue_drop"
  | "tax_change"
  | "review_blocker"
  | "cashflow_warning";

export type FinancialInsightSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type FinancialInsight = {
  type: FinancialInsightType;
  title: string;
  explanation: string;
  severity: FinancialInsightSeverity;
  suggestedAction: string;
};

export type FinancialInsightsResult = {
  generatedAt: string;
  workspace: {
    id: number;
  };
  period: {
    mode: PeriodComparisonMode;
    currentLabel: string;
    previousLabel: string;
  };
  summary: string;
  insights: FinancialInsight[];
};

type InsightTransaction = {
  id: number;
  transactionDate: Date;
  description: string;
  amountMinor: number;
  type: "CREDIT" | "DEBIT";
  currency: string;
  vendorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryType: string | null;
  reviewStatus: string | null;
  taxTreatmentSource: string | null;
  vatTreatment: string | null;
  whtTreatment: string | null;
  vatAmountMinor: number;
  whtAmountMinor: number;
};

type GenerateFinancialInsightsInput = {
  comparison: WorkspacePeriodComparison;
  currentPeriodTransactions: InsightTransaction[];
  previousPeriodTransactions: InsightTransaction[];
  pendingReviewCount: number;
};

const PENDING_REVIEW_STATUS_VALUES = ["IMPORTED", "PENDING_REVIEW", "FLAGGED"] as const;
const PENDING_REVIEW_STATUSES = new Set<string>(PENDING_REVIEW_STATUS_VALUES);

const insightTransactionSelect = {
  id: true,
  transactionDate: true,
  description: true,
  amount: true,
  type: true,
  currency: true,
  normalizedMerchantName: true,
  suggestedCounterparty: true,
  categoryId: true,
  reviewStatus: true,
  taxTreatmentSource: true,
  vatTreatment: true,
  whtTreatment: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  category: {
    select: {
      name: true,
      type: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type InsightTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof insightTransactionSelect;
}>;

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function roundPercent(value: number) {
  return Math.round(value);
}

function severityRank(severity: FinancialInsightSeverity) {
  if (severity === "CRITICAL") return 0;
  if (severity === "HIGH") return 1;
  if (severity === "MEDIUM") return 2;
  return 3;
}

function normalizeKey(value: string | null | undefined) {
  const normalized = value
    ?.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function serializeTransaction(record: InsightTransactionRecord): InsightTransaction {
  return {
    id: record.id,
    transactionDate: record.transactionDate,
    description: record.description,
    amountMinor: record.amount,
    type: record.type,
    currency: record.currency,
    vendorName:
      record.normalizedMerchantName ??
      normalizeKey(record.suggestedCounterparty) ??
      null,
    categoryId: record.categoryId,
    categoryName: record.category?.name ?? null,
    categoryType: record.category?.type ?? null,
    reviewStatus: record.reviewStatus,
    taxTreatmentSource: record.taxTreatmentSource,
    vatTreatment: record.vatTreatment,
    whtTreatment: record.whtTreatment,
    vatAmountMinor: record.vatAmountMinor,
    whtAmountMinor: record.whtAmountMinor,
  };
}

function isExpense(transaction: InsightTransaction) {
  return transaction.type === "DEBIT";
}

function isRevenue(transaction: InsightTransaction) {
  return transaction.type === "CREDIT";
}

function buildEmptyFinancialInsightsResult(
  workspaceId: number,
  mode: PeriodComparisonMode = "CURRENT_MONTH"
): FinancialInsightsResult {
  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspaceId,
    },
    period: {
      mode,
      currentLabel: "Current period",
      previousLabel: "Previous period",
    },
    summary: "Not enough data yet",
    insights: [],
  };
}

function findLargestDriver(
  currentTransactions: InsightTransaction[],
  previousTransactions: InsightTransaction[],
  selector: (transaction: InsightTransaction) => { key: string; label: string } | null
) {
  const grouped = new Map<
    string,
    {
      label: string;
      currentAmountMinor: number;
      previousAmountMinor: number;
      currentIds: number[];
      previousIds: number[];
    }
  >();

  for (const transaction of currentTransactions) {
    const selected = selector(transaction);
    if (!selected) continue;
    const bucket = grouped.get(selected.key) ?? {
      label: selected.label,
      currentAmountMinor: 0,
      previousAmountMinor: 0,
      currentIds: [],
      previousIds: [],
    };
    bucket.currentAmountMinor += transaction.amountMinor;
    bucket.currentIds.push(transaction.id);
    grouped.set(selected.key, bucket);
  }

  for (const transaction of previousTransactions) {
    const selected = selector(transaction);
    if (!selected) continue;
    const bucket = grouped.get(selected.key) ?? {
      label: selected.label,
      currentAmountMinor: 0,
      previousAmountMinor: 0,
      currentIds: [],
      previousIds: [],
    };
    bucket.previousAmountMinor += transaction.amountMinor;
    bucket.previousIds.push(transaction.id);
    grouped.set(selected.key, bucket);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      deltaMinor: group.currentAmountMinor - group.previousAmountMinor,
    }))
    .sort((left, right) => Math.abs(right.deltaMinor) - Math.abs(left.deltaMinor))[0] ?? null;
}

function buildExpenseInsight(input: GenerateFinancialInsightsInput): FinancialInsight | null {
  const expenses = input.comparison.metrics.expenses;
  if (expenses.previous <= 0 || expenses.change <= 0) {
    return null;
  }

  const increasePercent = (expenses.change / expenses.previous) * 100;
  if (increasePercent < 10) {
    return null;
  }

  const currentExpenses = input.currentPeriodTransactions.filter(isExpense);
  const previousExpenses = input.previousPeriodTransactions.filter(isExpense);
  const driver =
    findLargestDriver(
      currentExpenses,
      previousExpenses,
      (transaction) =>
        transaction.categoryName
          ? {
              key: `category:${transaction.categoryId ?? transaction.categoryName}`,
              label: transaction.categoryName,
            }
          : transaction.vendorName
            ? {
                key: `vendor:${transaction.vendorName}`,
                label: transaction.vendorName,
              }
            : null
    ) ?? null;
  const currency = currentExpenses[0]?.currency ?? previousExpenses[0]?.currency ?? "NGN";
  const driverLine =
    driver && driver.deltaMinor > 0
      ? ` ${driver.label} was the largest driver, up ${formatMoney(driver.deltaMinor, currency)}.`
      : "";

  return {
    type: "expense_spike",
    title: `Expenses increased by ${roundPercent(increasePercent)}%`,
    explanation: `Expenses rose from ${formatMoney(
      expenses.previous,
      currency
    )} to ${formatMoney(expenses.current, currency)} compared with ${input.comparison.previousPeriod.label}.${driverLine}`,
    severity:
      increasePercent >= 40 ? "HIGH" : increasePercent >= 20 ? "MEDIUM" : "LOW",
    suggestedAction: "Review the largest expense drivers and confirm whether the increase is expected, recurring, or miscategorized.",
  };
}

function buildRevenueInsight(input: GenerateFinancialInsightsInput): FinancialInsight | null {
  const revenue = input.comparison.metrics.revenue;
  if (revenue.previous <= 0 || revenue.change >= 0) {
    return null;
  }

  const dropPercent = Math.abs((revenue.change / revenue.previous) * 100);
  if (dropPercent < 10) {
    return null;
  }

  const currentRevenue = input.currentPeriodTransactions.filter(isRevenue);
  const previousRevenue = input.previousPeriodTransactions.filter(isRevenue);
  const driver =
    findLargestDriver(
      currentRevenue,
      previousRevenue,
      (transaction) =>
        transaction.categoryName
          ? {
              key: `category:${transaction.categoryId ?? transaction.categoryName}`,
              label: transaction.categoryName,
            }
          : transaction.vendorName
            ? {
                key: `vendor:${transaction.vendorName}`,
                label: transaction.vendorName,
              }
            : null
    ) ?? null;
  const currency = currentRevenue[0]?.currency ?? previousRevenue[0]?.currency ?? "NGN";
  const driverLine =
    driver && driver.deltaMinor < 0
      ? ` ${driver.label} accounted for the largest decline, down ${formatMoney(
          Math.abs(driver.deltaMinor),
          currency
        )}.`
      : "";

  return {
    type: "revenue_drop",
    title: `Revenue fell by ${roundPercent(dropPercent)}%`,
    explanation: `Revenue moved from ${formatMoney(
      revenue.previous,
      currency
    )} to ${formatMoney(revenue.current, currency)} compared with ${input.comparison.previousPeriod.label}.${driverLine}`,
    severity:
      dropPercent >= 40 ? "CRITICAL" : dropPercent >= 25 ? "HIGH" : "MEDIUM",
    suggestedAction: "Inspect the weakest revenue categories, client collections, and any missing postings before updating the forecast.",
  };
}

function buildTaxInsight(input: GenerateFinancialInsightsInput): FinancialInsight | null {
  const taxDue = input.comparison.metrics.taxDue;
  const currentTransactions = input.currentPeriodTransactions;
  const currency = currentTransactions[0]?.currency ?? "NGN";
  const taxUnknownCount = currentTransactions.filter(
    (transaction) =>
      transaction.taxTreatmentSource === "UNSET" ||
      (transaction.reviewStatus ? PENDING_REVIEW_STATUSES.has(transaction.reviewStatus) : false)
  ).length;
  const taxableCount = currentTransactions.filter(
    (transaction) =>
      transaction.vatAmountMinor > 0 ||
      transaction.whtAmountMinor > 0 ||
      transaction.vatTreatment === "INPUT" ||
      transaction.vatTreatment === "OUTPUT" ||
      transaction.whtTreatment === "PAYABLE" ||
      transaction.whtTreatment === "RECEIVABLE"
  ).length;

  if (
    !(taxDue.current > taxDue.previous && taxDue.change > 0) &&
    taxUnknownCount < 5
  ) {
    return null;
  }

  const taxPercent =
    taxDue.previous > 0 ? Math.abs((taxDue.change / taxDue.previous) * 100) : null;
  const movementLine =
    taxDue.current > taxDue.previous && taxDue.change > 0
      ? `Tax due increased from ${formatMoney(taxDue.previous, currency)} to ${formatMoney(
          taxDue.current,
          currency
        )}${typeof taxPercent === "number" ? ` (${roundPercent(taxPercent)}%)` : ""}.`
      : "";
  const taxableLine =
    taxableCount > 0
      ? ` ${taxableCount} current-period transaction${taxableCount === 1 ? "" : "s"} are contributing VAT or WHT.`
      : "";
  const unknownLine =
    taxUnknownCount > 0
      ? ` ${taxUnknownCount} transaction${taxUnknownCount === 1 ? "" : "s"} still need tax treatment review.`
      : "";

  return {
    type: "tax_change",
    title:
      taxDue.current > taxDue.previous && taxDue.change > 0
        ? "Tax due is higher this period"
        : "Tax treatment still needs review",
    explanation: `${movementLine}${taxableLine}${unknownLine}`.trim(),
    severity:
      taxUnknownCount >= 8 || (typeof taxPercent === "number" && taxPercent >= 50)
        ? "HIGH"
        : "MEDIUM",
    suggestedAction: "Open the tax center, confirm the transactions driving the change, and clear any unsettled tax treatment before filing.",
  };
}

function buildReviewInsight(input: GenerateFinancialInsightsInput): FinancialInsight | null {
  if (input.pendingReviewCount <= 0) {
    return null;
  }

  return {
    type: "review_blocker",
    title: `${input.pendingReviewCount} transaction${input.pendingReviewCount === 1 ? "" : "s"} still need review`,
    explanation: `${input.pendingReviewCount} transaction${input.pendingReviewCount === 1 ? "" : "s"} still need review before reports and tax outputs can be treated as final.`,
    severity:
      input.pendingReviewCount >= 15
        ? "HIGH"
        : input.pendingReviewCount >= 5
          ? "MEDIUM"
          : "LOW",
    suggestedAction: "Clear the review queue before finalizing reports, tax checks, or assistant-driven explanations.",
  };
}

function buildCashflowInsight(input: GenerateFinancialInsightsInput): FinancialInsight | null {
  const { cashIn, cashOut, cashflow } = input.comparison.current;
  if (cashIn <= 0 || cashOut <= cashIn * 1.1 || cashflow >= 0) {
    return null;
  }

  const currency =
    input.currentPeriodTransactions[0]?.currency ??
    input.previousPeriodTransactions[0]?.currency ??
    "NGN";

  return {
    type: "cashflow_warning",
    title: "Outflows are ahead of inflows",
    explanation: `Current-period outflows of ${formatMoney(
      cashOut,
      currency
    )} exceed inflows of ${formatMoney(cashIn, currency)}, leaving net cashflow at ${formatMoney(
      cashflow,
      currency
    )}.`,
    severity:
      cashOut >= cashIn * 1.8 ? "HIGH" : cashOut >= cashIn * 1.4 ? "MEDIUM" : "LOW",
    suggestedAction: "Review near-term collections and the largest cash outflows before approving more spend this period.",
  };
}

export function generateFinancialInsights(
  input: GenerateFinancialInsightsInput
): Pick<FinancialInsightsResult, "summary" | "insights"> {
  if (!input.comparison.hasCurrentData || !input.comparison.hasPreviousData || !input.comparison.comparable) {
    return {
      summary: "Not enough data yet",
      insights: [],
    };
  }

  const insights = [
    buildRevenueInsight(input),
    buildExpenseInsight(input),
    buildTaxInsight(input),
    buildCashflowInsight(input),
    buildReviewInsight(input),
  ]
    .filter(Boolean)
    .sort((left, right) => {
      const severityDelta = severityRank(left!.severity) - severityRank(right!.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return left!.title.localeCompare(right!.title);
    }) as FinancialInsight[];

  if (insights.length === 0) {
    return {
      summary: `No major changes detected compared with ${input.comparison.previousPeriod.label}`,
      insights: [],
    };
  }

  const summary =
    insights.length === 1
      ? insights[0].title
      : `${insights[0].title}; ${insights[1].title.toLowerCase()}`;

  return {
    summary,
    insights,
  };
}

function filterTransactionsForPeriod(
  transactions: InsightTransaction[],
  period: WorkspacePeriodComparison["currentPeriod"]
) {
  return transactions.filter((transaction) => {
    const timestamp = transaction.transactionDate.getTime();
    return timestamp >= period.fromDate.getTime() && timestamp <= period.toDate.getTime();
  });
}

export async function getWorkspaceFinancialInsights(input: {
  workspaceId: number;
  mode?: PeriodComparisonMode;
  from?: Date | string | null;
  to?: Date | string | null;
}): Promise<FinancialInsightsResult> {
  if (!input.workspaceId || input.workspaceId <= 0) {
    return buildEmptyFinancialInsightsResult(input.workspaceId, input.mode);
  }

  try {
    const comparison = await getWorkspacePeriodComparison({
      workspaceId: input.workspaceId,
      mode: input.mode,
      from: input.from,
      to: input.to,
    });
    const [transactions, pendingReviewCount] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          workspaceId: input.workspaceId,
          transactionDate: {
            gte: comparison.previousPeriod.fromDate,
            lte: comparison.currentPeriod.toDate,
          },
        },
        orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
        select: insightTransactionSelect,
      }),
      prisma.bankTransaction.count({
        where: {
          workspaceId: input.workspaceId,
          OR: [
            {
              reviewStatus: {
                in: [...PENDING_REVIEW_STATUS_VALUES],
              },
            },
            {
              taxTreatmentSource: "UNSET",
            },
          ],
        },
      }),
    ]);

    const serialized = transactions.map(serializeTransaction);
    const currentPeriodTransactions = filterTransactionsForPeriod(
      serialized,
      comparison.currentPeriod
    );
    const previousPeriodTransactions = filterTransactionsForPeriod(
      serialized,
      comparison.previousPeriod
    );

    const result = generateFinancialInsights({
      comparison,
      currentPeriodTransactions,
      previousPeriodTransactions,
      pendingReviewCount,
    });

    return {
      generatedAt: new Date().toISOString(),
      workspace: {
        id: input.workspaceId,
      },
      period: {
        mode: comparison.mode,
        currentLabel: comparison.currentPeriod.label,
        previousLabel: comparison.previousPeriod.label,
      },
      summary: result.summary,
      insights: result.insights,
    };
  } catch (error) {
    logError(
      "ai-financial-insights",
      "Failed to build financial insights; returning a safe empty result.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyFinancialInsightsResult(input.workspaceId, input.mode);
  }
}

export function buildEmptyWorkspaceFinancialInsights(
  workspaceId: number,
  mode?: PeriodComparisonMode
) {
  return buildEmptyFinancialInsightsResult(workspaceId, mode);
}
