import "server-only";

import type { SubscriptionPlan, WorkspaceSubscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BillingInterval = "MONTHLY" | "ANNUAL";

export type PlanFeature =
  | "AI_ASSISTANT"
  | "BANKING"
  | "RECURRING_INVOICES"
  | "AUDIT_LOG"
  | "TEAM_COLLABORATION"
  | "TAX_FILING_ASSISTANT"
  | "API_INTEGRATIONS"
  | "PRIORITY_SUPPORT";

export type PlanLimitKey = "CLIENT_BUSINESSES" | "USERS" | "AI_SCANS" | "RECORDS";

export type PlanConfig = {
  id: SubscriptionPlan;
  name: string;
  description: string;
  target: string;
  monthlyPriceKobo: number;
  annualPriceKobo: number;
  maxBusinesses: number | null;
  maxUsers: number | null;
  aiScansPerMonth: number | null;
  includes: string[];
  lockedFeatures: string[];
  paystackPlanEnv: Record<BillingInterval, string[]>;
  featured?: boolean;
};

type FeatureConfig = {
  id: PlanFeature;
  name: string;
  description: string;
  requiredPlan: SubscriptionPlan;
};

type AddOnConfig = {
  id: "EXTRA_BUSINESS" | "EXTRA_RECEIPT_SCAN" | "TAX_FILING_AUTOMATION";
  name: string;
  description: string;
  monthlyPriceKobo: number;
  unitLabel: string;
};

const LEGACY_PLAN_MAP = {
  FREE: "STARTER",
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  BUSINESS: "PROFESSIONAL",
  PRO: "PROFESSIONAL",
  PROFESSIONAL: "PROFESSIONAL",
  ACCOUNTANT: "ENTERPRISE",
  TEAM: "ENTERPRISE",
  ENTERPRISE: "ENTERPRISE",
  CUSTOM: "ENTERPRISE",
} as const satisfies Record<string, SubscriptionPlan>;

const AI_SCAN_AUDIT_ACTIONS = [
  "AI_BOOKKEEPING_SUGGESTION_GENERATED",
  "BOOKKEEPING_UPLOAD_EXTRACTED",
] as const;

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export const BILLING_INTERVALS: BillingInterval[] = ["MONTHLY", "ANNUAL"];

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "enabled",
  "ongoing",
  "renewing",
  "success",
]);

const GRACE_SUBSCRIPTION_STATUSES = new Set([
  "attention",
  "canceled",
  "cancelled",
  "charge_failed",
  "disabled",
  "expired",
  "failed",
  "invoice_payment_failed",
  "non_renewing",
  "past_due",
  "payment_failed",
]);

const PENDING_SUBSCRIPTION_STATUSES = new Set([
  "initialized",
  "pending",
  "pending_local_test",
  "processing",
]);

export const PLAN_CONFIG: Record<SubscriptionPlan, PlanConfig> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    description: "Manual bookkeeping for one Nigerian business getting started on TaxBook AI.",
    target: "Small businesses testing the platform",
    monthlyPriceKobo: 0,
    annualPriceKobo: 0,
    maxBusinesses: 1,
    maxUsers: 1,
    aiScansPerMonth: 0,
    includes: [
      "Manual bookkeeping",
      "VAT summary",
      "Basic reports",
    ],
    lockedFeatures: [
      "AI receipt scanning",
      "Bank reconciliation",
      "Team access",
      "Tax filing automation",
    ],
    paystackPlanEnv: {
      MONTHLY: [],
      ANNUAL: [],
    },
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    description: "AI-assisted bookkeeping for startups and small firms building daily finance discipline.",
    target: "Startups and small firms",
    monthlyPriceKobo: 950000,
    annualPriceKobo: 9120000,
    maxBusinesses: 5,
    maxUsers: 2,
    aiScansPerMonth: 500,
    includes: [
      "AI receipt scanning",
      "Bookkeeping automation",
      "VAT and WHT summary",
      "Invoice management",
      "Basic reports",
    ],
    lockedFeatures: [
      "Bank reconciliation",
      "Advanced tax filing automation",
    ],
    paystackPlanEnv: {
      MONTHLY: ["PAYSTACK_PLAN_GROWTH"],
      ANNUAL: ["PAYSTACK_PLAN_GROWTH_ANNUAL"],
    },
  },
  PROFESSIONAL: {
    id: "PROFESSIONAL",
    name: "Professional",
    description:
      "Built for accounting firms and finance teams managing multiple client businesses with deeper controls.",
    target: "Accounting firms managing multiple clients",
    monthlyPriceKobo: 2500000,
    annualPriceKobo: 24000000,
    maxBusinesses: 25,
    maxUsers: 5,
    aiScansPerMonth: 2000,
    includes: [
      "AI receipt scanning",
      "Bank statement AI reconciliation",
      "Advanced reporting",
      "Tax filing assistant",
      "Audit logs",
      "Team collaboration",
    ],
    lockedFeatures: [
      "Enterprise API integrations",
      "Priority support",
    ],
    paystackPlanEnv: {
      MONTHLY: ["PAYSTACK_PLAN_PROFESSIONAL", "PAYSTACK_PLAN_BUSINESS"],
      ANNUAL: ["PAYSTACK_PLAN_PROFESSIONAL_ANNUAL", "PAYSTACK_PLAN_BUSINESS_ANNUAL"],
    },
    featured: true,
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    description:
      "Unlimited operating scale for medium and large firms that need integrations, automation, and priority handling.",
    target: "Medium and large firms",
    monthlyPriceKobo: 6000000,
    annualPriceKobo: 57600000,
    maxBusinesses: null,
    maxUsers: null,
    aiScansPerMonth: null,
    includes: [
      "Unlimited businesses",
      "Unlimited users",
      "Unlimited AI scans",
      "Automated tax filing",
      "API integrations",
      "Priority support",
    ],
    lockedFeatures: [],
    paystackPlanEnv: {
      MONTHLY: ["PAYSTACK_PLAN_ENTERPRISE", "PAYSTACK_PLAN_ACCOUNTANT"],
      ANNUAL: ["PAYSTACK_PLAN_ENTERPRISE_ANNUAL", "PAYSTACK_PLAN_ACCOUNTANT_ANNUAL"],
    },
  },
};

export const ADD_ON_CONFIG: Record<AddOnConfig["id"], AddOnConfig> = {
  EXTRA_BUSINESS: {
    id: "EXTRA_BUSINESS",
    name: "Additional business",
    description: "Add more client businesses above the included plan limit.",
    monthlyPriceKobo: 100000,
    unitLabel: "per extra business / month",
  },
  EXTRA_RECEIPT_SCAN: {
    id: "EXTRA_RECEIPT_SCAN",
    name: "Extra AI scan",
    description: "Extend monthly AI receipt and document scan capacity.",
    monthlyPriceKobo: 2000,
    unitLabel: "per extra scan",
  },
  TAX_FILING_AUTOMATION: {
    id: "TAX_FILING_AUTOMATION",
    name: "Tax filing automation add-on",
    description: "Future add-on for deeper filing automation workflows.",
    monthlyPriceKobo: 500000,
    unitLabel: "per month",
  },
};

export const FEATURE_CONFIG: Record<PlanFeature, FeatureConfig> = {
  AI_ASSISTANT: {
    id: "AI_ASSISTANT",
    name: "AI receipt scanning and bookkeeping automation",
    description: "Scan receipts, draft bookkeeping suggestions, and use AI-assisted capture flows.",
    requiredPlan: "GROWTH",
  },
  BANKING: {
    id: "BANKING",
    name: "Bank statement AI reconciliation",
    description: "Import CSV statements, match activity, and reconcile against ledger and invoice records.",
    requiredPlan: "PROFESSIONAL",
  },
  RECURRING_INVOICES: {
    id: "RECURRING_INVOICES",
    name: "Invoice management and recurring billing",
    description: "Create invoices, schedule repeat billing, and manage recurring collections.",
    requiredPlan: "GROWTH",
  },
  AUDIT_LOG: {
    id: "AUDIT_LOG",
    name: "Audit logs",
    description: "Track operational changes across the workspace for review and governance.",
    requiredPlan: "PROFESSIONAL",
  },
  TEAM_COLLABORATION: {
    id: "TEAM_COLLABORATION",
    name: "Team collaboration",
    description: "Invite teammates, manage roles, and collaborate safely across finance workflows.",
    requiredPlan: "PROFESSIONAL",
  },
  TAX_FILING_ASSISTANT: {
    id: "TAX_FILING_ASSISTANT",
    name: "Tax filing assistant",
    description: "Generate advanced Nigerian tax filing review packs and assisted compliance outputs.",
    requiredPlan: "PROFESSIONAL",
  },
  API_INTEGRATIONS: {
    id: "API_INTEGRATIONS",
    name: "API integrations",
    description: "Connect enterprise workflows and downstream systems to TaxBook AI.",
    requiredPlan: "ENTERPRISE",
  },
  PRIORITY_SUPPORT: {
    id: "PRIORITY_SUPPORT",
    name: "Priority support",
    description: "Receive enterprise-grade onboarding and support response handling.",
    requiredPlan: "ENTERPRISE",
  },
};

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 0,
  GROWTH: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

export const PLAN_ORDER: SubscriptionPlan[] = [
  "STARTER",
  "GROWTH",
  "PROFESSIONAL",
  "ENTERPRISE",
];

export function normalizeSubscriptionPlan(value: string | null | undefined): SubscriptionPlan | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return LEGACY_PLAN_MAP[normalized as keyof typeof LEGACY_PLAN_MAP] ?? null;
}

export function getPlanConfig(plan: SubscriptionPlan) {
  return PLAN_CONFIG[plan];
}

export function getFeatureConfig(feature: PlanFeature) {
  return FEATURE_CONFIG[feature];
}

export function getPlanPriceKobo(plan: SubscriptionPlan, interval: BillingInterval = "MONTHLY") {
  const config = getPlanConfig(plan);
  return interval === "ANNUAL" ? config.annualPriceKobo : config.monthlyPriceKobo;
}

export function getPlanAnnualSavingsKobo(plan: SubscriptionPlan) {
  const config = getPlanConfig(plan);
  return Math.max(config.monthlyPriceKobo * 12 - config.annualPriceKobo, 0);
}

export function formatKobo(value: number) {
  return currencyFormatter.format(value / 100);
}

export function formatLimit(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

export function formatAiScanLimit(value: number | null) {
  if (value === 0) return "Not included";
  return formatLimit(value);
}

export function formatBillingIntervalLabel(interval: BillingInterval | null | undefined) {
  if (interval === "ANNUAL") return "Annual";
  return "Monthly";
}

export function formatPlanPrice(plan: SubscriptionPlan, interval: BillingInterval = "MONTHLY") {
  const amount = getPlanPriceKobo(plan, interval);
  return amount === 0 ? "Free" : formatKobo(amount);
}

export function formatPlanPricePerInterval(
  plan: SubscriptionPlan,
  interval: BillingInterval = "MONTHLY"
) {
  const price = formatPlanPrice(plan, interval);
  if (price === "Free") return price;
  return `${price}/${interval === "ANNUAL" ? "year" : "month"}`;
}

export function formatPlanPricePerMonth(plan: SubscriptionPlan) {
  return formatPlanPricePerInterval(plan, "MONTHLY");
}

export function formatPlanPricePerYear(plan: SubscriptionPlan) {
  return formatPlanPricePerInterval(plan, "ANNUAL");
}

export function formatAnnualSavings(plan: SubscriptionPlan) {
  const savings = getPlanAnnualSavingsKobo(plan);
  return savings > 0 ? formatKobo(savings) : null;
}

function normalizeBillingIntervalValue(value: string | null | undefined): BillingInterval | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "MONTHLY" || normalized === "ANNUAL") {
    return normalized;
  }
  return null;
}

export function getPaystackPlanCode(
  plan: SubscriptionPlan,
  interval: BillingInterval = "MONTHLY"
) {
  const envNames = PLAN_CONFIG[plan].paystackPlanEnv[interval];
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function resolvePlanFromPaystackPlanCode(planCode: string | null | undefined) {
  if (!planCode) return null;
  const entries = Object.entries(PLAN_CONFIG) as [SubscriptionPlan, PlanConfig][];
  for (const [plan, config] of entries) {
    for (const interval of BILLING_INTERVALS) {
      for (const envName of config.paystackPlanEnv[interval]) {
        if (process.env[envName] === planCode) {
          return plan;
        }
      }
    }
  }
  return null;
}

export function resolveBillingIntervalFromPaystackPlanCode(
  planCode: string | null | undefined
): BillingInterval | null {
  if (!planCode) return null;
  const entries = Object.values(PLAN_CONFIG);
  for (const config of entries) {
    for (const interval of BILLING_INTERVALS) {
      for (const envName of config.paystackPlanEnv[interval]) {
        if (process.env[envName] === planCode) {
          return interval;
        }
      }
    }
  }
  return null;
}

function hasFuturePeriodEnd(subscription: Pick<WorkspaceSubscription, "currentPeriodEnd">) {
  return Boolean(
    subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > Date.now()
  );
}

export function getWorkspaceSubscriptionBillingInterval(
  subscription:
    | Pick<WorkspaceSubscription, "billingInterval" | "paystackPlanCode">
    | null
    | undefined
) {
  return (
    normalizeBillingIntervalValue(subscription?.billingInterval) ??
    resolveBillingIntervalFromPaystackPlanCode(subscription?.paystackPlanCode) ??
    "MONTHLY"
  );
}

function isWorkspaceSubscriptionEntitled(subscription: WorkspaceSubscription) {
  if (subscription.plan === "STARTER") return true;

  const status = normalizeStatusValue(subscription.status);
  if (!status) {
    return hasFuturePeriodEnd(subscription) || Boolean(subscription.paystackSubscriptionCode);
  }

  if (ACTIVE_SUBSCRIPTION_STATUSES.has(status)) return true;
  if (PENDING_SUBSCRIPTION_STATUSES.has(status)) return false;
  if (GRACE_SUBSCRIPTION_STATUSES.has(status)) return hasFuturePeriodEnd(subscription);
  if (status === "free") return false;

  return hasFuturePeriodEnd(subscription);
}

async function reconcileWorkspaceSubscriptionRecord(subscription: WorkspaceSubscription) {
  const billingInterval = getWorkspaceSubscriptionBillingInterval(subscription);
  let nextPlan = subscription.plan;
  let nextStatus = subscription.status;
  let nextCurrentPeriodEnd = subscription.currentPeriodEnd;
  let needsUpdate =
    normalizeBillingIntervalValue(subscription.billingInterval) !== billingInterval;

  if (subscription.plan === "STARTER") {
    if (normalizeStatusValue(subscription.status) !== "free") {
      nextStatus = "free";
      needsUpdate = true;
    }
    if (subscription.currentPeriodEnd) {
      nextCurrentPeriodEnd = null;
      needsUpdate = true;
    }
  } else if (!isWorkspaceSubscriptionEntitled({ ...subscription, billingInterval })) {
    nextPlan = "STARTER";
    nextStatus = "free";
    nextCurrentPeriodEnd = null;
    needsUpdate = true;
  }

  if (!needsUpdate) {
    return {
      ...subscription,
      billingInterval,
    };
  }

  return prisma.workspaceSubscription.update({
    where: { workspaceId: subscription.workspaceId },
    data: {
      plan: nextPlan,
      status: nextStatus,
      billingInterval,
      currentPeriodEnd: nextCurrentPeriodEnd,
    },
  });
}

export function isPlanAtLeast(plan: SubscriptionPlan, requiredPlan: SubscriptionPlan) {
  return PLAN_RANK[plan] >= PLAN_RANK[requiredPlan];
}

export function hasPlanFeature(plan: SubscriptionPlan, feature: PlanFeature) {
  return isPlanAtLeast(plan, FEATURE_CONFIG[feature].requiredPlan);
}

export function getNextPlan(plan: SubscriptionPlan) {
  const currentIndex = PLAN_ORDER.indexOf(plan);
  if (currentIndex === -1 || currentIndex === PLAN_ORDER.length - 1) {
    return null;
  }
  return PLAN_ORDER[currentIndex + 1];
}

export function getPrimaryUpgradeHref(requiredPlan: SubscriptionPlan) {
  return requiredPlan === "ENTERPRISE" ? "/contact" : "/dashboard/billing";
}

export function getPrimaryUpgradeLabel(requiredPlan: SubscriptionPlan) {
  return requiredPlan === "ENTERPRISE"
    ? "Contact Sales"
    : `Upgrade to ${getPlanConfig(requiredPlan).name}`;
}

export function shouldBypassFeatureGate(feature: PlanFeature) {
  return (
    process.env.NODE_ENV !== "production" &&
    (feature === "AI_ASSISTANT" || feature === "BANKING")
  );
}

export async function ensureWorkspaceSubscription(workspaceId: number) {
  const subscription = await prisma.workspaceSubscription.upsert({
    where: { workspaceId },
    update: {},
    create: {
      workspaceId,
      plan: "STARTER",
      status: "free",
      billingInterval: "MONTHLY",
    },
  });

  return reconcileWorkspaceSubscriptionRecord(subscription);
}

export async function getWorkspaceSubscription(workspaceId: number) {
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
  });

  return subscription ? reconcileWorkspaceSubscriptionRecord(subscription) : null;
}

export type FeatureAccessResult =
  | { ok: true; subscription: WorkspaceSubscription; bypassed: boolean }
  | {
      ok: false;
      subscription: WorkspaceSubscription;
      plan: SubscriptionPlan;
      requiredPlan: SubscriptionPlan;
      feature: PlanFeature;
      error: string;
    };

export async function getWorkspaceFeatureAccess(
  workspaceId: number,
  feature: PlanFeature
): Promise<FeatureAccessResult> {
  const subscription = await ensureWorkspaceSubscription(workspaceId);
  const bypassed = shouldBypassFeatureGate(feature);

  if (hasPlanFeature(subscription.plan, feature) || bypassed) {
    return { ok: true, subscription, bypassed };
  }

  const featureConfig = getFeatureConfig(feature);
  return {
    ok: false,
    subscription,
    plan: subscription.plan,
    requiredPlan: featureConfig.requiredPlan,
    feature,
    error: `${featureConfig.name} requires the ${getPlanConfig(featureConfig.requiredPlan).name} plan or higher.`,
  };
}

export type PlanLimitResult =
  | {
      ok: true;
      plan: SubscriptionPlan;
      max: number | null;
      current: number;
      limitKey: PlanLimitKey;
      recommendedPlan: SubscriptionPlan | null;
    }
  | {
      ok: false;
      plan: SubscriptionPlan;
      max: number;
      current: number;
      limitKey: PlanLimitKey;
      recommendedPlan: SubscriptionPlan | null;
      error: string;
    };

export type WorkspaceUsageSnapshot = {
  plan: SubscriptionPlan;
  currentBusinesses: number;
  maxBusinesses: number | null;
  currentUsers: number;
  maxUsers: number | null;
  currentAiScansThisMonth: number;
  aiScansPerMonth: number | null;
};

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

async function countWorkspaceBusinesses(workspaceId: number) {
  return prisma.clientBusiness.count({
    where: {
      workspaceId,
      archivedAt: null,
      status: "ACTIVE",
    },
  });
}

async function countWorkspaceMembers(
  workspaceId: number,
  includePendingInvites: boolean
) {
  const [memberCount, inviteCount] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId } }),
    includePendingInvites
      ? prisma.invite.count({
          where: {
            workspaceId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
        })
      : Promise.resolve(0),
  ]);

  return memberCount + inviteCount;
}

async function countWorkspaceAiScansThisMonth(workspaceId: number) {
  return prisma.auditLog.count({
    where: {
      workspaceId,
      createdAt: { gte: getCurrentMonthStart() },
      action: { in: [...AI_SCAN_AUDIT_ACTIONS] },
    },
  });
}

function buildLimitExceededMessage(plan: SubscriptionPlan, limitKey: PlanLimitKey, max: number) {
  const config = getPlanConfig(plan);
  const nextPlan = getNextPlan(plan);

  if (limitKey === "CLIENT_BUSINESSES" && plan === "PROFESSIONAL") {
    return `${config.name} includes up to ${max.toLocaleString()} businesses. Move to Enterprise or use additional-business add-ons when add-on billing is enabled.`;
  }

  if (limitKey === "AI_SCANS" && plan === "PROFESSIONAL") {
    return `${config.name} includes up to ${max.toLocaleString()} AI scans per month. Move to Enterprise or use extra scan capacity when add-on billing is enabled.`;
  }

  if (limitKey === "AI_SCANS" && plan === "STARTER") {
    return "Starter does not include AI receipt scans. Upgrade to Growth to unlock up to 500 AI scans per month.";
  }

  if (limitKey === "USERS" && plan === "STARTER") {
    return "Starter is limited to one user. Upgrade to Professional to unlock team access and a larger seat cap.";
  }

  if (limitKey === "USERS" && plan === "GROWTH") {
    return "Growth seat allocation tops out at 2 users. Upgrade to Professional for full team collaboration and a higher user cap.";
  }

  if (nextPlan) {
    const nextConfig = getPlanConfig(nextPlan);
    return `${config.name} allows up to ${max.toLocaleString()} ${limitKey === "CLIENT_BUSINESSES" ? "businesses" : limitKey === "AI_SCANS" ? "AI scans per month" : limitKey === "USERS" ? "users" : "records"}. Upgrade to ${nextConfig.name} to continue.`;
  }

  return `${config.name} allows up to ${max.toLocaleString()} ${limitKey === "CLIENT_BUSINESSES" ? "businesses" : limitKey === "AI_SCANS" ? "AI scans per month" : limitKey === "USERS" ? "users" : "records"}.`;
}

function buildPlanLimitResult(input: {
  plan: SubscriptionPlan;
  max: number | null;
  current: number;
  additionalUnits: number;
  limitKey: PlanLimitKey;
  bypassed?: boolean;
}) {
  if (input.bypassed || input.max === null) {
    return {
      ok: true as const,
      plan: input.plan,
      max: input.max,
      current: input.current,
      limitKey: input.limitKey,
      recommendedPlan: getNextPlan(input.plan),
    };
  }

  if (input.current + input.additionalUnits > input.max) {
    return {
      ok: false as const,
      plan: input.plan,
      max: input.max,
      current: input.current,
      limitKey: input.limitKey,
      recommendedPlan: getNextPlan(input.plan),
      error: buildLimitExceededMessage(input.plan, input.limitKey, input.max),
    };
  }

  return {
    ok: true as const,
    plan: input.plan,
    max: input.max,
    current: input.current,
    limitKey: input.limitKey,
    recommendedPlan: getNextPlan(input.plan),
  };
}

export async function getWorkspaceUsageSnapshot(workspaceId: number): Promise<WorkspaceUsageSnapshot> {
  const subscription = await ensureWorkspaceSubscription(workspaceId);
  const planConfig = getPlanConfig(subscription.plan);

  const [currentBusinesses, currentUsers, currentAiScansThisMonth] = await Promise.all([
    countWorkspaceBusinesses(workspaceId),
    countWorkspaceMembers(workspaceId, false),
    countWorkspaceAiScansThisMonth(workspaceId),
  ]);

  return {
    plan: subscription.plan,
    currentBusinesses,
    maxBusinesses: planConfig.maxBusinesses,
    currentUsers,
    maxUsers: planConfig.maxUsers,
    currentAiScansThisMonth,
    aiScansPerMonth: planConfig.aiScansPerMonth,
  };
}

export async function enforceRecordLimit(
  workspaceId: number,
  additionalRecords: number
): Promise<PlanLimitResult> {
  const subscription = await ensureWorkspaceSubscription(workspaceId);
  const current = await prisma.taxRecord.count({ where: { workspaceId } });

  return buildPlanLimitResult({
    plan: subscription.plan,
    max: null,
    current,
    additionalUnits: additionalRecords,
    limitKey: "RECORDS",
  });
}

export async function enforceClientBusinessLimit(
  workspaceId: number,
  additionalBusinesses: number
): Promise<PlanLimitResult> {
  const subscription = await ensureWorkspaceSubscription(workspaceId);
  const planConfig = getPlanConfig(subscription.plan);
  const current = await countWorkspaceBusinesses(workspaceId);

  return buildPlanLimitResult({
    plan: subscription.plan,
    max: planConfig.maxBusinesses,
    current,
    additionalUnits: additionalBusinesses,
    limitKey: "CLIENT_BUSINESSES",
  });
}

export async function enforceMemberLimit(
  workspaceId: number,
  additionalMembers: number,
  includePendingInvites = false
): Promise<PlanLimitResult> {
  const subscription = await ensureWorkspaceSubscription(workspaceId);
  const planConfig = getPlanConfig(subscription.plan);
  const current = await countWorkspaceMembers(workspaceId, includePendingInvites);

  return buildPlanLimitResult({
    plan: subscription.plan,
    max: planConfig.maxUsers,
    current,
    additionalUnits: additionalMembers,
    limitKey: "USERS",
  });
}

export async function enforceAiScanLimit(
  workspaceId: number,
  additionalScans: number
): Promise<PlanLimitResult> {
  const subscription = await ensureWorkspaceSubscription(workspaceId);
  const planConfig = getPlanConfig(subscription.plan);
  const current = await countWorkspaceAiScansThisMonth(workspaceId);

  return buildPlanLimitResult({
    plan: subscription.plan,
    max: planConfig.aiScansPerMonth,
    current,
    additionalUnits: additionalScans,
    limitKey: "AI_SCANS",
    bypassed: shouldBypassFeatureGate("AI_ASSISTANT"),
  });
}

function humanizeStatus(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatusValue(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s.-]+/g, "_") ?? null;
}

export function formatSubscriptionStatus(subscription: WorkspaceSubscription | null) {
  if (!subscription) return getPlanConfig("STARTER").name;
  const planName = getPlanConfig(subscription.plan).name;
  if (subscription.plan === "STARTER" && normalizeStatusValue(subscription.status) === "free") {
    return planName;
  }
  if (!subscription.status) return planName;
  return `${planName} · ${humanizeStatus(subscription.status)}`;
}
