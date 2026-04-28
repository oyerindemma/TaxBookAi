export const DEFAULT_BUSINESS_CURRENCY = "NGN";
export const DEFAULT_COUNTRY = "Nigeria";
export const DEFAULT_FISCAL_YEAR_START_MONTH = 1;

export const BUSINESS_TYPE_OPTIONS = [
  { value: "SOLE_PROPRIETORSHIP", label: "Sole proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "LIMITED_LIABILITY_COMPANY", label: "Limited liability company" },
  { value: "CORPORATION", label: "Corporation" },
  { value: "NONPROFIT", label: "Nonprofit" },
  { value: "OTHER", label: "Other" },
] as const;

export const COUNTRY_OPTIONS = [
  { value: "Nigeria", label: "Nigeria" },
  { value: "Ghana", label: "Ghana" },
  { value: "Kenya", label: "Kenya" },
  { value: "South Africa", label: "South Africa" },
  { value: "United States", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Other", label: "Other" },
] as const;

export const NIGERIA_STATE_OPTIONS = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export const FISCAL_YEAR_MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

export type BusinessProfileFormValues = {
  businessName: string;
  businessType: string;
  industry: string;
  country: string;
  state: string;
  taxIdentificationNumber: string;
  defaultCurrency: string;
  fiscalYearStartMonth: string;
};

export type BusinessProfileNormalizedValues = {
  businessName: string;
  businessType: string;
  industry: string;
  country: string;
  state: string;
  taxIdentificationNumber: string | null;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
};

export type BusinessProfileFieldErrors = Partial<
  Record<
    | "businessName"
    | "businessType"
    | "industry"
    | "country"
    | "state"
    | "taxIdentificationNumber"
    | "defaultCurrency"
    | "fiscalYearStartMonth",
    string
  >
>;

const BUSINESS_TYPE_VALUES = new Set<string>(
  BUSINESS_TYPE_OPTIONS.map((option) => option.value)
);
const COUNTRY_VALUES = new Set<string>(COUNTRY_OPTIONS.map((option) => option.value));
const NIGERIA_STATE_VALUES = new Set<string>(NIGERIA_STATE_OPTIONS);

function normalizeText(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function createBusinessProfileDefaults(
  input?: Partial<BusinessProfileFormValues>
): BusinessProfileFormValues {
  return {
    businessName: input?.businessName ?? "",
    businessType: input?.businessType ?? "",
    industry: input?.industry ?? "",
    country: input?.country ?? DEFAULT_COUNTRY,
    state: input?.state ?? "",
    taxIdentificationNumber: input?.taxIdentificationNumber ?? "",
    defaultCurrency: input?.defaultCurrency ?? DEFAULT_BUSINESS_CURRENCY,
    fiscalYearStartMonth:
      input?.fiscalYearStartMonth ?? String(DEFAULT_FISCAL_YEAR_START_MONTH),
  };
}

export function validateBusinessProfileInput(
  input: Partial<BusinessProfileFormValues>
): {
  values: BusinessProfileNormalizedValues;
  fieldErrors: BusinessProfileFieldErrors;
} {
  const values = createBusinessProfileDefaults(input);
  const normalizedCountry = normalizeText(values.country) || DEFAULT_COUNTRY;
  const normalizedState = normalizeText(values.state);
  const fiscalYearStartMonth = Number(values.fiscalYearStartMonth);

  const normalizedValues: BusinessProfileNormalizedValues = {
    businessName: normalizeText(values.businessName),
    businessType: normalizeText(values.businessType),
    industry: normalizeText(values.industry),
    country: normalizedCountry,
    state: normalizedState,
    taxIdentificationNumber: normalizeText(values.taxIdentificationNumber) || null,
    defaultCurrency: DEFAULT_BUSINESS_CURRENCY,
    fiscalYearStartMonth,
  };

  const fieldErrors: BusinessProfileFieldErrors = {};

  if (!normalizedValues.businessName) {
    fieldErrors.businessName = "Enter your business name.";
  } else if (normalizedValues.businessName.length < 2) {
    fieldErrors.businessName = "Business name must be at least 2 characters.";
  } else if (normalizedValues.businessName.length > 120) {
    fieldErrors.businessName = "Business name must be 120 characters or fewer.";
  }

  if (!normalizedValues.businessType) {
    fieldErrors.businessType = "Select your business type.";
  } else if (!BUSINESS_TYPE_VALUES.has(normalizedValues.businessType)) {
    fieldErrors.businessType = "Select a valid business type.";
  }

  if (!normalizedValues.industry) {
    fieldErrors.industry = "Enter your industry.";
  } else if (normalizedValues.industry.length < 2) {
    fieldErrors.industry = "Industry must be at least 2 characters.";
  } else if (normalizedValues.industry.length > 80) {
    fieldErrors.industry = "Industry must be 80 characters or fewer.";
  }

  if (!COUNTRY_VALUES.has(normalizedValues.country)) {
    fieldErrors.country = "Select a valid country.";
  }

  if (!normalizedValues.state) {
    fieldErrors.state = "Enter your state.";
  } else if (
    normalizedValues.country === DEFAULT_COUNTRY &&
    !NIGERIA_STATE_VALUES.has(normalizedValues.state as (typeof NIGERIA_STATE_OPTIONS)[number])
  ) {
    fieldErrors.state = "Select a valid state.";
  } else if (normalizedValues.state.length > 80) {
    fieldErrors.state = "State must be 80 characters or fewer.";
  }

  if (
    normalizedValues.taxIdentificationNumber &&
    normalizedValues.taxIdentificationNumber.length > 64
  ) {
    fieldErrors.taxIdentificationNumber =
      "Tax identification number must be 64 characters or fewer.";
  }

  if (normalizedValues.defaultCurrency !== DEFAULT_BUSINESS_CURRENCY) {
    fieldErrors.defaultCurrency = `Default currency must be ${DEFAULT_BUSINESS_CURRENCY}.`;
  }

  if (
    !Number.isFinite(normalizedValues.fiscalYearStartMonth) ||
    !Number.isInteger(normalizedValues.fiscalYearStartMonth) ||
    normalizedValues.fiscalYearStartMonth < 1 ||
    normalizedValues.fiscalYearStartMonth > 12
  ) {
    fieldErrors.fiscalYearStartMonth = "Select a valid fiscal year start month.";
  }

  return {
    values: normalizedValues,
    fieldErrors,
  };
}

export function getBusinessTypeLabel(value: string) {
  return BUSINESS_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function getFiscalYearMonthLabel(value: number) {
  return (
    FISCAL_YEAR_MONTH_OPTIONS.find((option) => option.value === value)?.label ?? String(value)
  );
}
