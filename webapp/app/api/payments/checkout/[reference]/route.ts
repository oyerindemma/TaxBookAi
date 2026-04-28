import { NextResponse } from "next/server";
import { getAppUrl, hasPaystackServerConfig } from "@/lib/env";
import { getPublicInvoicePaymentDetail } from "@/lib/invoice-records";
import {
  prepareInvoiceCheckoutState,
  upsertInvoicePaymentRecord,
} from "@/lib/invoice-payments";
import { logRouteError } from "@/lib/logger";
import { logPaymentLifecycleEvent } from "@/lib/payment-lifecycle-logs";
import { initializePaystackTransaction } from "@/lib/paystack";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    reference?: string;
  }>;
};

export async function POST(req: Request, context: RouteContext) {
  const { reference } = await context.params;
  const identifier = reference?.trim() ?? "";

  if (!identifier) {
    return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
  }

  try {
    const invoice = await getPublicInvoicePaymentDetail(identifier);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "PAID") {
      return NextResponse.json(
        { error: "This invoice has already been paid." },
        { status: 409 }
      );
    }

    if (!invoice.paymentReference) {
      return NextResponse.json(
        { error: "This invoice is not ready for online payment yet." },
        { status: 409 }
      );
    }

    if (!invoice.client?.email) {
      return NextResponse.json(
        { error: "This invoice is missing a client email for checkout." },
        { status: 400 }
      );
    }

    if (!hasPaystackServerConfig()) {
      return NextResponse.json(
        { error: "Paystack checkout is not configured in this environment." },
        { status: 503 }
      );
    }

    const callbackUrl = `${getAppUrl()}/pay/${encodeURIComponent(invoice.paymentReference)}?provider=paystack`;
    const preparedCheckout = await prepareInvoiceCheckoutState({
      invoice: {
        id: invoice.id,
        workspaceId: invoice.workspaceId,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        paymentReference: invoice.paymentReference,
        paymentUrl: invoice.paymentUrl,
      },
      paymentPageBaseUrl: getAppUrl(),
      provider: "PAYSTACK",
      source: "public_pay_page",
      callbackUrl,
    });

    let checkout;
    try {
      checkout = await initializePaystackTransaction({
        email: invoice.client.email,
        amount: invoice.totalAmount,
        reference: preparedCheckout.paymentReference,
        callbackUrl,
        metadata: JSON.stringify({
          kind: "invoice_payment",
          currency: "NGN",
          invoiceId: invoice.id,
          workspaceId: invoice.workspaceId,
          invoiceNumber: invoice.invoiceNumber,
          paymentReference: preparedCheckout.paymentReference,
          initiatedFrom: "public_pay_page",
        }),
      });

      await upsertInvoicePaymentRecord({
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        reference: preparedCheckout.paymentReference,
        amountMinor: invoice.totalAmount,
        currency: "NGN",
        provider: "PAYSTACK",
        status: "PENDING",
        payload: {
          kind: "invoice_checkout_initialize",
          source: "public_pay_page",
          authorizationUrl: checkout.authorization_url,
          accessCode: checkout.access_code,
          callbackUrl,
        },
      });

      await logPaymentLifecycleEvent({
        event: "PAYMENT_INIT",
        invoiceId: invoice.id,
        reference: preparedCheckout.paymentReference,
        workspaceId: invoice.workspaceId,
        status: "PENDING",
        metadata: {
          source: "public_pay_page",
          provider: "PAYSTACK",
        },
      });
    } catch (error) {
      await upsertInvoicePaymentRecord({
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        reference: preparedCheckout.paymentReference,
        amountMinor: invoice.totalAmount,
        currency: "NGN",
        provider: "PAYSTACK",
        status: "FAILED",
        payload: {
          kind: "invoice_checkout_initialize_failed",
          source: "public_pay_page",
          callbackUrl,
          error: error instanceof Error ? error.message : "Unknown Paystack initialization error",
        },
      });
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: invoice.id,
        reference: preparedCheckout.paymentReference,
        workspaceId: invoice.workspaceId,
        status: "INIT_FAILED",
        metadata: {
          source: "public_pay_page",
          provider: "PAYSTACK",
        },
        error,
      });
      throw error;
    }

    return NextResponse.json({
      ok: true,
      provider: "PAYSTACK",
      url: checkout.authorization_url,
      reference: checkout.reference,
      paymentStatus: invoice.status,
      posting: {
        ledgerPosted: invoice.sync.ledgerPosted,
        taxTracked: invoice.sync.taxTracked,
      },
    });
  } catch (error) {
    logRouteError("invoice checkout initialization failed", error, {
      paymentReference: identifier,
    });
    return NextResponse.json(
      { error: "Unable to start invoice payment checkout." },
      { status: 500 }
    );
  }
}
