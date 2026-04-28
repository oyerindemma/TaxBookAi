import "server-only";

import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeSubscriptionPlan,
  resolveBillingIntervalFromPaystackPlanCode,
  resolvePlanFromPaystackPlanCode,
  type BillingInterval,
} from "@/lib/billing";
import type {
  PaystackCustomer,
  PaystackSubscriptionPayload,
  PaystackTransactionVerificationData,
} from "@/lib/paystack";

export type BillingMetadata = {
  workspaceId?: number | null;
  plan?: SubscriptionPlan | null;
  interval?: BillingInterval | null;
  userId?: number | null;
  source?: string | null;
};

function parseInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStatus(status: string | null | undefined) {
  return parseString(status)?.toLowerCase().replace(/[\s.-]+/g, "_") ?? null;
}

function parsePlan(value: unknown): SubscriptionPlan | null {
  return normalizeSubscriptionPlan(parseString(value));
}

function parseBillingInterval(value: unknown): BillingInterval | null {
  const normalized = parseString(value)?.toUpperCase();
  if (normalized === "MONTHLY" || normalized === "ANNUAL") {
    return normalized;
  }
  return null;
}

function addBillingIntervalFromNow(interval: BillingInterval) {
  const nextDate = new Date();
  if (interval === "ANNUAL") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }
  return nextDate;
}

function resolveCustomerCode(customer: PaystackCustomer | string | null | undefined) {
  if (!customer) return null;
  if (typeof customer === "string") return parseString(customer);
  return parseString(customer.customer_code);
}

function resolvePlanCode(
  transactionPlanObject: { plan_code?: string | null } | null | undefined,
  subscriptionPlan: PaystackSubscriptionPayload["plan"]
) {
  if (transactionPlanObject?.plan_code) return transactionPlanObject.plan_code;
  if (!subscriptionPlan) return null;
  if (typeof subscriptionPlan === "string") return parseString(subscriptionPlan);
  return parseString(subscriptionPlan.plan_code);
}

async function findSubscriptionTarget(input: {
  workspaceId?: number | null;
  paystackSubscriptionCode?: string | null;
  paystackCustomerCode?: string | null;
  paystackReference?: string | null;
}) {
  if (input.workspaceId) {
    return prisma.workspaceSubscription.findUnique({
      where: { workspaceId: input.workspaceId },
    });
  }

  if (input.paystackSubscriptionCode) {
    const bySubscription = await prisma.workspaceSubscription.findFirst({
      where: { paystackSubscriptionCode: input.paystackSubscriptionCode },
    });
    if (bySubscription) return bySubscription;
  }

  if (input.paystackReference) {
    const byReference = await prisma.workspaceSubscription.findFirst({
      where: { paystackReference: input.paystackReference },
    });
    if (byReference) return byReference;
  }

  if (input.paystackCustomerCode) {
    const byCustomer = await prisma.workspaceSubscription.findFirst({
      where: { paystackCustomerCode: input.paystackCustomerCode },
    });
    if (byCustomer) return byCustomer;
  }

  return null;
}

export function createSubscriptionCheckoutReference(
  workspaceId: number,
  plan: SubscriptionPlan,
  interval: BillingInterval,
  useStubPrefix = false
) {
  return `${useStubPrefix ? "stub_" : ""}sub_${workspaceId}_${plan}_${interval}_${Date.now()}`;
}

export function serializeBillingMetadata(metadata: BillingMetadata) {
  return JSON.stringify(metadata);
}

export function parseBillingMetadata(value: unknown): BillingMetadata {
  if (!value) return {};

  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (!raw || typeof raw !== "object") return {};

  const candidate = raw as Record<string, unknown>;
  return {
    workspaceId: parseInteger(candidate.workspaceId),
    plan: parsePlan(candidate.plan),
    interval: parseBillingInterval(candidate.interval),
    userId: parseInteger(candidate.userId),
    source: parseString(candidate.source),
  };
}

export function parseSubscriptionCheckoutReference(reference: string) {
  const match =
    /^(stub_)?sub_(\d+)_(STARTER|GROWTH|PROFESSIONAL|ENTERPRISE)(?:_(MONTHLY|ANNUAL))?_(\d+)$/i.exec(
      reference.trim()
    );

  if (!match) return null;

  return {
    isStub: Boolean(match[1]),
    workspaceId: Number(match[2]),
    plan: normalizeSubscriptionPlan(match[3]) ?? "STARTER",
    interval: parseBillingInterval(match[4]) ?? "MONTHLY",
    createdAtMs: Number(match[5]),
  };
}

function resolvePlanCandidate(values: Array<SubscriptionPlan | null | undefined>) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

export async function syncWorkspaceSubscriptionFromPaystackTransaction(
  transaction: PaystackTransactionVerificationData,
  planHint?: SubscriptionPlan | null
) {
  const metadata = parseBillingMetadata(transaction.metadata);
  const customerCode = resolveCustomerCode(transaction.customer);
  const subscriptionCode = parseString(transaction.subscription?.subscription_code);
  const subscriptionToken = parseString(transaction.subscription?.email_token);
  const planCode = resolvePlanCode(transaction.plan_object, transaction.subscription?.plan);
  const plan = resolvePlanCandidate([
    resolvePlanFromPaystackPlanCode(planCode),
    planHint,
    metadata.plan,
  ]);
  const existing = await findSubscriptionTarget({
    workspaceId: metadata.workspaceId,
    paystackSubscriptionCode: subscriptionCode,
    paystackCustomerCode: customerCode,
    paystackReference: parseString(transaction.reference),
  });

  const targetWorkspaceId = metadata.workspaceId ?? existing?.workspaceId ?? null;
  if (!targetWorkspaceId) return null;

  const billingInterval =
    resolveBillingIntervalFromPaystackPlanCode(planCode) ??
    metadata.interval ??
    parseBillingInterval(existing?.billingInterval) ??
    "MONTHLY";
  const currentPeriodEnd = parseDate(transaction.subscription?.next_payment_date);
  const status = normalizeStatus(transaction.subscription?.status) ?? normalizeStatus(transaction.status);
  const finalPlan = plan ?? existing?.plan ?? "STARTER";

  return prisma.workspaceSubscription.upsert({
    where: { workspaceId: targetWorkspaceId },
    update: {
      plan: finalPlan,
      status: status ?? (finalPlan === "STARTER" ? "free" : "active"),
      paystackCustomerCode: customerCode ?? undefined,
      paystackSubscriptionCode: subscriptionCode ?? undefined,
      paystackSubscriptionToken: subscriptionToken ?? undefined,
      paystackPlanCode: planCode ?? undefined,
      paystackReference: parseString(transaction.reference) ?? undefined,
      billingInterval,
      currentPeriodEnd,
    },
    create: {
      workspaceId: targetWorkspaceId,
      plan: finalPlan,
      status: status ?? (finalPlan === "STARTER" ? "free" : "active"),
      paystackCustomerCode: customerCode ?? undefined,
      paystackSubscriptionCode: subscriptionCode ?? undefined,
      paystackSubscriptionToken: subscriptionToken ?? undefined,
      paystackPlanCode: planCode ?? undefined,
      paystackReference: parseString(transaction.reference) ?? undefined,
      billingInterval,
      currentPeriodEnd,
    },
  });
}

export async function syncWorkspaceSubscriptionFromPaystackSubscription(
  subscription: PaystackSubscriptionPayload,
  options: {
    metadata?: BillingMetadata;
    statusHint?: string | null;
    forceFree?: boolean;
  } = {}
) {
  const metadata = options.metadata ?? parseBillingMetadata(subscription.metadata);
  const customerCode = resolveCustomerCode(subscription.customer);
  const subscriptionCode = parseString(subscription.subscription_code);
  const subscriptionToken = parseString(subscription.email_token);
  const planCode = resolvePlanCode(null, subscription.plan);
  const plan = resolvePlanCandidate([
    resolvePlanFromPaystackPlanCode(planCode),
    metadata.plan,
  ]);
  const existing = await findSubscriptionTarget({
    workspaceId: metadata.workspaceId,
    paystackSubscriptionCode: subscriptionCode,
    paystackCustomerCode: customerCode,
  });

  const targetWorkspaceId = metadata.workspaceId ?? existing?.workspaceId ?? null;
  if (!targetWorkspaceId) return null;

  const forceFree = options.forceFree === true;
  const billingInterval =
    resolveBillingIntervalFromPaystackPlanCode(planCode) ??
    metadata.interval ??
    parseBillingInterval(existing?.billingInterval) ??
    "MONTHLY";
  const currentPeriodEnd = parseDate(subscription.next_payment_date);
  const status =
    normalizeStatus(options.statusHint) ??
    normalizeStatus(subscription.status) ??
    (forceFree ? "free" : null);
  const finalPlan = forceFree ? "STARTER" : plan ?? existing?.plan ?? "STARTER";

  return prisma.workspaceSubscription.upsert({
    where: { workspaceId: targetWorkspaceId },
    update: {
      plan: finalPlan,
      status: status ?? (finalPlan === "STARTER" ? "free" : "active"),
      paystackCustomerCode: customerCode ?? undefined,
      paystackSubscriptionCode: subscriptionCode ?? undefined,
      paystackSubscriptionToken: subscriptionToken ?? undefined,
      paystackPlanCode: planCode ?? undefined,
      billingInterval,
      currentPeriodEnd,
    },
    create: {
      workspaceId: targetWorkspaceId,
      plan: finalPlan,
      status: status ?? (finalPlan === "STARTER" ? "free" : "active"),
      paystackCustomerCode: customerCode ?? undefined,
      paystackSubscriptionCode: subscriptionCode ?? undefined,
      paystackSubscriptionToken: subscriptionToken ?? undefined,
      paystackPlanCode: planCode ?? undefined,
      billingInterval,
      currentPeriodEnd,
    },
  });
}

export async function syncWorkspaceSubscriptionFromLocalTestReference(reference: string) {
  const parsed = parseSubscriptionCheckoutReference(reference);
  if (!parsed?.isStub) return null;

  return prisma.workspaceSubscription.upsert({
    where: { workspaceId: parsed.workspaceId },
    update: {
      plan: parsed.plan,
      status: parsed.plan === "STARTER" ? "free" : "active",
      billingInterval: parsed.interval,
      paystackReference: reference,
      currentPeriodEnd:
        parsed.plan === "STARTER" ? null : addBillingIntervalFromNow(parsed.interval),
    },
    create: {
      workspaceId: parsed.workspaceId,
      plan: parsed.plan,
      status: parsed.plan === "STARTER" ? "free" : "active",
      billingInterval: parsed.interval,
      paystackReference: reference,
      currentPeriodEnd:
        parsed.plan === "STARTER" ? null : addBillingIntervalFromNow(parsed.interval),
    },
  });
}

export async function markWorkspaceSubscriptionStatusFromPaystackEvent(
  payload: unknown,
  statusHint: string
) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const nestedSubscription =
    record.subscription && typeof record.subscription === "object"
      ? (record.subscription as PaystackSubscriptionPayload)
      : null;

  const metadata = parseBillingMetadata(record.metadata ?? nestedSubscription?.metadata);
  const customerCode = resolveCustomerCode(
    (record.customer as PaystackCustomer | string | null | undefined) ?? nestedSubscription?.customer
  );
  const subscriptionCode =
    parseString(record.subscription_code) ??
    parseString(nestedSubscription?.subscription_code);
  const reference = parseString(record.reference);
  const planCode = resolvePlanCode(
    record.plan_object && typeof record.plan_object === "object"
      ? (record.plan_object as { plan_code?: string | null })
      : null,
    (record.plan as PaystackSubscriptionPayload["plan"]) ?? nestedSubscription?.plan ?? null
  );

  const existing = await findSubscriptionTarget({
    workspaceId: metadata.workspaceId,
    paystackSubscriptionCode: subscriptionCode,
    paystackCustomerCode: customerCode,
    paystackReference: reference,
  });

  const targetWorkspaceId = metadata.workspaceId ?? existing?.workspaceId ?? null;
  if (!targetWorkspaceId) return null;

  const billingInterval =
    resolveBillingIntervalFromPaystackPlanCode(planCode) ??
    metadata.interval ??
    parseBillingInterval(existing?.billingInterval) ??
    "MONTHLY";
  const currentPeriodEnd =
    parseDate(
      parseString(record.next_payment_date) ?? parseString(nestedSubscription?.next_payment_date)
    ) ??
    existing?.currentPeriodEnd ??
    null;
  const finalPlan =
    resolvePlanCandidate([
      resolvePlanFromPaystackPlanCode(planCode),
      metadata.plan,
      existing?.plan,
    ]) ?? "STARTER";
  const normalizedStatus = normalizeStatus(statusHint) ?? "active";

  return prisma.workspaceSubscription.upsert({
    where: { workspaceId: targetWorkspaceId },
    update: {
      plan: finalPlan,
      status: normalizedStatus,
      billingInterval,
      paystackCustomerCode: customerCode ?? undefined,
      paystackSubscriptionCode: subscriptionCode ?? undefined,
      paystackPlanCode: planCode ?? undefined,
      paystackReference: reference ?? undefined,
      currentPeriodEnd,
    },
    create: {
      workspaceId: targetWorkspaceId,
      plan: finalPlan,
      status: normalizedStatus,
      billingInterval,
      paystackCustomerCode: customerCode ?? undefined,
      paystackSubscriptionCode: subscriptionCode ?? undefined,
      paystackPlanCode: planCode ?? undefined,
      paystackReference: reference ?? undefined,
      currentPeriodEnd,
    },
  });
}
