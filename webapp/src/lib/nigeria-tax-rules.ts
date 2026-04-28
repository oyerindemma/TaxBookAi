import type { TaxCategory } from "@prisma/client";

export type NigerianTaxOutputStatus = "estimate" | "review-needed" | "filing-ready" | "filed";

export type NigerianCitCompanyBand = "SMALL" | "MEDIUM" | "LARGE";

export type NigerianTaxRuleSource = {
  label: string;
  url: string;
};

export type DatedTaxRule<T> = {
  effectiveFrom: string;
  effectiveTo?: string;
  value: T;
  source: NigerianTaxRuleSource;
};

export type WhtCounterpartyKind = "CORPORATE_RESIDENT" | "CORPORATE_NON_RESIDENT";

const FIRS_VAT_CIRCULAR: NigerianTaxRuleSource = {
  label: "FIRS Information Circular 2021/08 - VAT Act implementation",
  url: "https://old.firs.gov.ng/wp-content/uploads/2021/06/CLARIFICATION-ON-THE-IMPLEMENTATION-OF-THE-VALUE-ADDED-TAX-VAT-ACT.pdf",
};

const FINANCE_ACT_2020: NigerianTaxRuleSource = {
  label: "Finance Act 2020",
  url: "https://atrs.firs.gov.ng/uploads/finance-act-2020_signed.pdf",
};

const WHT_REGULATIONS_2024: NigerianTaxRuleSource = {
  label: "Deduction of Tax at Source (Withholding) Regulations, 2024",
  url: "https://assets.kpmg.com/content/dam/kpmg/ng/pdf/2024/10/Deduction%20of%20Tax%20at%20Source%20%28Withholding%29%20Regulations%202024_Gazetted.pdf",
};

export const NIGERIA_TAX_RULES_VERSION = "ng-tax-rules-2026-04-28";

export const NIGERIA_VAT_RULES: Array<DatedTaxRule<{ standardRate: number }>> = [
  {
    effectiveFrom: "1900-01-01",
    effectiveTo: "2020-01-31",
    value: {
      standardRate: 5,
    },
    source: FIRS_VAT_CIRCULAR,
  },
  {
    effectiveFrom: "2020-02-01",
    value: {
      standardRate: 7.5,
    },
    source: FIRS_VAT_CIRCULAR,
  },
];

export const NIGERIA_CIT_RULES: Array<
  DatedTaxRule<{
    bands: Array<{
      band: NigerianCitCompanyBand;
      turnoverMinMinor: number;
      turnoverMaxMinor: number | null;
      rate: number;
    }>;
  }>
> = [
  {
    effectiveFrom: "2020-01-01",
    value: {
      bands: [
        {
          band: "SMALL",
          turnoverMinMinor: 0,
          turnoverMaxMinor: 25_000_000_00,
          rate: 0,
        },
        {
          band: "MEDIUM",
          turnoverMinMinor: 25_000_000_00,
          turnoverMaxMinor: 100_000_000_00,
          rate: 20,
        },
        {
          band: "LARGE",
          turnoverMinMinor: 100_000_000_00,
          turnoverMaxMinor: null,
          rate: 30,
        },
      ],
    },
    source: FINANCE_ACT_2020,
  },
];

const PRE_2025_WHT_RATES: Record<string, number> = {
  RENT: 10,
  PROFESSIONAL_SERVICE: 10,
  PURCHASE_SERVICES: 5,
  SALES_SERVICES: 5,
  DEFAULT: 5,
};

const POST_2025_WHT_RATES: Record<string, number> = {
  RENT: 10,
  PROFESSIONAL_SERVICE: 5,
  PURCHASE_SERVICES: 2,
  SALES_SERVICES: 2,
  DEFAULT: 2,
};

export const NIGERIA_WHT_RULES: Array<DatedTaxRule<Record<string, number>>> = [
  {
    effectiveFrom: "1900-01-01",
    effectiveTo: "2024-12-31",
    value: PRE_2025_WHT_RATES,
    source: {
      label: "Legacy WHT heuristics retained for pre-2025 estimates",
      url: "https://www.firs.gov.ng/",
    },
  },
  {
    effectiveFrom: "2025-01-01",
    value: POST_2025_WHT_RATES,
    source: WHT_REGULATIONS_2024,
  },
];

function parseRuleDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeRuleDate(value?: Date | string | null) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function resolveEffectiveRule<T>(rules: Array<DatedTaxRule<T>>, occurredOn?: Date | string | null) {
  const date = normalizeRuleDate(occurredOn);
  const effectiveRules = rules.filter((rule) => {
    const start = parseRuleDate(rule.effectiveFrom);
    const end = rule.effectiveTo ? new Date(`${rule.effectiveTo}T23:59:59.999Z`) : null;
    return date >= start && (!end || date <= end);
  });

  return effectiveRules[effectiveRules.length - 1] ?? rules[rules.length - 1];
}

export function getNigeriaVatRule(occurredOn?: Date | string | null) {
  return resolveEffectiveRule(NIGERIA_VAT_RULES, occurredOn);
}

export function getNigeriaVatRate(occurredOn?: Date | string | null) {
  return getNigeriaVatRule(occurredOn).value.standardRate;
}

export function getNigeriaWhtRule(occurredOn?: Date | string | null) {
  return resolveEffectiveRule(NIGERIA_WHT_RULES, occurredOn);
}

export function getNigeriaWhtRate(
  taxCategory: TaxCategory | null,
  occurredOn?: Date | string | null
) {
  const rule = getNigeriaWhtRule(occurredOn);
  const key = taxCategory ?? "DEFAULT";
  return rule.value[key] ?? rule.value.DEFAULT;
}

export function getNigeriaCitRule(occurredOn?: Date | string | null) {
  return resolveEffectiveRule(NIGERIA_CIT_RULES, occurredOn);
}

export function getNigeriaCitBand(annualTurnoverMinor: number, occurredOn?: Date | string | null) {
  const rule = getNigeriaCitRule(occurredOn);
  const turnover = Math.max(0, Math.round(annualTurnoverMinor));
  return (
    rule.value.bands.find(
      (band) =>
        turnover >= band.turnoverMinMinor &&
        (band.turnoverMaxMinor === null || turnover <= band.turnoverMaxMinor)
    ) ?? rule.value.bands[rule.value.bands.length - 1]
  );
}

export function estimateNigeriaCit(input: {
  taxAdjustedProfitMinor: number;
  annualTurnoverMinor: number;
  occurredOn?: Date | string | null;
}) {
  const band = getNigeriaCitBand(input.annualTurnoverMinor, input.occurredOn);
  const taxableProfitMinor = Math.max(0, Math.round(input.taxAdjustedProfitMinor));

  return {
    band: band.band,
    rate: band.rate,
    estimatedCitMinor: Math.round(taxableProfitMinor * (band.rate / 100)),
    source: getNigeriaCitRule(input.occurredOn).source,
  };
}

export function resolveNigerianTaxOutputStatus(input: {
  filed?: boolean;
  filingApproved?: boolean;
  sourceCount: number;
  exceptionCount: number;
  isEstimate?: boolean;
}) {
  if (input.filed) return "filed" satisfies NigerianTaxOutputStatus;
  if (input.filingApproved || (input.sourceCount > 0 && input.exceptionCount === 0 && !input.isEstimate)) {
    return "filing-ready" satisfies NigerianTaxOutputStatus;
  }
  if (input.exceptionCount > 0 || input.sourceCount === 0) {
    return "review-needed" satisfies NigerianTaxOutputStatus;
  }
  return "estimate" satisfies NigerianTaxOutputStatus;
}
