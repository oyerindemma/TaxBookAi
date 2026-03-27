import { NextResponse } from "next/server";
import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  BILLING_INTERVALS,
  type BillingInterval,
  ensureWorkspaceSubscription,
  getPaystackPlanCode,
  getPlanPriceKobo,
  isPlanAtLeast,
  PLAN_CONFIG,
} from "@/lib/billing";
import { getAppUrl, getPaymentRuntimeConfig, hasPaystackServerConfig } from "@/lib/env";
import { logRouteError } from "@/lib/logger";
import { initializePaystackTransaction } from "@/lib/paystack";
import {
  createSubscriptionCheckoutReference,
  serializeBillingMetadata,
} from "@/lib/paystack-billing";

export const runtime = "nodejs";

function isPlan(value: string): value is SubscriptionPlan {
  return value in PLAN_CONFIG;
}

function isBillingInterval(value: string): value is BillingInterval {
  return BILLING_INTERVALS.includes(value as BillingInterval);
}

function buildStubCheckoutUrl(reference: string) {
  const url = new URL("/api/billing/callback", getAppUrl());
  url.searchParams.set("reference", reference);
  url.searchParams.set("stub", "1");
  return url.toString();
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "OWNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const requestedPlan = String(body?.plan ?? "").toUpperCase();
    const interval = String(body?.interval ?? "MONTHLY").toUpperCase();
    if (!isPlan(requestedPlan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    if (!isBillingInterval(interval)) {
      return NextResponse.json({ error: "Invalid billing interval" }, { status: 400 });
    }
    if (requestedPlan === "STARTER") {
      return NextResponse.json(
        { error: "Starter does not require checkout" },
        { status: 400 }
      );
    }
    if (requestedPlan === "ENTERPRISE") {
      return NextResponse.json(
        { error: "Enterprise upgrades are handled through sales" },
        { status: 400 }
      );
    }

    const planCode = getPaystackPlanCode(requestedPlan, interval);
    const subscription = await ensureWorkspaceSubscription(ctx.workspaceId);
    if (subscription.plan === requestedPlan && subscription.status !== "free") {
      return NextResponse.json({ error: "This is already your active plan" }, { status: 400 });
    }
    if (isPlanAtLeast(subscription.plan, requestedPlan)) {
      return NextResponse.json(
        { error: "Downgrades are not handled through self-serve checkout" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (!user?.email) {
      return NextResponse.json({ error: "User email is required for checkout" }, { status: 400 });
    }

    const allowStubPayments = getPaymentRuntimeConfig().allowStubPayments;
    const canUseStubCheckout =
      allowStubPayments && (!hasPaystackServerConfig() || !planCode);
    if (!canUseStubCheckout && !hasPaystackServerConfig()) {
      return NextResponse.json(
        { error: "Billing is not configured on this environment" },
        { status: 503 }
      );
    }
    if (!canUseStubCheckout && !planCode) {
      return NextResponse.json(
        {
          error: `Billing is not configured for the ${interval.toLowerCase()} ${requestedPlan.toLowerCase()} plan`,
        },
        { status: 503 }
      );
    }
    const reference = createSubscriptionCheckoutReference(
      ctx.workspaceId,
      requestedPlan,
      interval,
      canUseStubCheckout
    );
    const appUrl = getAppUrl();

    await prisma.workspaceSubscription.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        status: canUseStubCheckout ? "pending_local_test" : "pending",
        billingInterval: interval,
        paystackPlanCode: planCode,
        paystackReference: reference,
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "SUBSCRIPTION_CHECKOUT_INITIALIZED",
      metadata: {
        requestedPlan,
        interval,
        reference,
        stubbed: canUseStubCheckout,
      },
    });

    if (canUseStubCheckout) {
      return NextResponse.json({
        url: buildStubCheckoutUrl(reference),
        mode: "stub",
      });
    }

    const resolvedPlanCode = planCode;
    if (!resolvedPlanCode) {
      return NextResponse.json(
        { error: "Billing plan code is missing for this checkout" },
        { status: 503 }
      );
    }

    const checkout = await initializePaystackTransaction({
      email: user.email,
      amount: getPlanPriceKobo(requestedPlan, interval),
      planCode: resolvedPlanCode,
      reference,
      callbackUrl: `${appUrl}/api/billing/callback`,
      metadata: serializeBillingMetadata({
        workspaceId: ctx.workspaceId,
        plan: requestedPlan,
        interval,
        userId: ctx.userId,
        source: `pricing-${interval.toLowerCase()}`,
      }),
    });

    return NextResponse.json({ url: checkout.authorization_url });
  } catch (error) {
    logRouteError("billing checkout failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error creating checkout session" },
      { status: 500 }
    );
  }
}
