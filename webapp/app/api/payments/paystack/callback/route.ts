import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAppUrl, hasPaystackServerConfig } from "@/lib/env";
import {
  processInvoicePayment,
  resolveInvoicePaymentTargetByReference,
  validateInvoiceGatewayTransaction,
} from "@/lib/invoice-payments";
import { sendPaymentFailureAlert } from "@/lib/integrity-alerts";
import { logRouteError } from "@/lib/logger";
import { logPaymentLifecycleEvent } from "@/lib/payment-lifecycle-logs";
import { verifyPaystackTransaction } from "@/lib/paystack";

export const runtime = "nodejs";

function parsePaidAt(value: string | null | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildInvoiceRedirect(invoiceId: number, params?: Record<string, string | null | undefined>) {
  const url = new URL(`/dashboard/invoices/${invoiceId}`, getAppUrl());

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function buildFallbackRedirect(params?: Record<string, string | null | undefined>) {
  const url = new URL("/dashboard/invoices", getAppUrl());

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const reference =
    requestUrl.searchParams.get("reference")?.trim() ||
    requestUrl.searchParams.get("trxref")?.trim() ||
    "";

  if (!reference) {
    return NextResponse.redirect(
      buildFallbackRedirect({ payment: "invalid_reference" })
    );
  }

  const target = await resolveInvoicePaymentTargetByReference(reference);
  if (!target) {
    return NextResponse.redirect(buildFallbackRedirect({ payment: "not_found" }));
  }

  const redirectUrl = buildInvoiceRedirect(target.invoiceId);

  try {
    await logPaymentLifecycleEvent({
      event: "PAYMENT_CALLBACK_RECEIVED",
      invoiceId: target.invoiceId,
      reference,
      workspaceId: target.workspaceId,
      status: "RECEIVED",
      metadata: {
        source: "paystack_callback",
      },
    });

    if (!hasPaystackServerConfig()) {
      redirectUrl.searchParams.set("payment", "configuration_error");
      return NextResponse.redirect(redirectUrl);
    }

    const transaction = await verifyPaystackTransaction(reference);
    const validation = validateInvoiceGatewayTransaction({
      transaction,
      expectedReference: reference,
      expectedInvoiceId: target.invoiceId,
      expectedWorkspaceId: target.workspaceId,
    });
    if (!validation.ok) {
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: target.invoiceId,
        reference,
        workspaceId: target.workspaceId,
        status: "METADATA_MISMATCH",
        metadata: {
          source: "paystack_callback",
          transactionStatus: transaction.status,
        },
      });
      await sendPaymentFailureAlert({
        invoiceId: target.invoiceId,
        workspaceId: target.workspaceId,
        reference,
        source: "paystack_callback",
        status: "METADATA_MISMATCH",
        severity: "CRITICAL",
        summary: validation.error,
        detailLines: [
          `Verified callback transaction failed validation for invoice ${target.invoiceId}.`,
          `Gateway status: ${transaction.status}.`,
        ],
      });
      redirectUrl.searchParams.set("payment", "metadata_mismatch");
      return NextResponse.redirect(redirectUrl);
    }

    await logPaymentLifecycleEvent({
      event: "PAYMENT_VERIFIED",
      invoiceId: target.invoiceId,
      reference,
      workspaceId: target.workspaceId,
      status: transaction.status.trim().toUpperCase(),
      metadata: {
        source: "paystack_callback",
      },
    });

    if (transaction.status.trim().toLowerCase() !== "success") {
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: target.invoiceId,
        reference,
        workspaceId: target.workspaceId,
        status: transaction.status.trim().toUpperCase(),
        metadata: {
          source: "paystack_callback",
        },
      });
      redirectUrl.searchParams.set("payment", "not_successful");
      redirectUrl.searchParams.set(
        "payment_status",
        transaction.status.trim().toLowerCase()
      );
      return NextResponse.redirect(redirectUrl);
    }

    const confirmed = await processInvoicePayment({
      invoiceId: target.invoiceId,
      workspaceId: target.workspaceId,
      actorUserId: null,
      paidAt: parsePaidAt(transaction.paid_at ?? null),
      amountKobo: transaction.amount,
      currency: transaction.currency ?? null,
      provider: "PAYSTACK",
      eventId: reference,
      paymentReference: reference,
      providerTransactionId:
        transaction.id !== undefined && transaction.id !== null
          ? String(transaction.id)
          : reference,
      paymentPayload: {
        source: "paystack_callback",
        transaction,
      } as Prisma.InputJsonValue,
    });

    if ("error" in confirmed) {
      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: target.invoiceId,
        reference,
        workspaceId: target.workspaceId,
        status: confirmed.error,
        metadata: {
          source: "paystack_callback",
        },
      });
      await sendPaymentFailureAlert({
        invoiceId: target.invoiceId,
        workspaceId: target.workspaceId,
        reference,
        source: "paystack_callback",
        status: confirmed.error,
        severity:
          confirmed.error === "Payment amount does not match invoice total" ||
          confirmed.error === "Payment currency does not match invoice currency"
            ? "CRITICAL"
            : "HIGH",
        summary: confirmed.error,
      });
      const code =
        confirmed.error === "Invoice not found"
          ? "not_found"
          : confirmed.error === "Payment amount does not match invoice total"
            ? "amount_mismatch"
            : confirmed.error === "Payment currency does not match invoice currency"
              ? "currency_mismatch"
            : "processing_failed";
      redirectUrl.searchParams.set("payment", code);
      return NextResponse.redirect(redirectUrl);
    }

    redirectUrl.searchParams.set(
      "payment",
      confirmed.alreadyProcessed ? "already_processed" : "success"
    );
    redirectUrl.searchParams.set(
      "ledger",
      confirmed.ledgerEntryId ? "posted" : "pending"
    );
    redirectUrl.searchParams.set(
      "tax",
      confirmed.taxRecordId ? "synced" : "pending"
    );

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await logPaymentLifecycleEvent({
      event: "PAYMENT_FAILED",
      invoiceId: target.invoiceId,
      reference,
      workspaceId: target.workspaceId,
      status: "VERIFICATION_ERROR",
      metadata: {
        source: "paystack_callback",
      },
      error,
    });
    await sendPaymentFailureAlert({
      invoiceId: target.invoiceId,
      workspaceId: target.workspaceId,
      reference,
      source: "paystack_callback",
      status: "VERIFICATION_ERROR",
      severity: "HIGH",
      summary: "Paystack callback verification failed before the invoice could be confirmed.",
    });
    logRouteError("paystack callback verification failed", error, {
      paymentReference: reference,
      invoiceId: target.invoiceId,
    });
    redirectUrl.searchParams.set("payment", "verification_error");
    return NextResponse.redirect(redirectUrl);
  }
}
