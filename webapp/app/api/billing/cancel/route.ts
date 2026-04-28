import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { ensureWorkspaceSubscription } from "@/lib/billing";
import { getPaymentRuntimeConfig, hasPaystackServerConfig } from "@/lib/env";
import { logRouteError } from "@/lib/logger";
import { disablePaystackSubscription } from "@/lib/paystack";

export const runtime = "nodejs";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "OWNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const subscription = await ensureWorkspaceSubscription(ctx.workspaceId);
    if (subscription.plan === "STARTER") {
      return NextResponse.json({ error: "This workspace is already on Starter" }, { status: 400 });
    }

    const allowStubPayments = getPaymentRuntimeConfig().allowStubPayments;
    if (!hasPaystackServerConfig()) {
      if (!allowStubPayments) {
        return NextResponse.json(
          { error: "Billing cancellation is not configured on this environment" },
          { status: 503 }
        );
      }

      const downgraded = await prisma.workspaceSubscription.update({
        where: { workspaceId: ctx.workspaceId },
        data: {
          plan: "STARTER",
          status: "free",
          currentPeriodEnd: null,
        },
      });

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "SUBSCRIPTION_LOCAL_TEST_CANCELED",
        metadata: {
          previousPlan: subscription.plan,
        },
      });

      return NextResponse.json({
        ok: true,
        stubbed: true,
        subscription: downgraded,
        message: "Local test subscription cleared and workspace returned to Starter.",
      });
    }

    if (!subscription.paystackSubscriptionCode || !subscription.paystackSubscriptionToken) {
      return NextResponse.json(
        {
          error:
            "The stored Paystack subscription details are incomplete. Use the management link instead or re-run verification.",
        },
        { status: 400 }
      );
    }

    await disablePaystackSubscription({
      subscriptionCode: subscription.paystackSubscriptionCode,
      emailToken: subscription.paystackSubscriptionToken,
    });

    const updated = await prisma.workspaceSubscription.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        status: "non_renewing",
      },
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "SUBSCRIPTION_CANCEL_REQUESTED",
      metadata: {
        paystackSubscriptionCode: subscription.paystackSubscriptionCode,
        plan: subscription.plan,
      },
    });

    return NextResponse.json({
      ok: true,
      subscription: updated,
      message:
        "Subscription auto-renew has been turned off. Paid access will remain until the current billing period ends.",
    });
  } catch (error) {
    logRouteError("billing cancel failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
