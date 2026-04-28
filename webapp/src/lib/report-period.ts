type SearchParamValue = string | string[] | null | undefined;

export type AccountingReportPeriodMode = "all" | "month" | "quarter" | "year" | "custom";

export type AccountingReportPeriodSearchParams = {
  period?: SearchParamValue;
  month?: SearchParamValue;
  quarter?: SearchParamValue;
  year?: SearchParamValue;
  from?: SearchParamValue;
  to?: SearchParamValue;
};

export type AccountingReportPeriodSummary = {
  mode: AccountingReportPeriodMode;
  label: string;
  from: string | null;
  to: string | null;
  asOf: string;
};

export type ResolvedAccountingReportPeriod = {
  mode: AccountingReportPeriodMode;
  label: string;
  fromParam?: string;
  toParam?: string;
  monthInput: string;
  quarterInput: string;
  yearInput: string;
  fromInput: string;
  toInput: string;
  fromDate: Date | null;
  toDate: Date | null;
  asOfDate: Date;
  errorMsg: string | null;
};

function normalizeSearchParam(raw: SearchParamValue) {
  return typeof raw === "string" ? raw.trim() : "";
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthParam(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getQuarterFromDate(date: Date) {
  return String(Math.floor(date.getUTCMonth() / 3) + 1);
}

function parseDateParam(raw: string, boundary: "start" | "end") {
  const parsed = new Date(
    boundary === "start" ? `${raw}T00:00:00.000Z` : `${raw}T23:59:59.999Z`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildQuarterDateRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  const fromDate = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const toDate = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));
  return {
    fromDate,
    toDate,
    fromParam: formatDateParam(fromDate),
    toParam: formatDateParam(toDate),
  };
}

function buildYearDateRange(year: number) {
  const fromDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const toDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  return {
    fromDate,
    toDate,
    fromParam: formatDateParam(fromDate),
    toParam: formatDateParam(toDate),
  };
}

function formatCustomLabel(fromParam?: string, toParam?: string) {
  if (fromParam && toParam) return `${fromParam} to ${toParam}`;
  if (fromParam) return `From ${fromParam}`;
  if (toParam) return `Until ${toParam}`;
  return "All time";
}

function buildErrorPeriod(
  input: Omit<ResolvedAccountingReportPeriod, "errorMsg">,
  errorMsg: string
): ResolvedAccountingReportPeriod {
  return {
    ...input,
    errorMsg,
  };
}

export function resolveAccountingReportPeriod(
  searchParams: AccountingReportPeriodSearchParams,
  now = new Date()
): ResolvedAccountingReportPeriod {
  const periodInput = normalizeSearchParam(searchParams.period).toLowerCase();
  const rawMonthInput = normalizeSearchParam(searchParams.month);
  const rawQuarterInput = normalizeSearchParam(searchParams.quarter);
  const rawYearInput = normalizeSearchParam(searchParams.year);
  const monthInput = rawMonthInput || formatMonthParam(now);
  const quarterInput = rawQuarterInput || getQuarterFromDate(now);
  const yearInput = rawYearInput || String(now.getUTCFullYear());
  const fromInput = normalizeSearchParam(searchParams.from);
  const toInput = normalizeSearchParam(searchParams.to);

  const basePeriod = {
    monthInput,
    quarterInput,
    yearInput,
    fromInput,
    toInput,
    asOfDate: now,
  };

  let mode: AccountingReportPeriodMode = "all";
  if (periodInput === "month" || (!periodInput && rawMonthInput)) {
    mode = "month";
  } else if (periodInput === "quarter" || (!periodInput && rawQuarterInput)) {
    mode = "quarter";
  } else if (periodInput === "year" || (!periodInput && rawYearInput)) {
    mode = "year";
  }

  if (periodInput === "custom" || fromInput || toInput) {
    mode = "custom";
  }
  if (periodInput === "all") {
    mode = "all";
  }

  if (mode === "month") {
    const match = monthInput.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return buildErrorPeriod(
        {
          ...basePeriod,
          mode,
          label: "Invalid month",
          fromDate: null,
          toDate: null,
        },
        "Select a valid month."
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || year < 1900 || year > 2100 || month < 1 || month > 12) {
      return buildErrorPeriod(
        {
          ...basePeriod,
          mode,
          label: "Invalid month",
          fromDate: null,
          toDate: null,
        },
        "Select a valid month."
      );
    }

    const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const toDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return {
      ...basePeriod,
      mode,
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      fromParam: formatDateParam(fromDate),
      toParam: formatDateParam(toDate),
      fromDate,
      toDate,
      asOfDate: toDate,
      errorMsg: null,
    };
  }

  if (mode === "quarter") {
    const year = Number(yearInput);
    const quarter = Number(quarterInput);

    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2100 ||
      !Number.isInteger(quarter) ||
      quarter < 1 ||
      quarter > 4
    ) {
      return buildErrorPeriod(
        {
          ...basePeriod,
          mode,
          label: "Invalid quarter",
          fromDate: null,
          toDate: null,
        },
        "Select a valid quarter and year."
      );
    }

    const { fromDate, toDate, fromParam, toParam } = buildQuarterDateRange(year, quarter);

    return {
      ...basePeriod,
      mode,
      label: `Q${quarter} ${year}`,
      fromParam,
      toParam,
      fromDate,
      toDate,
      asOfDate: toDate,
      errorMsg: null,
    };
  }

  if (mode === "year") {
    const year = Number(yearInput);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return buildErrorPeriod(
        {
          ...basePeriod,
          mode,
          label: "Invalid year",
          fromDate: null,
          toDate: null,
        },
        "Select a valid year."
      );
    }

    const { fromDate, toDate, fromParam, toParam } = buildYearDateRange(year);

    return {
      ...basePeriod,
      mode,
      label: String(year),
      fromParam,
      toParam,
      fromDate,
      toDate,
      asOfDate: toDate,
      errorMsg: null,
    };
  }

  if (mode === "custom") {
    const fromDate = fromInput ? parseDateParam(fromInput, "start") : null;
    const toDate = toInput ? parseDateParam(toInput, "end") : null;

    if ((fromInput && !fromDate) || (toInput && !toDate)) {
      return buildErrorPeriod(
        {
          ...basePeriod,
          mode,
          label: "Invalid custom range",
          fromDate: null,
          toDate: null,
        },
        "Enter a valid custom date range."
      );
    }

    if (fromDate && toDate && fromDate > toDate) {
      return buildErrorPeriod(
        {
          ...basePeriod,
          mode,
          label: "Invalid custom range",
          fromDate,
          toDate,
        },
        "Custom start date must be before end date."
      );
    }

    return {
      ...basePeriod,
      mode,
      label: formatCustomLabel(fromInput || undefined, toInput || undefined),
      fromParam: fromInput || undefined,
      toParam: toInput || undefined,
      fromDate,
      toDate,
      asOfDate: toDate ?? now,
      errorMsg: null,
    };
  }

  return {
    ...basePeriod,
    mode,
    label: "All time",
    fromDate: null,
    toDate: null,
    asOfDate: now,
    errorMsg: null,
  };
}

export function toAccountingReportPeriodSummary(
  period: Pick<
    ResolvedAccountingReportPeriod,
    "mode" | "label" | "fromParam" | "toParam" | "asOfDate"
  >
): AccountingReportPeriodSummary {
  return {
    mode: period.mode,
    label: period.label,
    from: period.fromParam ?? null,
    to: period.toParam ?? null,
    asOf: period.asOfDate.toISOString(),
  };
}
