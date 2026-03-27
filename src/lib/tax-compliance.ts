import "server-only";

import { NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";
import type { WorkspaceTaxRecord } from "@/lib/tax-reporting";

export type TaxPeriodMode = "all" | "month" | "quarter" | "custom";
export type RecordTaxType = "VAT" | "WHT" | "NONE";
export type VatDirection = "OUTPUT" | "INPUT";
export type WhtDirection = "DEDUCTED" | "SUFFERED";
export type CompanyReadinessStatus = "INCOMPLETE" | "NEEDS_REVIEW" | "REVIEW_READY";
export type RecordConfidence = "HIGH" | "MEDIUM" | "LOW";

export type TaxPeriodState = {
  mode: TaxPeriodMode;
  label: string;
  fromParam?: string;
  toParam?: string;
  monthInput: string;
  quarterInput: string;
  yearInput: string;
  fromInput: string;
  toInput: string;
  errorMsg: string | null;
};

export type ComplianceRecordRow = {
  id: number;
  occurredOn: string;
  kind: string;
  vendorName: string | null;
  description: string | null;
  categoryName: string | null;
  amountKobo: number;
  taxRate: number;
  taxAmountKobo: number;
  netAmountKobo: number;
  currency: string;
  taxType: RecordTaxType;
  vatDirection: VatDirection | null;
  whtDirection: WhtDirection | null;
  confidence: RecordConfidence;
  taxableIncomeBaseKobo: number;
  assumptions: string[];
};

export type TaxComplianceSummary = {
  period: TaxPeriodState;
  configuration: typeof NIGERIA_TAX_CONFIG;
  currency: string;
  vat: {
    outputVat: number;
    inputVat: number;
    netVat: number;
    manualAssumptionCount: number;
    records: ComplianceRecordRow[];
  };
  wht: {
    deducted: number;
    suffered: number;
    netPosition: number;
    manualAssumptionCount: number;
    records: ComplianceRecordRow[];
  };
  companyTax: {
    taxableIncomeEstimate: number;
    incomeBase: number;
    expenseBase: number;
    readinessStatus: CompanyReadinessStatus;
    readinessNotes: string[];
    uncategorizedExpenseCount: number;
    missingCounterpartyCount: number;
    manualTaxReviewCount: number;
    fiscalYearStartMonth: number;
  };
  counts: {
    totalRecords: number;
    taxBearingRecords: number;
    mixedCurrencies: boolean;
  };
  disclaimers: string[];
};

export type TaxExportPack = {
  authority: string;
  schemaVersion: number;
  generatedAt: string;
  summary: TaxComplianceSummary;
  vatRows: ComplianceRecordRow[];
  whtRows: ComplianceRecordRow[];
};

type SearchParamsInput = {
  period?: string | string[];
  month?: string | string[];
  quarter?: string | string[];
  year?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

type ParsedAiMetadata = {
  suggestion?: {
    classification?: string;
    vat?: { relevance?: string };
    wht?: { relevance?: string };
  };
};

function normalizeSearchParam(raw: string | string[] | undefined) {
  return typeof raw === "string" ? raw.trim() : "";
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthInput(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getQuarterFromDate(date: Date) {
  return String(Math.floor(date.getUTCMonth() / 3) + 1);
}

function getQuarterDateRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    fromParam: formatDateParam(start),
    toParam: formatDateParam(end),
  };
}

function formatCustomLabel(fromParam?: string, toParam?: string) {
  if (fromParam && toParam) return `${fromParam} to ${toParam}`;
  if (fromParam) return `From ${fromParam}`;
  if (toParam) return `Until ${toParam}`;
  return "All records";
}

export function resolveTaxPeriodState(
  searchParams: SearchParamsInput,
  now = new Date()
): TaxPeriodState {
  const periodInput = normalizeSearchParam(searchParams.period);
  const monthInput =
    normalizeSearchParam(searchParams.month) || formatMonthInput(now);
  const quarterInput =
    normalizeSearchParam(searchParams.quarter) || getQuarterFromDate(now);
  const yearInput =
    normalizeSearchParam(searchParams.year) || String(now.getUTCFullYear());
  const fromInput = normalizeSearchParam(searchParams.from);
  const toInput = normalizeSearchParam(searchParams.to);

  let mode: TaxPeriodMode = "all";
  if (periodInput === "month" || (!periodInput && monthInput && !fromInput && !toInput)) {
    mode = periodInput === "custom" ? "custom" : "month";
  }
  if (periodInput === "quarter") {
    mode = "quarter";
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
      return {
        mode,
        label: "Invalid month",
        monthInput,
        quarterInput,
        yearInput,
        fromInput,
        toInput,
        errorMsg: "Select a valid month.",
      };
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return {
        mode,
        label: "Invalid month",
        monthInput,
        quarterInput,
        yearInput,
        fromInput,
        toInput,
        errorMsg: "Select a valid month.",
      };
    }

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    return {
      mode,
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      fromParam: formatDateParam(from),
      toParam: formatDateParam(to),
      monthInput,
      quarterInput,
      yearInput,
      fromInput,
      toInput,
      errorMsg: null,
    };
  }

  if (mode === "quarter") {
    const year = Number(yearInput);
    const quarter = Number(quarterInput);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(quarter) ||
      quarter < 1 ||
      quarter > 4
    ) {
      return {
        mode,
        label: "Invalid quarter",
        monthInput,
        quarterInput,
        yearInput,
        fromInput,
        toInput,
        errorMsg: "Select a valid quarter and year.",
      };
    }

    const { fromParam, toParam } = getQuarterDateRange(year, quarter);
    return {
      mode,
      label: `Q${quarter} ${year}`,
      fromParam,
      toParam,
      monthInput,
      quarterInput,
      yearInput,
      fromInput,
      toInput,
      errorMsg: null,
    };
  }

  if (mode === "custom") {
    const fromDate = fromInput ? new Date(`${fromInput}T00:00:00.000Z`) : null;
    const toDate = toInput ? new Date(`${toInput}T23:59:59.999Z`) : null;
    if ((fromInput && Number.isNaN(fromDate?.getTime() ?? NaN)) || (toInput && Number.isNaN(toDate?.getTime() ?? NaN))) {
      return {
        mode,
        label: "Invalid custom range",
        monthInput,
        quarterInput,
        yearInput,
        fromInput,
        toInput,
        errorMsg: "Enter valid custom dates.",
      };
    }
    if (fromDate && toDate && fromDate > toDate) {
      return {
        mode,
        label: "Invalid custom range",
        monthInput,
        quarterInput,
        yearInput,
        fromInput,
        toInput,
        errorMsg: "Custom start date must be before end date.",
      };
    }
    return {
      mode,
      label: formatCustomLabel(fromInput || undefined, toInput || undefined),
      fromParam: fromInput || undefined,
      toParam: toInput || undefined,
      monthInput,
      quarterInput,
      yearInput,
      fromInput,
      toInput,
      errorMsg: null,
    };
  }

  return {
    mode,
    label: "All records",
    monthInput,
    quarterInput,
    yearInput,
    fromInput,
    toInput,
    errorMsg: null,
  };
}

function parseAiMetadata(raw: string | null): ParsedAiMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParsedAiMetadata;
  } catch {
    return null;
  }
}

function matchesKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildRecordContextText(record: WorkspaceTaxRecord) {
  return [record.description, record.source, record.vendorName]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function normalizeKind(kind: string) {
  return kind.trim().toUpperCase();
}

function resolveConfidence(
  usedAiHint: boolean,
  usedKeywordHint: boolean,
  usedFallback: boolean
): RecordConfidence {
  if (usedFallback) return "LOW";
  if (usedAiHint) return "HIGH";
  if (usedKeywordHint) return "MEDIUM";
  return "HIGH";
}

function inferTaxProfile(record: WorkspaceTaxRecord) {
  const normalizedKind = normalizeKind(record.kind);
  const aiMetadata = parseAiMetadata(record.aiMetadata ?? null);
  const aiClassification = aiMetadata?.suggestion?.classification?.trim().toUpperCase();
  const aiVatRelevance = aiMetadata?.suggestion?.vat?.relevance?.trim().toUpperCase();
  const aiWhtRelevance = aiMetadata?.suggestion?.wht?.relevance?.trim().toUpperCase();
  const text = buildRecordContextText(record);
  const hasWhtKeyword = matchesKeyword(text, [
    "wht",
    "withholding",
    "withheld",
    "deducted at source",
  ]);

  let taxType: RecordTaxType = "NONE";
  let usedAiHint = false;
  let usedKeywordHint = false;
  const assumptions: string[] = [];

  if (normalizedKind === "VAT") {
    taxType = "VAT";
  } else if (normalizedKind === "WHT") {
    taxType = "WHT";
  } else if (record.computedTax > 0) {
    if (aiWhtRelevance === "RELEVANT" && aiVatRelevance !== "RELEVANT") {
      taxType = "WHT";
      usedAiHint = true;
    } else if (hasWhtKeyword) {
      taxType = "WHT";
      usedKeywordHint = true;
    } else {
      taxType = "VAT";
      if (aiVatRelevance === "RELEVANT" || aiVatRelevance === "UNCERTAIN") {
        usedAiHint = true;
      }
    }
  }

  let vatDirection: VatDirection | null = null;
  let whtDirection: WhtDirection | null = null;
  let usedFallback = false;

  if (taxType === "VAT") {
    if (normalizedKind === "INCOME") {
      vatDirection = "OUTPUT";
    } else if (normalizedKind === "EXPENSE") {
      vatDirection = "INPUT";
    } else if (aiClassification === "INCOME") {
      vatDirection = "OUTPUT";
      usedAiHint = true;
    } else if (aiClassification === "EXPENSE") {
      vatDirection = "INPUT";
      usedAiHint = true;
    } else if (matchesKeyword(text, ["output vat", "sales vat", "sale", "invoice", "customer"])) {
      vatDirection = "OUTPUT";
      usedKeywordHint = true;
    } else if (matchesKeyword(text, ["input vat", "purchase", "supplier", "vendor", "expense"])) {
      vatDirection = "INPUT";
      usedKeywordHint = true;
    } else {
      vatDirection = NIGERIA_TAX_CONFIG.manualEntryFallback.vatDirection;
      usedFallback = true;
      assumptions.push(
        "Manual VAT entry was treated as output VAT because no transaction direction was available."
      );
    }
  }

  if (taxType === "WHT") {
    if (normalizedKind === "INCOME") {
      whtDirection = "SUFFERED";
    } else if (normalizedKind === "EXPENSE") {
      whtDirection = "DEDUCTED";
    } else if (aiClassification === "INCOME") {
      whtDirection = "SUFFERED";
      usedAiHint = true;
    } else if (aiClassification === "EXPENSE") {
      whtDirection = "DEDUCTED";
      usedAiHint = true;
    } else if (matchesKeyword(text, ["suffered", "customer withheld", "client withheld", "withheld by customer"])) {
      whtDirection = "SUFFERED";
      usedKeywordHint = true;
    } else if (matchesKeyword(text, ["deducted", "supplier", "vendor", "contract", "rent", "service payment"])) {
      whtDirection = "DEDUCTED";
      usedKeywordHint = true;
    } else {
      whtDirection = NIGERIA_TAX_CONFIG.manualEntryFallback.whtDirection;
      usedFallback = true;
      assumptions.push(
        "Manual WHT entry was treated as WHT deducted because no transaction direction was available."
      );
    }
  }

  const taxAmountKobo = record.computedTax > 0 ? record.computedTax : 0;
  const confidence = resolveConfidence(usedAiHint, usedKeywordHint, usedFallback);

  let taxableIncomeBaseKobo = 0;
  if (normalizedKind === "INCOME") {
    taxableIncomeBaseKobo = taxType === "WHT" ? record.amountKobo : record.netAmount;
  } else if (normalizedKind === "EXPENSE") {
    taxableIncomeBaseKobo = taxType === "WHT" ? record.amountKobo : record.netAmount;
  }

  return {
    taxType,
    vatDirection,
    whtDirection,
    confidence,
    assumptions,
    taxAmountKobo,
    taxableIncomeBaseKobo,
  };
}

function resolveCurrency(records: WorkspaceTaxRecord[], fallbackCurrency: string) {
  const currencies = new Set(records.map((record) => record.currency).filter(Boolean));
  if (currencies.size === 0) return fallbackCurrency;
  return currencies.size === 1 ? [...currencies][0] : "MIXED";
}

function buildComplianceRecordRow(record: WorkspaceTaxRecord): ComplianceRecordRow {
  const profile = inferTaxProfile(record);
  return {
    id: record.id,
    occurredOn: new Date(record.occurredOn).toISOString().slice(0, 10),
    kind: record.kind,
    vendorName: record.vendorName ?? null,
    description: record.description ?? null,
    categoryName: record.category?.name ?? null,
    amountKobo: record.amountKobo,
    taxRate: record.taxRate,
    taxAmountKobo: profile.taxAmountKobo,
    netAmountKobo: record.netAmount,
    currency: record.currency,
    taxType: profile.taxType,
    vatDirection: profile.vatDirection,
    whtDirection: profile.whtDirection,
    confidence: profile.confidence,
    taxableIncomeBaseKobo: profile.taxableIncomeBaseKobo,
    assumptions: profile.assumptions,
  };
}

function buildCompanyReadiness(
  rows: ComplianceRecordRow[],
  currency: string,
  fiscalYearStartMonth: number
) {
  const incomeBase = rows
    .filter((row) => normalizeKind(row.kind) === "INCOME")
    .reduce((sum, row) => sum + row.taxableIncomeBaseKobo, 0);
  const expenseRows = rows.filter((row) => normalizeKind(row.kind) === "EXPENSE");
  const expenseBase = expenseRows.reduce((sum, row) => sum + row.taxableIncomeBaseKobo, 0);
  const uncategorizedExpenseCount = expenseRows.filter((row) => !row.categoryName).length;
  const missingCounterpartyCount = rows.filter(
    (row) =>
      (normalizeKind(row.kind) === "INCOME" || normalizeKind(row.kind) === "EXPENSE") &&
      !row.vendorName
  ).length;
  const manualTaxReviewCount = rows.reduce(
    (count, row) => count + row.assumptions.length,
    0
  );
  const notes: string[] = [];
  const uncategorizedRatio =
    expenseRows.length === 0 ? 0 : uncategorizedExpenseCount / expenseRows.length;
  const mixedCurrencies = currency === "MIXED";

  if (incomeBase === 0 || expenseBase === 0) {
    notes.push(
      "The company tax estimate is incomplete because the selected period does not include both income and expense records."
    );
  }
  if (uncategorizedExpenseCount > 0) {
    notes.push(
      `${uncategorizedExpenseCount} expense record${
        uncategorizedExpenseCount === 1 ? "" : "s"
      } are uncategorized and may need review before company tax computation.`
    );
  }
  if (missingCounterpartyCount > 0) {
    notes.push(
      `${missingCounterpartyCount} transaction record${
        missingCounterpartyCount === 1 ? "" : "s"
      } are missing a customer or vendor name.`
    );
  }
  if (manualTaxReviewCount > 0) {
    notes.push(
      `${manualTaxReviewCount} tax assumption${
        manualTaxReviewCount === 1 ? "" : "s"
      } were applied to manual VAT/WHT entries without clear direction.`
    );
  }
  if (mixedCurrencies) {
    notes.push(
      "Multiple currencies were found in the selected period. Totals should be reviewed before filing or company tax assessment."
    );
  }

  let readinessStatus: CompanyReadinessStatus = "REVIEW_READY";
  if (incomeBase === 0 || expenseBase === 0) {
    readinessStatus = "INCOMPLETE";
  } else if (
    mixedCurrencies ||
    manualTaxReviewCount > 0 ||
    uncategorizedRatio >= NIGERIA_TAX_CONFIG.companyTax.uncategorizedExpenseRatioWarning ||
    missingCounterpartyCount >= NIGERIA_TAX_CONFIG.companyTax.missingCounterpartyWarningCount
  ) {
    readinessStatus = "NEEDS_REVIEW";
  }

  return {
    taxableIncomeEstimate: incomeBase - expenseBase,
    incomeBase,
    expenseBase,
    readinessStatus,
    readinessNotes: notes,
    uncategorizedExpenseCount,
    missingCounterpartyCount,
    manualTaxReviewCount,
    fiscalYearStartMonth,
  };
}

function buildDisclaimers(
  rows: ComplianceRecordRow[],
  summaryCurrency: string
) {
  const disclaimers = [
    "These calculations are estimates generated from stored transactions and configured tax rules. Review them with an accountant before filing with FIRS.",
    "VAT is treated as output VAT on income and input VAT on expenses unless a manual VAT record required a fallback assumption.",
    "WHT is treated as suffered on income and deducted on expenses unless a manual WHT record required a fallback assumption.",
    "The company tax view is a readiness summary and taxable income estimate, not a filed company income tax return.",
  ];

  if (summaryCurrency === "MIXED") {
    disclaimers.push(
      "Mixed currencies were detected. Combined totals should not be used for filing without currency normalization."
    );
  }
  if (rows.some((row) => row.assumptions.length > 0)) {
    disclaimers.push(
      "Some manual VAT or WHT records were assigned a default payable-side direction because no transaction context was stored."
    );
  }

  return disclaimers;
}

export function buildTaxComplianceSummary(input: {
  records: WorkspaceTaxRecord[];
  period: TaxPeriodState;
  defaultCurrency?: string | null;
  fiscalYearStartMonth?: number | null;
}): TaxComplianceSummary {
  const rows = input.records.map((record) => buildComplianceRecordRow(record));
  const currency = resolveCurrency(
    input.records,
    input.defaultCurrency?.trim().toUpperCase() || "NGN"
  );
  const vatRows = rows.filter((row) => row.taxType === "VAT" && row.taxAmountKobo > 0);
  const whtRows = rows.filter((row) => row.taxType === "WHT" && row.taxAmountKobo > 0);

  const outputVat = vatRows
    .filter((row) => row.vatDirection === "OUTPUT")
    .reduce((sum, row) => sum + row.taxAmountKobo, 0);
  const inputVat = vatRows
    .filter((row) => row.vatDirection === "INPUT")
    .reduce((sum, row) => sum + row.taxAmountKobo, 0);
  const whtDeducted = whtRows
    .filter((row) => row.whtDirection === "DEDUCTED")
    .reduce((sum, row) => sum + row.taxAmountKobo, 0);
  const whtSuffered = whtRows
    .filter((row) => row.whtDirection === "SUFFERED")
    .reduce((sum, row) => sum + row.taxAmountKobo, 0);

  return {
    period: input.period,
    configuration: NIGERIA_TAX_CONFIG,
    currency,
    vat: {
      outputVat,
      inputVat,
      netVat: outputVat - inputVat,
      manualAssumptionCount: vatRows.reduce(
        (count, row) => count + row.assumptions.length,
        0
      ),
      records: vatRows,
    },
    wht: {
      deducted: whtDeducted,
      suffered: whtSuffered,
      netPosition: whtSuffered - whtDeducted,
      manualAssumptionCount: whtRows.reduce(
        (count, row) => count + row.assumptions.length,
        0
      ),
      records: whtRows,
    },
    companyTax: buildCompanyReadiness(
      rows,
      currency,
      input.fiscalYearStartMonth || NIGERIA_TAX_CONFIG.companyTax.fiscalYearDefaultStartMonth
    ),
    counts: {
      totalRecords: rows.length,
      taxBearingRecords: rows.filter((row) => row.taxAmountKobo > 0).length,
      mixedCurrencies: currency === "MIXED",
    },
    disclaimers: buildDisclaimers(rows, currency),
  };
}

export function buildTaxExportPack(summary: TaxComplianceSummary): TaxExportPack {
  return {
    authority: NIGERIA_TAX_CONFIG.authority,
    schemaVersion: NIGERIA_TAX_CONFIG.exportSchemaVersion,
    generatedAt: new Date().toISOString(),
    summary,
    vatRows: summary.vat.records,
    whtRows: summary.wht.records,
  };
}

export function buildTaxExportQueryString(period: TaxPeriodState) {
  const params = new URLSearchParams();
  params.set("period", period.mode);
  if (period.mode === "month" && period.monthInput) {
    params.set("month", period.monthInput);
  }
  if (period.mode === "quarter") {
    params.set("quarter", period.quarterInput);
    params.set("year", period.yearInput);
  }
  if (period.mode === "custom") {
    if (period.fromInput) params.set("from", period.fromInput);
    if (period.toInput) params.set("to", period.toInput);
  }
  return params.toString();
}

export function getReadinessBadgeVariant(status: CompanyReadinessStatus) {
  if (status === "REVIEW_READY") return "secondary" as const;
  if (status === "NEEDS_REVIEW") return "outline" as const;
  return "destructive" as const;
}

export function getReadinessLabel(status: CompanyReadinessStatus) {
  if (status === "REVIEW_READY") return "Review ready";
  if (status === "NEEDS_REVIEW") return "Needs review";
  return "Incomplete";
}
