export type ManualVatDirection = "OUTPUT" | "INPUT";
export type ManualWhtDirection = "DEDUCTED" | "SUFFERED";

export type WhtRatePreset = {
  code: string;
  label: string;
  rate: number;
  note: string;
};

export const NIGERIA_TAX_CONFIG = {
  reviewedAt: "2026-03-12",
  authority: "FIRS",
  exportSchemaVersion: 1,
  vat: {
    standardRate: 7.5,
    filingFrequency: "monthly",
  },
  wht: {
    heuristicDefaultRate: 5,
    commonRatePresets: [
      {
        code: "WHT_CONTRACT_5",
        label: "Contracts and commissions",
        rate: 5,
        note: "Common project, commission, and contract withholding rate.",
      },
      {
        code: "WHT_RENT_10",
        label: "Rent and lease payments",
        rate: 10,
        note: "Common rent withholding rate.",
      },
      {
        code: "WHT_SERVICES_10",
        label: "Professional and technical services",
        rate: 10,
        note: "Common consultancy and service withholding rate.",
      },
    ] satisfies WhtRatePreset[],
  },
  manualEntryFallback: {
    vatDirection: "OUTPUT" as ManualVatDirection,
    whtDirection: "DEDUCTED" as ManualWhtDirection,
  },
  companyTax: {
    estimateOnly: true,
    uncategorizedExpenseRatioWarning: 0.25,
    missingCounterpartyWarningCount: 3,
    fiscalYearDefaultStartMonth: 1,
  },
  firsIntegration: {
    adapterReady: true,
    submissionEnabled: false,
  },
} as const;

export function getCommonWhtRatePresets() {
  return [...NIGERIA_TAX_CONFIG.wht.commonRatePresets];
}

export function getFiscalMonthLabel(month: number) {
  return new Date(Date.UTC(2026, Math.max(0, Math.min(11, month - 1)), 1)).toLocaleDateString(
    "en-US",
    { month: "long" }
  );
}
