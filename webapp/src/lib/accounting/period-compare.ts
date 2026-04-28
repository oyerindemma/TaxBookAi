import "server-only";

import { getWorkspaceCashflowReport, getWorkspaceProfitLossReport } from "@/lib/accounting-reports";
import { resolveAccountingReportPeriod } from "@/lib/report-period";
import { getWorkspaceTransactionTaxSummary } from "@/lib/transaction-tax";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type PeriodComparisonMode = "CURRENT_MONTH" | "CURRENT_QUARTER" | "CUSTOM_RANGE";
export type PeriodComparisonDirection = "UP" | "DOWN" | "FLAT" | "NEW";

export type ComparablePeriodRange = {
  label: string;
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  dayCount: number;
};

export type ComparablePeriodSnapshot = {
  revenue: number;
  expenses: number;
  profit: number;
  cashflow: number;
  cashIn: number;
  cashOut: number;
  taxDue: number;
  taxTransactionCount: number;
  empty: boolean;
  hasData: boolean;
};

export type ComparableMetricDelta = {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null;
  direction: PeriodComparisonDirection;
};

export type WorkspacePeriodComparison = {
  generatedAt: string;
  workspaceId: number;
  mode: PeriodComparisonMode;
  currentPeriod: ComparablePeriodRange;
  previousPeriod: ComparablePeriodRange;
  current: ComparablePeriodSnapshot;
  previous: ComparablePeriodSnapshot;
  metrics: {
    revenue: ComparableMetricDelta;
    expenses: ComparableMetricDelta;
    profit: ComparableMetricDelta;
    cashflow: ComparableMetricDelta;
    taxDue: ComparableMetricDelta;
  };
  comparable: boolean;
  hasCurrentData: boolean;
  hasPreviousData: boolean;
};

type PeriodComparisonInput = {
  workspaceId: number;
  mode?: PeriodComparisonMode;
  from?: Date | string | null;
  to?: Date | string | null;
  now?: Date;
};

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0)
  );
}

function endOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999)
  );
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function startOfUtcQuarter(value: Date) {
  const quarterStartMonth = Math.floor(value.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(value.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
}

function endOfUtcQuarter(value: Date) {
  const quarterStartMonth = Math.floor(value.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(value.getUTCFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999));
}

function shiftUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_IN_MS);
}

function shiftUtcMonths(value: Date, months: number) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  );
}

function formatDateParam(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDateInput(value: Date | string | null | undefined, boundary: "start" | "end") {
  if (value instanceof Date) {
    return boundary === "start" ? startOfUtcDay(value) : endOfUtcDay(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(
    boundary === "start" ? `${trimmed}T00:00:00.000Z` : `${trimmed}T23:59:59.999Z`
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function inclusiveDayCount(from: Date, to: Date) {
  return Math.max(1, Math.floor((endOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_IN_MS) + 1);
}

function formatRangeLabel(from: Date, to: Date) {
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();

  if (sameMonth) {
    const monthLabel = from.toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    return `${monthLabel} ${from.getUTCDate()}-${to.getUTCDate()}, ${to.getUTCFullYear()}`;
  }

  if (sameYear) {
    const startLabel = from.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const endLabel = to.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${startLabel} to ${endLabel}`;
  }

  return `${from.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })} to ${to.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function buildRange(fromDate: Date, toDate: Date, label?: string): ComparablePeriodRange {
  return {
    label: label ?? formatRangeLabel(fromDate, toDate),
    from: formatDateParam(fromDate),
    to: formatDateParam(toDate),
    fromDate,
    toDate,
    dayCount: inclusiveDayCount(fromDate, toDate),
  };
}

function resolveMonthRanges(now: Date) {
  const anchor = endOfUtcDay(now);
  const currentFrom = startOfUtcMonth(anchor);
  const previousMonthAnchor = shiftUtcMonths(anchor, -1);
  const previousFrom = startOfUtcMonth(previousMonthAnchor);
  const previousTo = minDate(
    endOfUtcDay(shiftUtcDays(previousFrom, inclusiveDayCount(currentFrom, anchor) - 1)),
    endOfUtcMonth(previousMonthAnchor)
  );

  return {
    mode: "CURRENT_MONTH" as const,
    currentPeriod: buildRange(currentFrom, anchor),
    previousPeriod: buildRange(previousFrom, previousTo),
  };
}

function resolveQuarterRanges(now: Date) {
  const anchor = endOfUtcDay(now);
  const currentFrom = startOfUtcQuarter(anchor);
  const previousQuarterAnchor = shiftUtcMonths(anchor, -3);
  const previousFrom = startOfUtcQuarter(previousQuarterAnchor);
  const previousTo = minDate(
    endOfUtcDay(shiftUtcDays(previousFrom, inclusiveDayCount(currentFrom, anchor) - 1)),
    endOfUtcQuarter(previousQuarterAnchor)
  );

  return {
    mode: "CURRENT_QUARTER" as const,
    currentPeriod: buildRange(currentFrom, anchor),
    previousPeriod: buildRange(previousFrom, previousTo),
  };
}

function resolveCustomRanges(input: {
  from: Date | string | null | undefined;
  to: Date | string | null | undefined;
}) {
  const currentFrom = parseDateInput(input.from, "start");
  const currentTo = parseDateInput(input.to, "end");

  if (!currentFrom || !currentTo || currentFrom.getTime() > currentTo.getTime()) {
    return null;
  }

  const dayCount = inclusiveDayCount(currentFrom, currentTo);
  const previousTo = endOfUtcDay(shiftUtcDays(currentFrom, -1));
  const previousFrom = startOfUtcDay(shiftUtcDays(previousTo, -(dayCount - 1)));

  return {
    mode: "CUSTOM_RANGE" as const,
    currentPeriod: buildRange(currentFrom, currentTo),
    previousPeriod: buildRange(previousFrom, previousTo),
  };
}

function buildMetricDelta(current: number, previous: number): ComparableMetricDelta {
  const change = current - previous;

  if (previous === 0) {
    return {
      current,
      previous,
      change,
      changePercent: current === 0 ? 0 : null,
      direction: current === 0 ? "FLAT" : "NEW",
    };
  }

  if (change === 0) {
    return {
      current,
      previous,
      change,
      changePercent: 0,
      direction: "FLAT",
    };
  }

  return {
    current,
    previous,
    change,
    changePercent: (change / previous) * 100,
    direction: change > 0 ? "UP" : "DOWN",
  };
}

async function loadSnapshotForRange(
  workspaceId: number,
  range: ComparablePeriodRange
): Promise<ComparablePeriodSnapshot> {
  const resolvedPeriod = resolveAccountingReportPeriod({
    period: "custom",
    from: range.from,
    to: range.to,
  });

  const [profitLoss, cashflow, taxSummary] = await Promise.all([
    getWorkspaceProfitLossReport(workspaceId, resolvedPeriod),
    getWorkspaceCashflowReport(workspaceId, resolvedPeriod),
    getWorkspaceTransactionTaxSummary({
      workspaceId,
      dateFrom: range.fromDate,
      dateTo: range.toDate,
      periodPreset: "CUSTOM",
      defaultDateWindowApplied: false,
      drilldownLimit: 5,
    }),
  ]);

  const hasData =
    profitLoss.report.totalRevenue !== 0 ||
    profitLoss.report.totalExpenses !== 0 ||
    cashflow.report.totalCashIn !== 0 ||
    cashflow.report.totalCashOut !== 0 ||
    taxSummary.liability.totalDueMinor !== 0 ||
    taxSummary.totalMatchingTransactions > 0;

  return {
    revenue: profitLoss.report.totalRevenue,
    expenses: profitLoss.report.totalExpenses,
    profit: profitLoss.report.netProfit,
    cashflow: cashflow.report.netCashflow,
    cashIn: cashflow.report.totalCashIn,
    cashOut: cashflow.report.totalCashOut,
    taxDue: taxSummary.liability.totalDueMinor,
    taxTransactionCount: taxSummary.totalMatchingTransactions,
    empty: profitLoss.report.empty && cashflow.report.empty && taxSummary.totalMatchingTransactions === 0,
    hasData,
  };
}

export async function getWorkspacePeriodComparison(
  input: PeriodComparisonInput
): Promise<WorkspacePeriodComparison> {
  const now = input.now ?? new Date();
  const ranges =
    (input.mode === "CUSTOM_RANGE"
      ? resolveCustomRanges({ from: input.from, to: input.to })
      : null) ??
    (input.mode === "CURRENT_QUARTER" ? resolveQuarterRanges(now) : resolveMonthRanges(now));

  const [current, previous] = await Promise.all([
    loadSnapshotForRange(input.workspaceId, ranges.currentPeriod),
    loadSnapshotForRange(input.workspaceId, ranges.previousPeriod),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    mode: ranges.mode,
    currentPeriod: ranges.currentPeriod,
    previousPeriod: ranges.previousPeriod,
    current,
    previous,
    metrics: {
      revenue: buildMetricDelta(current.revenue, previous.revenue),
      expenses: buildMetricDelta(current.expenses, previous.expenses),
      profit: buildMetricDelta(current.profit, previous.profit),
      cashflow: buildMetricDelta(current.cashflow, previous.cashflow),
      taxDue: buildMetricDelta(current.taxDue, previous.taxDue),
    },
    comparable: current.hasData && previous.hasData,
    hasCurrentData: current.hasData,
    hasPreviousData: previous.hasData,
  };
}
