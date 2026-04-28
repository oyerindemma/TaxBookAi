import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { hasPaystackServerConfig } from "@/lib/env";
import { getPublicInvoicePaymentDetail } from "@/lib/invoice-records";
import {
  buildInvoicePaymentPostingSnapshot,
  confirmInvoicePaymentByReference,
  validateInvoiceGatewayTransaction,
} from "@/lib/invoice-payments";
import { sendPaymentFailureAlert } from "@/lib/integrity-alerts";
import { logRouteError } from "@/lib/logger";
import { logPaymentLifecycleEvent } from "@/lib/payment-lifecycle-logs";
import { verifyPaystackTransaction } from "@/lib/paystack";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    reference?: string;
  }>;
};

function parsePaidAt(value: string | null | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function POST(req: Request, context: RouteContext) {
  const { reference } = await context.params;
  const identifier = reference?.trim() ?? "";

  if (!identifier) {
    return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
  }

  try {
    const invoice = await getPublicInvoicePaymentDetail(identifier);
    if (!invoice || !invoice.paymentReference) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!hasPaystackServerConfig()) {
      return NextResponse.json(
        { error: "Paystack verification is not configured in this environment." },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      gatewayReference?: string;
    };
    const gatewayReference = body.gatewayReference?.trim() || invoice.paymentReference;
    const transaction = await verifyPaystackTransaction(gatewayReference);
    const validation = validateInvoiceGatewayTransaction({
      transaction,
      expectedReference: invoice.paymentReference,
      expectedInvoiceId: invoice.id,
      expectedWorkspaceId: invoice.workspaceId,
    });
    if (!validation.ok) {
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: invoice.id,
        reference: invoice.paymentReference,
        workspaceId: invoice.workspaceId,
        status: "METADATA_MISMATCH",
        metadata: {
          source: "public_verify_route",
        },
      });
      await sendPaymentFailureAlert({
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        reference: invoice.paymentReference,
        source: "public_verify_route",
        status: "METADATA_MISMATCH",
        severity: "CRITICAL",
        summary: validation.error,
      });
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    await logPaymentLifecycleEvent({
      event: "PAYMENT_VERIFIED",
      invoiceId: invoice.id,
      reference: invoice.paymentReference,
      workspaceId: invoice.workspaceId,
      status: transaction.status.toUpperCase(),
      metadata: {
        source: "public_verify_route",
      },
    });

    if (transaction.status.toLowerCase() !== "success") {
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: invoice.id,
        reference: invoice.paymentReference,
        workspaceId: invoice.workspaceId,
        status: transaction.status.toUpperCase(),
        metadata: {
          source: "public_verify_route",
        },
      });
      return NextResponse.json(
        { error: `Payment is still ${transaction.status.toLowerCase()}.` },
        { status: 409 }
      );
    }

    const confirmed = await confirmInvoicePaymentByReference({
      paymentReference: invoice.paymentReference,
      provider: "paystack",
      paidAt: parsePaidAt(transaction.paid_at ?? null),
      amountKobo: transaction.amount,
      currency: transaction.currency ?? null,
      eventId: gatewayReference,
      providerTransactionId:
        transaction.id !== undefined && transaction.id !== null
          ? String(transaction.id)
          : gatewayReference,
      paymentPayload: {
        source: "public_verify_route",
        transaction,
      } as Prisma.InputJsonValue,
    });

    if ("error" in confirmed) {
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: invoice.id,
        reference: invoice.paymentReference,
        workspaceId: invoice.workspaceId,
        status: confirmed.error,
        metadata: {
          source: "public_verify_route",
        },
      });
      await sendPaymentFailureAlert({
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        reference: invoice.paymentReference,
        source: "public_verify_route",
        status: confirmed.error,
        severity:
          confirmed.error === "Payment amount does not match invoice total" ||
          confirmed.error === "Payment currency does not match invoice currency"
            ? "CRITICAL"
            : "HIGH",
        summary: confirmed.error,
      });
      const status =
        confirmed.error === "Invoice not found"
          ? 404
          : (
                confirmed.error === "Payment amount does not match invoice total" ||
                confirmed.error === "Payment currency does not match invoice currency"
              )
            ? 409
            : 500;

      return NextResponse.json({ error: confirmed.error }, { status });
    }

    const snapshot = await buildInvoicePaymentPostingSnapshot({
      invoiceId: confirmed.invoice.id,
      workspaceId: confirmed.invoice.workspaceId,
      alreadyProcessed: confirmed.alreadyProcessed,
      ledgerEntryId: confirmed.ledgerEntryId,
      taxRecordId: confirmed.taxRecordId,
    });

    const refreshedInvoice =
      snapshot?.invoice ??
      (await getPublicInvoicePaymentDetail(invoice.paymentReference)) ??
      confirmed.invoice;

    return NextResponse.json({
      ok: true,
      alreadyProcessed: confirmed.alreadyProcessed,
      invoice: refreshedInvoice,
      confirmation: snapshot?.confirmation ?? null,
    });
  } catch (error) {
    const invoice = await getPublicInvoicePaymentDetail(identifier).catch(() => null);
    await sendPaymentFailureAlert({
      invoiceId: invoice?.id ?? null,
      workspaceId: invoice?.workspaceId ?? null,
      reference: invoice?.paymentReference ?? identifier,
      source: "public_verify_route",
      status: "VERIFICATION_ERROR",
      severity: "HIGH",
      summary: "Public payment verification failed before the invoice could be confirmed.",
    });
    logRouteError("invoice payment verification failed", error, {
      paymentReference: identifier,
    });
    return NextResponse.json(
      { error: "Unable to verify invoice payment right now." },
      { status: 500 }
    );
  }
}
