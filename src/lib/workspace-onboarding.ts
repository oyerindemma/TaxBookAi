import {
  BUSINESS_TYPE_OPTIONS,
  DEFAULT_BUSINESS_CURRENCY,
  DEFAULT_COUNTRY,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  FISCAL_YEAR_MONTH_OPTIONS,
  NIGERIA_STATE_OPTIONS,
} from "@/lib/business-profile";

export const WORKSPACE_ONBOARDING_STEP_ORDER = [
  "profile",
  "tax",
  "workspace",
] as const;

export type WorkspaceOnboardingStep =
  (typeof WORKSPACE_ONBOARDING_STEP_ORDER)[number];

export const ONBOARDING_USER_TYPE_OPTIONS = [
  {
    value: "SME_OWNER",
    label: "SME owner",
    description: "I run the business and want clear numbers without too much setup.",
  },
  {
    value: "ACCOUNTANT",
    label: "Accountant",
    description: "I manage books or tax work for one or more client businesses.",
  },
  {
    value: "FINANCE_OPERATOR",
    label: "Finance operator",
    description: "I handle day-to-day finance work for a team or business unit.",
  },
] as const;

export const TAX_APPLICABILITY_OPTIONS = [
  {
    value: "YES",
    label: "Yes",
    description: "Show the tax tools early because this likely applies now.",
  },
  {
    value: "NO",
    label: "No",
    description: "Keep the workspace lighter for now.",
  },
  {
    value: "NOT_SURE",
    label: "Not sure",
    description: "Surface the tax tools and guidance so I can confirm later.",
  },
] as const;

export const MULTI_BUSINESS_NEED_OPTIONS = [
  {
    value: "SINGLE_BUSINESS",
    label: "Just this business",
    description: "Keep the workspace simple around one active business.",
  },
  {
    value: "MULTI_BUSINESS",
    label: "More than one business",
    description: "I need to work across multiple business setups.",
  },
  {
    value: "ACCOUNTANT_PORTFOLIO",
    label: "Client portfolio",
    description: "I manage client businesses and want portfolio-style tools first.",
  },
] as const;

export const WORKSPACE_ONBOARDING_MODULE_LABELS = {
  "/dashboard": "Overview",
  "/dashboard/client-businesses": "Client businesses",
  "/dashboard/banking/review": "Transaction review",
  "/dashboard/bookkeeping/review": "Bookkeeping review",
  "/dashboard/tax-center": "Tax center",
  "/dashboard/filing-readiness": "Filing readiness",
  "/dashboard/reports": "Reports",
  "/dashboard/assistant": "Assistant",
  "/dashboard/receipts": "Receipts",
  "/dashboard/notifications": "Notifications",
  "/dashboard/workspaces": "Workspaces",
  "/dashboard/cit": "CIT workflow",
} as const;

export type OnboardingUserType =
  (typeof ONBOARDING_USER_TYPE_OPTIONS)[number]["value"];

export type TaxApplicability =
  (typeof TAX_APPLICABILITY_OPTIONS)[number]["value"];

export type MultiBusinessNeed =
  (typeof MULTI_BUSINESS_NEED_OPTIONS)[number]["value"];

export type WorkspaceOnboardingStatus = "IN_PROGRESS" | "COMPLETED";

export type WorkspaceOnboardingFormValues = {
  userType: string;
  businessName: string;
  businessType: string;
  industry: string;
  country: string;
  state: string;
  taxIdentificationNumber: string;
  defaultCurrency: string;
  fiscalYearStartMonth: string;
  vatApplicability: string;
  whtApplicability: string;
  multiBusinessNeed: string;
  currentStep: WorkspaceOnboardingStep;
};

export type WorkspaceOnboardingNormalizedValues = {
  userType: OnboardingUserType | null;
  businessName: string;
  businessType: string;
  industry: string;
  country: string;
  state: string;
  taxIdentificationNumber: string | null;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  vatApplicability: TaxApplicability | null;
  whtApplicability: TaxApplicability | null;
  multiBusinessNeed: MultiBusinessNeed | null;
  currentStep: WorkspaceOnboardingStep;
};

export type WorkspaceOnboardingFieldErrors = Partial<
  Record<
    | "userType"
    | "businessName"
    | "businessType"
    | "industry"
    | "state"
    | "taxIdentificationNumber"
    | "fiscalYearStartMonth"
    | "vatApplicability"
    | "whtApplicability"
    | "multiBusinessNeed",
    string
  >
>;

export type WorkspaceOnboardingActionItem = {
  id: string;
  href: string;
  label: string;
  description: string;
};

export type WorkspaceOnboardingModulePreference = {
  href: string;
  label: string;
};

export type WorkspaceOnboardingDashboardConfig = {
  userTypeLabel: string;
  welcomeTitle: string;
  welcomeDescription: string;
  highlights: string[];
  preferredModuleHrefs: string[];
  preferredModules: WorkspaceOnboardingModulePreference[];
  primaryAction: WorkspaceOnboardingActionItem;
  secondaryAction: WorkspaceOnboardingActionItem;
  suggestedNextSteps: WorkspaceOnboardingActionItem[];
};

export type WorkspaceOnboardingSnapshot = {
  status: WorkspaceOnboardingStatus;
  values: WorkspaceOnboardingFormValues;
  draftSavedAt: string | null;
  completedAt: string | null;
  answeredRequiredCount: number;
  requiredFieldCount: number;
  progressPercent: number;
};

export type WorkspaceOnboardingSeed = {
  userType?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  country?: string | null;
  state?: string | null;
  taxIdentificationNumber?: string | null;
  defaultCurrency?: string | null;
  fiscalYearStartMonth?: string | number | null;
  vatApplicability?: string | null;
  whtApplicability?: string | null;
  multiBusinessNeed?: string | null;
  currentStep?: string | null;
  draftSavedAt?: string | Date | null;
  completedAt?: string | Date | null;
  status?: string | null;
};

export type WorkspaceBusinessProfileSeed = {
  businessName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  country?: string | null;
  state?: string | null;
  taxIdentificationNumber?: string | null;
  defaultCurrency?: string | null;
  fiscalYearStartMonth?: number | null;
  onboardingCompletedAt?: string | Date | null;
};

const USER_TYPE_VALUES = new Set<string>(
  ONBOARDING_USER_TYPE_OPTIONS.map((option) => option.value)
);
const TAX_APPLICABILITY_VALUES = new Set<string>(
  TAX_APPLICABILITY_OPTIONS.map((option) => option.value)
);
const MULTI_BUSINESS_VALUES = new Set<string>(
  MULTI_BUSINESS_NEED_OPTIONS.map((option) => option.value)
);
const BUSINESS_TYPE_VALUES = new Set<string>(
  BUSINESS_TYPE_OPTIONS.map((option) => option.value)
);
const NIGERIA_STATE_VALUES = new Set<string>(NIGERIA_STATE_OPTIONS);

const STEP_FIELDS: Record<
  WorkspaceOnboardingStep,
  Array<
    | "userType"
    | "businessName"
    | "businessType"
    | "industry"
    | "state"
    | "vatApplicability"
    | "whtApplicability"
    | "multiBusinessNeed"
    | "fiscalYearStartMonth"
  >
> = {
  profile: ["userType", "businessName", "businessType", "industry"],
  tax: ["state", "vatApplicability", "whtApplicability"],
  workspace: ["multiBusinessNeed", "fiscalYearStartMonth"],
};

const REQUIRED_FIELD_COUNT = Object.values(STEP_FIELDS).flat().length;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeOptionalEnum<T extends string>(value: string, allowed: Set<string>) {
  return allowed.has(value) ? (value as T) : null;
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getRequiredFieldAnswerCount(values: WorkspaceOnboardingFormValues) {
  return Object.values(STEP_FIELDS)
    .flat()
    .reduce((count, field) => count + (isRequiredFieldAnswered(field, values) ? 1 : 0), 0);
}

function isRequiredFieldAnswered(
  field:
    | "userType"
    | "businessName"
    | "businessType"
    | "industry"
    | "state"
    | "vatApplicability"
    | "whtApplicability"
    | "multiBusinessNeed"
    | "fiscalYearStartMonth",
  values: WorkspaceOnboardingFormValues
) {
  if (field === "fiscalYearStartMonth") {
    const parsed = Number(values.fiscalYearStartMonth);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12;
  }

  return normalizeText(values[field]).length > 0;
}

export function resolveWorkspaceOnboardingStep(
  value?: string | null
): WorkspaceOnboardingStep {
  return WORKSPACE_ONBOARDING_STEP_ORDER.includes(
    value as WorkspaceOnboardingStep
  )
    ? (value as WorkspaceOnboardingStep)
    : "profile";
}

export function createWorkspaceOnboardingDefaults(
  input?: Partial<WorkspaceOnboardingFormValues>
): WorkspaceOnboardingFormValues {
  return {
    userType: input?.userType ?? "",
    businessName: input?.businessName ?? "",
    businessType: input?.businessType ?? "",
    industry: input?.industry ?? "",
    country: input?.country ?? DEFAULT_COUNTRY,
    state: input?.state ?? "",
    taxIdentificationNumber: input?.taxIdentificationNumber ?? "",
    defaultCurrency: input?.defaultCurrency ?? DEFAULT_BUSINESS_CURRENCY,
    fiscalYearStartMonth:
      input?.fiscalYearStartMonth ?? String(DEFAULT_FISCAL_YEAR_START_MONTH),
    vatApplicability: input?.vatApplicability ?? "",
    whtApplicability: input?.whtApplicability ?? "",
    multiBusinessNeed: input?.multiBusinessNeed ?? "",
    currentStep: resolveWorkspaceOnboardingStep(input?.currentStep),
  };
}

export function getNextIncompleteWorkspaceOnboardingStep(
  values: WorkspaceOnboardingFormValues
) {
  for (const step of WORKSPACE_ONBOARDING_STEP_ORDER) {
    if (STEP_FIELDS[step].some((field) => !isRequiredFieldAnswered(field, values))) {
      return step;
    }
  }

  return "workspace" satisfies WorkspaceOnboardingStep;
}

export function getWorkspaceOnboardingProgress(values: WorkspaceOnboardingFormValues) {
  const answeredRequiredCount = getRequiredFieldAnswerCount(values);

  return {
    answeredRequiredCount,
    requiredFieldCount: REQUIRED_FIELD_COUNT,
    progressPercent: Math.round((answeredRequiredCount / REQUIRED_FIELD_COUNT) * 100),
  };
}

export function normalizeWorkspaceOnboardingInput(
  input: Partial<WorkspaceOnboardingFormValues>
): WorkspaceOnboardingNormalizedValues {
  const values = createWorkspaceOnboardingDefaults(input);
  const fiscalYearStartMonth = Number(values.fiscalYearStartMonth);

  return {
    userType: normalizeOptionalEnum<OnboardingUserType>(
      normalizeText(values.userType),
      USER_TYPE_VALUES
    ),
    businessName: normalizeText(values.businessName),
    businessType: normalizeText(values.businessType),
    industry: normalizeText(values.industry),
    country: DEFAULT_COUNTRY,
    state: normalizeText(values.state),
    taxIdentificationNumber: normalizeText(values.taxIdentificationNumber) || null,
    defaultCurrency: DEFAULT_BUSINESS_CURRENCY,
    fiscalYearStartMonth:
      Number.isInteger(fiscalYearStartMonth) && fiscalYearStartMonth >= 1 && fiscalYearStartMonth <= 12
        ? fiscalYearStartMonth
        : DEFAULT_FISCAL_YEAR_START_MONTH,
    vatApplicability: normalizeOptionalEnum<TaxApplicability>(
      normalizeText(values.vatApplicability),
      TAX_APPLICABILITY_VALUES
    ),
    whtApplicability: normalizeOptionalEnum<TaxApplicability>(
      normalizeText(values.whtApplicability),
      TAX_APPLICABILITY_VALUES
    ),
    multiBusinessNeed: normalizeOptionalEnum<MultiBusinessNeed>(
      normalizeText(values.multiBusinessNeed),
      MULTI_BUSINESS_VALUES
    ),
    currentStep: resolveWorkspaceOnboardingStep(values.currentStep),
  };
}

export function validateWorkspaceOnboardingCompletion(
  input: Partial<WorkspaceOnboardingFormValues>
) {
  const normalizedValues = normalizeWorkspaceOnboardingInput(input);
  const fieldErrors: WorkspaceOnboardingFieldErrors = {};

  if (!normalizedValues.userType) {
    fieldErrors.userType = "Choose how you use TaxBook.";
  }

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

  if (!normalizedValues.state) {
    fieldErrors.state = "Choose the state where this business operates most.";
  } else if (
    !NIGERIA_STATE_VALUES.has(
      normalizedValues.state as (typeof NIGERIA_STATE_OPTIONS)[number]
    )
  ) {
    fieldErrors.state = "Select a valid Nigerian state.";
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

  if (!normalizedValues.vatApplicability) {
    fieldErrors.vatApplicability = "Tell us if VAT applies.";
  }

  if (!normalizedValues.whtApplicability) {
    fieldErrors.whtApplicability = "Tell us if WHT applies.";
  }

  if (!normalizedValues.multiBusinessNeed) {
    fieldErrors.multiBusinessNeed = "Choose the setup that matches your work.";
  }

  if (
    !Number.isFinite(normalizedValues.fiscalYearStartMonth) ||
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

export function buildWorkspaceOnboardingSnapshot(input: {
  workspaceName: string;
  onboarding?: WorkspaceOnboardingSeed | null;
  businessProfile?: WorkspaceBusinessProfileSeed | null;
}): WorkspaceOnboardingSnapshot {
  const baseValues = createWorkspaceOnboardingDefaults({
    userType: input.onboarding?.userType ?? "",
    businessName:
      input.onboarding?.businessName ??
      input.businessProfile?.businessName ??
      input.workspaceName,
    businessType:
      input.onboarding?.businessType ?? input.businessProfile?.businessType ?? "",
    industry: input.onboarding?.industry ?? input.businessProfile?.industry ?? "",
    country: input.onboarding?.country ?? input.businessProfile?.country ?? DEFAULT_COUNTRY,
    state: input.onboarding?.state ?? input.businessProfile?.state ?? "",
    taxIdentificationNumber:
      input.onboarding?.taxIdentificationNumber ??
      input.businessProfile?.taxIdentificationNumber ??
      "",
    defaultCurrency:
      input.onboarding?.defaultCurrency ??
      input.businessProfile?.defaultCurrency ??
      DEFAULT_BUSINESS_CURRENCY,
    fiscalYearStartMonth: String(
      input.onboarding?.fiscalYearStartMonth ??
        input.businessProfile?.fiscalYearStartMonth ??
        DEFAULT_FISCAL_YEAR_START_MONTH
    ),
    vatApplicability: input.onboarding?.vatApplicability ?? "",
    whtApplicability: input.onboarding?.whtApplicability ?? "",
    multiBusinessNeed: input.onboarding?.multiBusinessNeed ?? "",
  });
  const values = {
    ...baseValues,
    currentStep:
      input.onboarding?.currentStep &&
      WORKSPACE_ONBOARDING_STEP_ORDER.includes(
        input.onboarding.currentStep as WorkspaceOnboardingStep
      )
        ? (input.onboarding.currentStep as WorkspaceOnboardingStep)
        : getNextIncompleteWorkspaceOnboardingStep(baseValues),
  };
  const progress = getWorkspaceOnboardingProgress(values);
  const completedAt =
    toIsoString(input.onboarding?.completedAt) ??
    toIsoString(input.businessProfile?.onboardingCompletedAt);

  return {
    status: completedAt ? "COMPLETED" : "IN_PROGRESS",
    values,
    draftSavedAt: toIsoString(input.onboarding?.draftSavedAt),
    completedAt,
    answeredRequiredCount: progress.answeredRequiredCount,
    requiredFieldCount: progress.requiredFieldCount,
    progressPercent: progress.progressPercent,
  };
}

function getOnboardingUserTypeLabel(value?: string | null) {
  return (
    ONBOARDING_USER_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
    "TaxBook user"
  );
}

export function getTaxApplicabilityLabel(value?: string | null) {
  return (
    TAX_APPLICABILITY_OPTIONS.find((option) => option.value === value)?.label ?? "Not set"
  );
}

export function getMultiBusinessNeedLabel(value?: string | null) {
  return (
    MULTI_BUSINESS_NEED_OPTIONS.find((option) => option.value === value)?.label ?? "Not set"
  );
}

function getModulePreference(href: string): WorkspaceOnboardingModulePreference {
  return {
    href,
    label:
      WORKSPACE_ONBOARDING_MODULE_LABELS[
        href as keyof typeof WORKSPACE_ONBOARDING_MODULE_LABELS
      ] ?? href,
  };
}

function uniqueByHref(items: WorkspaceOnboardingActionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function uniqueHrefs(hrefs: string[]) {
  const seen = new Set<string>();
  return hrefs.filter((href) => {
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

function hasLikelyTaxExposure(value?: string | null) {
  return value === "YES" || value === "NOT_SURE";
}

export function buildWorkspaceOnboardingDashboardConfig(input: {
  workspaceName: string;
  values: Partial<WorkspaceOnboardingFormValues>;
}) {
  const values = createWorkspaceOnboardingDefaults(input.values);
  const userType = normalizeOptionalEnum<OnboardingUserType>(
    normalizeText(values.userType),
    USER_TYPE_VALUES
  );
  const vatApplicability = normalizeOptionalEnum<TaxApplicability>(
    normalizeText(values.vatApplicability),
    TAX_APPLICABILITY_VALUES
  );
  const whtApplicability = normalizeOptionalEnum<TaxApplicability>(
    normalizeText(values.whtApplicability),
    TAX_APPLICABILITY_VALUES
  );
  const multiBusinessNeed = normalizeOptionalEnum<MultiBusinessNeed>(
    normalizeText(values.multiBusinessNeed),
    MULTI_BUSINESS_VALUES
  );
  const taxRelevant = hasLikelyTaxExposure(vatApplicability) || hasLikelyTaxExposure(whtApplicability);
  const isLimitedCompany =
    values.businessType === "LIMITED_LIABILITY_COMPANY" ||
    values.businessType === "CORPORATION";

  const preferredModuleHrefs = uniqueHrefs(
    userType === "ACCOUNTANT" || multiBusinessNeed === "ACCOUNTANT_PORTFOLIO"
      ? [
          "/dashboard/client-businesses",
          "/dashboard/filing-readiness",
          "/dashboard/tax-center",
          "/dashboard/notifications",
          "/dashboard/assistant",
          "/dashboard",
          "/dashboard/banking/review",
        ]
      : userType === "FINANCE_OPERATOR"
        ? [
            "/dashboard/banking/review",
            "/dashboard/bookkeeping/review",
            "/dashboard/notifications",
            "/dashboard/receipts",
            "/dashboard/tax-center",
            "/dashboard",
            "/dashboard/assistant",
          ]
        : [
            "/dashboard",
            taxRelevant ? "/dashboard/tax-center" : "/dashboard/reports",
            "/dashboard/assistant",
            "/dashboard/receipts",
            "/dashboard/banking/review",
            "/dashboard/notifications",
          ]
  );

  if (multiBusinessNeed === "MULTI_BUSINESS") {
    preferredModuleHrefs.unshift("/dashboard/workspaces");
  }

  if (taxRelevant) {
    preferredModuleHrefs.unshift("/dashboard/tax-center");
  }

  const nextSteps = uniqueByHref(
    [
      userType === "ACCOUNTANT" || multiBusinessNeed === "ACCOUNTANT_PORTFOLIO"
        ? {
            id: "open-client-businesses",
            href: "/dashboard/client-businesses",
            label: "Add your client businesses",
            description:
              "Start with the businesses you manage so your dashboard and filing tools stay organized.",
          }
        : null,
      {
        id: "review-transactions",
        href: "/dashboard/banking/review",
        label: "Review imported transactions",
        description:
          "Clear the review queue so categories, tax treatment, and readiness scores stay accurate.",
      },
      taxRelevant
        ? {
            id: "confirm-tax-setup",
            href: "/dashboard/tax-center",
            label: "Check VAT and WHT",
            description:
              "Confirm the live tax view early so you know what is already due and what needs attention.",
          }
        : null,
      multiBusinessNeed === "MULTI_BUSINESS"
        ? {
            id: "open-workspaces",
            href: "/dashboard/workspaces",
            label: "Set up your other businesses",
            description:
              "Keep each business in its own clean workspace so reporting and tax stay separate.",
          }
        : null,
      isLimitedCompany
        ? {
            id: "open-cit-workflow",
            href: "/dashboard/cit",
            label: "Open the CIT workflow",
            description:
              "Start your company income tax prep early so adjustments and evidence do not pile up later.",
          }
        : null,
      userType === "SME_OWNER"
        ? {
            id: "ask-assistant",
            href: "/dashboard/assistant",
            label: "Ask about your numbers",
            description:
              "Use the assistant for a simple explanation of revenue, expenses, tax due, and blockers.",
          }
        : null,
      userType === "FINANCE_OPERATOR"
        ? {
            id: "open-bookkeeping-review",
            href: "/dashboard/bookkeeping/review",
            label: "Clear the bookkeeping queue",
            description:
              "Approve the AI suggestions and keep daily posting work moving without delays.",
          }
        : null,
      {
        id: "open-notifications",
        href: "/dashboard/notifications",
        label: "Watch the alerts panel",
        description:
          "Keep an eye on duplicate activity, missing evidence, and filing blockers as work comes in.",
      },
    ].filter(Boolean) as WorkspaceOnboardingActionItem[]
  ).slice(0, 4);

  const primaryAction =
    nextSteps[0] ?? {
      id: "open-dashboard",
      href: "/dashboard",
      label: "Open dashboard",
      description: "Go to the workspace overview.",
    };
  const secondaryAction =
    nextSteps[1] ?? {
      id: "open-reports",
      href: "/dashboard/reports",
      label: "Open reports",
      description: "See the latest business totals.",
    };

  const highlights = [
    `${getOnboardingUserTypeLabel(userType)}`,
    `VAT: ${getTaxApplicabilityLabel(vatApplicability)}`,
    `WHT: ${getTaxApplicabilityLabel(whtApplicability)}`,
    getMultiBusinessNeedLabel(multiBusinessNeed),
    `Fiscal year starts in ${
      FISCAL_YEAR_MONTH_OPTIONS.find(
        (option) => option.value === Number(values.fiscalYearStartMonth)
      )?.label ?? "January"
    }`,
  ];

  const workspaceLabel = normalizeText(values.businessName) || input.workspaceName;

  return {
    userTypeLabel: getOnboardingUserTypeLabel(userType),
    welcomeTitle:
      userType === "ACCOUNTANT"
        ? `Keep ${workspaceLabel} ready for client deadlines.`
        : userType === "FINANCE_OPERATOR"
          ? `Keep ${workspaceLabel} moving with less finance back-and-forth.`
          : `See ${workspaceLabel} in plain language from day one.`,
    welcomeDescription:
      userType === "ACCOUNTANT"
        ? "TaxBook will keep client businesses, readiness checks, and tax views close to the top so you can move fast across your portfolio."
        : userType === "FINANCE_OPERATOR"
          ? "TaxBook will bring review work, bookkeeping, receipts, and alerts forward so daily finance operations stay clean."
          : "TaxBook will start with the clearest dashboard, tax view, and next steps for a Nigerian business owner.",
    highlights,
    preferredModuleHrefs: uniqueHrefs(preferredModuleHrefs),
    preferredModules: uniqueHrefs(preferredModuleHrefs).map((href) =>
      getModulePreference(href)
    ),
    primaryAction,
    secondaryAction,
    suggestedNextSteps: nextSteps,
  } satisfies WorkspaceOnboardingDashboardConfig;
}
