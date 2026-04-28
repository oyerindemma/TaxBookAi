import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getPaymentRuntimeConfig } from "@/lib/env";
import { logRouteError } from "@/lib/logger";
import { verifyPaystackTransaction } from "@/lib/paystack";
import {
  parseBillingMetadata,
  parseSubscriptionCheckoutReference,
  syncWorkspaceSubscriptionFromLocalTestReference,
  syncWorkspaceSubscriptionFromPaystackTransaction,
} from "@/lib/paystack-billing";

export const runtime = "nodejs";

function parseReferenceValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveReference(req: Request) {
  if (req.method === "GET") {
    return parseReferenceValue(new URL(req.url).searchParams.get("reference"));
  }

  try {
    const body = await req.json();
    return parseReferenceValue(body?.reference);
  } catch {
    return null;
  }
}

async function handleVerification(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "OWNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const reference = await resolveReference(req);
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  try {
    const parsedReference = parseSubscriptionCheckoutReference(reference);
    if (parsedReference?.isStub) {
      if (!getPaymentRuntimeConfig().allowStubPayments) {
        return NextResponse.json(
          { error: "Local billing test mode is disabled" },
          { status: 400 }
        );
      }
      if (parsedReference.workspaceId !== ctx.workspaceId) {
        return NextResponse.json({ error: "Reference does not belong to this workspace" }, { status: 403 });
      }

      const synced = await syncWorkspaceSubscriptionFromLocalTestReference(reference);
      if (!synced) {
        return NextResponse.json({ error: "Unable to resolve local test reference" }, { status: 404 });
      }

      await logAudit({
        workspaceId: synced.workspaceId,
        actorUserId: ctx.userId,
        action: "SUBSCRIPTION_LOCAL_TEST_VERIFIED",
        metadata: {
          reference,
          plan: synced.plan,
          interval: synced.billingInterval,
          status: synced.status,
        },
      });

      return NextResponse.json({ ok: true, stubbed: true, subscription: synced });
    }

    const transaction = await verifyPaystackTransaction(reference);
    const metadata = parseBillingMetadata(transaction.metadata);

    if (metadata.workspaceId && metadata.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Reference does not belong to this workspace" }, { status: 403 });
    }

    if (!metadata.workspaceId) {
      const currentWorkspaceSubscription = await prisma.workspaceSubscription.findUnique({
        where: { workspaceId: ctx.workspaceId },
      });
      const customerCode = parseReferenceValue(transaction.customer?.customer_code);
      const subscriptionCode = parseReferenceValue(transaction.subscription?.subscription_code);
      const matchesCurrentWorkspace =
        currentWorkspaceSubscription &&
        (currentWorkspaceSubscription.paystackReference === reference ||
          (customerCode &&
            currentWorkspaceSubscription.paystackCustomerCode === customerCode) ||
          (subscriptionCode &&
            currentWorkspaceSubscription.paystackSubscriptionCode === subscriptionCode));

      if (!matchesCurrentWorkspace) {
        return NextResponse.json({ error: "Reference does not belong to this workspace" }, { status: 403 });
      }
    }

    const synced = await syncWorkspaceSubscriptionFromPaystackTransaction(
      transaction,
      metadata.plan ?? null
    );
    if (!synced) {
      return NextResponse.json({ error: "Unable to resolve workspace subscription" }, { status: 404 });
    }
    if (synced.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Reference does not belong to this workspace" }, { status: 403 });
    }

    await logAudit({
      workspaceId: synced.workspaceId,
      actorUserId: ctx.userId,
      action: "SUBSCRIPTION_VERIFIED",
      metadata: {
        reference,
        transactionStatus: transaction.status,
        plan: synced.plan,
        interval: synced.billingInterval,
        status: synced.status,
      },
    });

    return NextResponse.json({
      ok: true,
      transactionStatus: transaction.status,
      subscription: synced,
    });
  } catch (error) {
    logRouteError("billing verify failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      reference,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify billing reference" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handleVerification(req);
}

export async function POST(req: Request) {
  return handleVerification(req);
}
