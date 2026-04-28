import "server-only";

import type { Prisma, TaxRecord } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Boundary = "start" | "end";

type SummaryBucket = {
  gross: number;
  tax: number;
  net: number;
  currencies: Set<string>;
};

type TaxRecordLike = Pick<
  TaxRecord,
  "amountKobo" | "computedTax" | "currency" | "kind" | "netAmount" | "occurredOn"
> & {
  category?: {
    name: string;
  } | null;
};

type MonthlyIncomeRow = {
  key: string;
  label: string;
  totals: {
    gross: number;
    tax: number;
    net: number;
  };
};

export type WorkspaceTaxRecord = Prisma.TaxRecordGetPayload<{
  include: { category: true };
}>;

export type ResolvedDateRange = {
  fromParam?: string;
  toParam?: string;
  fromDate: Date | null;
  toDate: Date | null;
  errorMsg: string | null;
};

export type WorkspaceTaxRecordsResult = ResolvedDateRange & {
  records: WorkspaceTaxRecord[];
  where: Prisma.TaxRecordWhereInput;
};

export type TaxReportSummary = {
  totals: SummaryBucket;
  vatTotals: SummaryBucket;
  whtTotals: SummaryBucket;
  incomeTotals: SummaryBucket;
  taxPayable: number;
  monthlyRows: MonthlyIncomeRow[];
};

export type TaxFilingSummary = {
  vatCollected: number;
  vatPaid: number;
  vatPayable: number;
  whtTotals: SummaryBucket;
};

export type DashboardMonthlyTrendRow = {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  taxLiability: number;
};

export type DashboardExpenseCategoryRow = {
  label: string;
  amount: number;
  count: number;
  share: number;
};

export type DashboardOverviewSummary = {
  monthlyTrendRows: DashboardMonthlyTrendRow[];
  expenseCategoryRows: DashboardExpenseCategoryRow[];
};

export function normalizeSearchParam(raw: string | string[] | undefined) {
  return typeof raw === "string" ? raw : undefined;
}

export function parseDateParam(raw: string | null | undefined, boundary: Boundary) {
  if (!raw) return null;
  const iso =
    boundary === "start"
      ? `${raw}T00:00:00.000Z`
      : `${raw}T23:59:59.999Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveDateRange(
  fromParam?: string | null,
  toParam?: string | null
): ResolvedDateRange {
  const fromDate = parseDateParam(fromParam, "start");
  const toDate = parseDateParam(toParam, "end");

  let errorMsg: string | null = null;
  if (fromParam && !fromDate) {
    errorMsg = "Invalid from date";
  }
  if (!errorMsg && toParam && !toDate) {
    errorMsg = "Invalid to date";
  }
  if (!errorMsg && fromDate && toDate && fromDate > toDate) {
    errorMsg = "From date must be before to date";
  }

  return {
    fromParam: fromParam ?? undefined,
    toParam: toParam ?? undefined,
    fromDate,
    toDate,
    errorMsg,
  };
}

function buildWhere(
  workspaceId: number,
  dateRange: ResolvedDateRange
): Prisma.TaxRecordWhereInput {
  const where: Prisma.TaxRecordWhereInput = { workspaceId };

  if (!dateRange.errorMsg && (dateRange.fromDate || dateRange.toDate)) {
    where.occurredOn = {
      ...(dateRange.fromDate ? { gte: dateRange.fromDate } : {}),
      ...(dateRange.toDate ? { lte: dateRange.toDate } : {}),
    };
  }

  return where;
}

function getMonthKey(dateInput: Date) {
  return `${dateInput.getUTCFullYear()}-${String(dateInput.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function getRecentMonthKeys(endDate: Date, count: number) {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - offset, 1)
    );
    keys.push(getMonthKey(monthDate));
  }
  return keys;
}

export async function getWorkspaceTaxRecords(
  workspaceId: number,
  dateRangeInput: { fromParam?: string | null; toParam?: string | null }
): Promise<WorkspaceTaxRecordsResult> {
  const dateRange = resolveDateRange(
    dateRangeInput.fromParam,
    dateRangeInput.toParam
  );
  const where = buildWhere(workspaceId, dateRange);

  const records = dateRange.errorMsg
    ? []
    : await prisma.taxRecord.findMany({
        where,
        orderBy: { occurredOn: "desc" },
        include: { category: true },
      });

  return {
    ...dateRange,
    records,
    where,
  };
}

function summarizeRecords(
  records: TaxRecordLike[],
  predicate: (record: TaxRecordLike) => boolean
): SummaryBucket {
  return records.reduce(
    (acc, record) => {
      if (!predicate(record)) return acc;
      acc.gross += record.amountKobo;
      acc.tax += record.computedTax;
      acc.net += record.netAmount;
      acc.currencies.add(record.currency);
      return acc;
    },
    {
      gross: 0,
      tax: 0,
      net: 0,
      currencies: new Set<string>(),
    }
  );
}

export function resolveSummaryCurrency(summary: SummaryBucket) {
  if (summary.currencies.size === 0) return "NGN";
  return summary.currencies.size === 1 ? [...summary.currencies][0] : "MIXED";
}

export function summarizeTaxReport(records: TaxRecordLike[]): TaxReportSummary {
  const totals = summarizeRecords(records, () => true);
  const vatTotals = summarizeRecords(records, (record) => record.kind === "VAT");
  const whtTotals = summarizeRecords(records, (record) => record.kind === "WHT");
  const incomeTotals = summarizeRecords(records, (record) => record.kind === "INCOME");

  const monthlyIncome = records
    .filter((record) => record.kind === "INCOME")
    .reduce((map, record) => {
      const date = new Date(record.occurredOn);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}`;
      const existing = map.get(key) ?? { gross: 0, tax: 0, net: 0 };
      existing.gross += record.amountKobo;
      existing.tax += record.computedTax;
      existing.net += record.netAmount;
      map.set(key, existing);
      return map;
    }, new Map<string, { gross: number; tax: number; net: number }>());

  const monthlyRows = Array.from(monthlyIncome.entries())
    .map(([key, totalsByMonth]) => {
      return { key, label: getMonthLabel(key), totals: totalsByMonth };
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));

  return {
    totals,
    vatTotals,
    whtTotals,
    incomeTotals,
    taxPayable: vatTotals.tax + whtTotals.tax,
    monthlyRows,
  };
}

export function summarizeTaxFiling(records: TaxRecordLike[]): TaxFilingSummary {
  const vatCollected = records.reduce((sum, record) => {
    if (record.kind !== "INCOME") return sum;
    return sum + record.computedTax;
  }, 0);

  const vatPaid = records.reduce((sum, record) => {
    if (record.kind !== "EXPENSE") return sum;
    return sum + record.computedTax;
  }, 0);

  return {
    vatCollected,
    vatPaid,
    vatPayable: vatCollected - vatPaid,
    whtTotals: summarizeRecords(records, (record) => record.kind === "WHT"),
  };
}

export function summarizeDashboardOverview(
  records: TaxRecordLike[],
  options?: { months?: number }
): DashboardOverviewSummary {
  if (records.length === 0) {
    return {
      monthlyTrendRows: [],
      expenseCategoryRows: [],
    };
  }

  const months = Math.max(1, Math.min(options?.months ?? 6, 12));
  const latestRecordDate = records.reduce((latest, record) => {
    const occurredOn = new Date(record.occurredOn);
    return occurredOn > latest ? occurredOn : latest;
  }, new Date(records[0].occurredOn));
  const monthKeys = getRecentMonthKeys(latestRecordDate, months);
  const monthlyTrendMap = new Map(
    monthKeys.map((key) => [
      key,
      {
        revenue: 0,
        expenses: 0,
        taxLiability: 0,
      },
    ])
  );
  const expenseCategoryTotals = new Map<string, { amount: number; count: number }>();
  let categorizedExpenseCount = 0;

  for (const record of records) {
    const kind = record.kind.trim().toUpperCase();
    const monthTotals = monthlyTrendMap.get(getMonthKey(new Date(record.occurredOn)));

    if (monthTotals) {
      if (kind === "INCOME") {
        monthTotals.revenue += record.amountKobo;
        monthTotals.taxLiability += record.computedTax;
      }
      if (kind === "EXPENSE") {
        monthTotals.expenses += record.amountKobo;
        monthTotals.taxLiability -= record.computedTax;
      }
      if (kind === "WHT") {
        monthTotals.taxLiability += record.computedTax;
      }
    }

    if (kind !== "EXPENSE") continue;

    const categoryName = record.category?.name?.trim() || "Uncategorized";
    if (record.category?.name?.trim()) {
      categorizedExpenseCount += 1;
    }
    const categoryTotals = expenseCategoryTotals.get(categoryName) ?? {
      amount: 0,
      count: 0,
    };
    categoryTotals.amount += record.amountKobo;
    categoryTotals.count += 1;
    expenseCategoryTotals.set(categoryName, categoryTotals);
  }

  const monthlyTrendRows = monthKeys.map((key) => {
    const totals = monthlyTrendMap.get(key) ?? {
      revenue: 0,
      expenses: 0,
      taxLiability: 0,
    };
    return {
      key,
      label: getMonthLabel(key),
      revenue: totals.revenue,
      expenses: totals.expenses,
      taxLiability: totals.taxLiability,
    };
  });

  if (categorizedExpenseCount === 0) {
    return {
      monthlyTrendRows,
      expenseCategoryRows: [],
    };
  }

  const sortedCategoryRows = Array.from(expenseCategoryTotals.entries())
    .map(([label, totals]) => ({
      label,
      amount: totals.amount,
      count: totals.count,
    }))
    .sort((a, b) => b.amount - a.amount);
  const collapsedCategoryRows =
    sortedCategoryRows.length > 5
      ? [
          ...sortedCategoryRows.slice(0, 5),
          sortedCategoryRows.slice(5).reduce(
            (other, row) => ({
              label: "Other",
              amount: other.amount + row.amount,
              count: other.count + row.count,
            }),
            { label: "Other", amount: 0, count: 0 }
          ),
        ]
      : sortedCategoryRows;
  const totalExpenseAmount = collapsedCategoryRows.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const expenseCategoryRows = collapsedCategoryRows.map((row) => ({
    ...row,
    share: totalExpenseAmount > 0 ? row.amount / totalExpenseAmount : 0,
  }));

  return {
    monthlyTrendRows,
    expenseCategoryRows,
  };
}
