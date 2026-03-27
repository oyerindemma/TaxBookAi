import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getAppUrl, hasPaystackServerConfig } from "@/lib/env";
import { getWorkspaceInvoiceDetail } from "@/lib/invoice-records";
import {
  prepareInvoiceCheckoutState,
  upsertInvoicePaymentRecord,
} from "@/lib/invoice-payments";
import { logRouteError } from "@/lib/logger";
import { logPaymentLifecycleEvent } from "@/lib/payment-lifecycle-logs";
import { initializePaystackTransaction } from "@/lib/paystack";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id?: string }>;
};

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const invoiceId = parseId(id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  try {
    const existing = await withPrismaRetry(
      () =>
        prisma.invoice.findFirst({
          where: {
            id: invoiceId,
            workspaceId: ctx.workspaceId,
          },
          select: {
            id: true,
            workspaceId: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            paymentReference: true,
            paymentUrl: true,
            client: {
              select: {
                email: true,
              },
            },
          },
        }),
      { label: "invoicePayRoute.loadInvoice" }
    );

    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (existing.status === "PAID") {
      return NextResponse.json(
        { error: "This invoice has already been paid." },
        { status: 409 }
      );
    }

    if (!existing.client?.email) {
      return NextResponse.json(
        { error: "This invoice is missing a client email for Paystack checkout." },
        { status: 400 }
      );
    }

    if (!hasPaystackServerConfig()) {
      return NextResponse.json(
        { error: "Paystack checkout is not configured in this environment." },
        { status: 503 }
      );
    }

    const callbackUrl = `${getAppUrl()}/api/payments/paystack/callback`;
    const preparedCheckout = await prepareInvoiceCheckoutState({
      invoice: existing,
      paymentPageBaseUrl: getAppUrl(),
      provider: "PAYSTACK",
      source: "dashboard_invoice_detail",
      callbackUrl,
    });

    let paymentId = preparedCheckout.paymentId;
    let checkout;
    try {
      checkout = await initializePaystackTransaction({
        email: existing.client.email,
        amount: existing.totalAmount,
        reference: preparedCheckout.paymentReference,
        callbackUrl,
        metadata: JSON.stringify({
          kind: "invoice_payment",
          currency: "NGN",
          invoiceId: existing.id,
          workspaceId: existing.workspaceId,
          invoiceNumber: existing.invoiceNumber,
          paymentReference: preparedCheckout.paymentReference,
          initiatedFrom: "dashboard_invoice_detail",
        }),
      });

      paymentId = await upsertInvoicePaymentRecord({
        invoiceId: existing.id,
        workspaceId: existing.workspaceId,
        reference: preparedCheckout.paymentReference,
        amountMinor: existing.totalAmount,
        currency: "NGN",
        provider: "PAYSTACK",
        status: "PENDING",
        payload: {
          kind: "invoice_checkout_initialize",
          authorizationUrl: checkout.authorization_url,
          accessCode: checkout.access_code,
          callbackUrl,
        },
      });

      await logPaymentLifecycleEvent({
        event: "PAYMENT_INIT",
        invoiceId: existing.id,
        reference: preparedCheckout.paymentReference,
        workspaceId: existing.workspaceId,
        status: "PENDING",
        actorUserId: ctx.userId,
        metadata: {
          source: "dashboard_invoice_detail",
          paymentId,
          provider: "PAYSTACK",
        },
      });
    } catch (error) {
      await upsertInvoicePaymentRecord({
        invoiceId: existing.id,
        workspaceId: existing.workspaceId,
        reference: preparedCheckout.paymentReference,
        amountMinor: existing.totalAmount,
        currency: "NGN",
        provider: "PAYSTACK",
        status: "FAILED",
        payload: {
          kind: "invoice_checkout_initialize_failed",
          callbackUrl,
          source: "dashboard_invoice_detail",
          error: error instanceof Error ? error.message : "Unknown Paystack initialization error",
        },
      });
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: existing.id,
        reference: preparedCheckout.paymentReference,
        workspaceId: existing.workspaceId,
        status: "INIT_FAILED",
        actorUserId: ctx.userId,
        metadata: {
          source: "dashboard_invoice_detail",
          provider: "PAYSTACK",
        },
        error,
      });
      throw error;
    }

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "INVOICE_PAYSTACK_CHECKOUT_INITIALIZED",
      metadata: {
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        paymentReference: preparedCheckout.paymentReference,
        paymentId,
        callbackUrl,
      },
    });

    const detail = await withPrismaRetry(
      () => getWorkspaceInvoiceDetail(ctx.workspaceId, existing.id),
      { label: "invoicePayRoute.loadInvoiceDetail" }
    );

    return NextResponse.json({
      ok: true,
      provider: "PAYSTACK",
      authorizationUrl: checkout.authorization_url,
      reference: checkout.reference,
      payment: {
        id: paymentId,
        status: "PENDING",
      },
      invoice: detail,
      paymentUrl: preparedCheckout.paymentUrl,
    });
  } catch (error) {
    logRouteError("invoice paystack checkout init failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      invoiceId,
    });
    return NextResponse.json(
      { error: "Unable to start Paystack checkout for this invoice." },
      { status: 500 }
    );
  }
}
