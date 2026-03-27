import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSessionFromCookies, getWorkspaceAuth } from "@/lib/auth";
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

function buildRedirect(requestUrl: string, query: string) {
  const url = new URL("/dashboard/billing", requestUrl);
  url.search = query;
  return url;
}

function parseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const reference = url.searchParams.get("reference")?.trim();
  const stubRequested = url.searchParams.get("stub") === "1";

  if (!reference) {
    return NextResponse.redirect(buildRedirect(req.url, "?error=missing_reference"));
  }

  try {
    if (stubRequested) {
      if (!getPaymentRuntimeConfig().allowStubPayments) {
        return NextResponse.redirect(buildRedirect(req.url, "?error=stub_checkout_disabled"));
      }

      const parsedReference = parseSubscriptionCheckoutReference(reference);
      if (!parsedReference?.isStub) {
        return NextResponse.redirect(buildRedirect(req.url, "?error=invalid_stub_reference"));
      }

      const auth = await getWorkspaceAuth(parsedReference.workspaceId, session.userId);
      if (!auth) {
        return NextResponse.redirect(buildRedirect(req.url, "?error=workspace_access"));
      }

      const synced = await syncWorkspaceSubscriptionFromLocalTestReference(reference);
      if (!synced) {
        return NextResponse.redirect(buildRedirect(req.url, "?error=workspace_lookup"));
      }

      await logAudit({
        workspaceId: parsedReference.workspaceId,
        actorUserId: session.userId,
        action: "SUBSCRIPTION_LOCAL_TEST_COMPLETED",
        metadata: {
          reference,
          plan: parsedReference.plan,
          interval: parsedReference.interval,
        },
      });

      return NextResponse.redirect(buildRedirect(req.url, "?success=1"));
    }

    const transaction = await verifyPaystackTransaction(reference);
    if (String(transaction.status).toLowerCase() !== "success") {
      return NextResponse.redirect(buildRedirect(req.url, "?canceled=1"));
    }

    const metadata = parseBillingMetadata(transaction.metadata);
    let authorizedWorkspaceId = metadata.workspaceId ?? null;
    if (!authorizedWorkspaceId) {
      const currentWorkspaceSubscription = await prisma.workspaceSubscription.findFirst({
        where: {
          OR: [
            { paystackReference: reference },
            {
              paystackCustomerCode: parseString(transaction.customer?.customer_code) ?? undefined,
            },
            {
              paystackSubscriptionCode:
                parseString(transaction.subscription?.subscription_code) ?? undefined,
            },
          ],
        },
        select: { workspaceId: true },
      });
      authorizedWorkspaceId = currentWorkspaceSubscription?.workspaceId ?? null;
    }

    if (authorizedWorkspaceId) {
      const auth = await getWorkspaceAuth(authorizedWorkspaceId, session.userId);
      if (!auth) {
        return NextResponse.redirect(buildRedirect(req.url, "?error=workspace_access"));
      }
    } else {
      return NextResponse.redirect(buildRedirect(req.url, "?error=workspace_lookup"));
    }

    const synced = await syncWorkspaceSubscriptionFromPaystackTransaction(
      transaction,
      metadata.plan ?? null
    );
    if (!synced) {
      return NextResponse.redirect(buildRedirect(req.url, "?error=workspace_lookup"));
    }
    if (authorizedWorkspaceId && synced.workspaceId !== authorizedWorkspaceId) {
      return NextResponse.redirect(buildRedirect(req.url, "?error=workspace_access"));
    }

    await logAudit({
      workspaceId: synced.workspaceId,
      actorUserId: session.userId,
      action: "SUBSCRIPTION_VERIFIED",
      metadata: {
        reference,
        plan: synced.plan,
        interval: synced.billingInterval,
        status: synced.status,
      },
    });

    return NextResponse.redirect(buildRedirect(req.url, "?success=1"));
  } catch (error) {
    logRouteError("billing callback failed", error, { reference });
    return NextResponse.redirect(buildRedirect(req.url, "?error=verification_failed"));
  }
}
