import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  buildInvoicePaymentPostingSnapshot,
  processInvoicePayment,
  resolveInvoicePaymentTargetByReference,
  validateInvoiceGatewayTransaction,
} from "@/lib/invoice-payments";
import {
  sendPaymentFailureAlert,
  sendWebhookVerificationFailureAlert,
} from "@/lib/integrity-alerts";
import { logRouteError } from "@/lib/logger";
import { logPaymentLifecycleEvent } from "@/lib/payment-lifecycle-logs";
import { recordPaystackWebhookActivity } from "@/lib/payment-tax-integration";
import { verifyPaystackSignature } from "@/lib/paystack";

export const runtime = "nodejs";

type PaystackInvoiceWebhookBody = {
  event?: unknown;
  data?: {
    id?: unknown;
    status?: unknown;
    reference?: unknown;
    amount?: unknown;
    currency?: unknown;
    paid_at?: unknown;
    metadata?: unknown;
  };
};

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePaidAt(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function extractWebhookReference(rawBody: string) {
  try {
    const body = JSON.parse(rawBody || "{}") as PaystackInvoiceWebhookBody;
    const reference = body.data?.reference;
    return typeof reference === "string" && reference.trim() ? reference.trim() : null;
  } catch {
    return null;
  }
}

async function buildWebhookSuccessResponse(input: {
  invoiceId: number;
  workspaceId: number;
  alreadyProcessed: boolean;
  ledgerEntryId?: number | null;
  taxRecordId?: number | null;
}) {
  const snapshot = await buildInvoicePaymentPostingSnapshot({
    invoiceId: input.invoiceId,
    workspaceId: input.workspaceId,
    alreadyProcessed: input.alreadyProcessed,
    ledgerEntryId: input.ledgerEntryId,
    taxRecordId: input.taxRecordId,
  });

  return {
    received: true,
    invoiceId: input.invoiceId,
    status: snapshot?.invoice.status ?? "PAID",
    alreadyProcessed: input.alreadyProcessed,
    confirmation: snapshot?.confirmation ?? null,
  };
}

async function processReferencePayment(input: {
  reference: string;
  provider: string;
  paidAt: Date;
  amountKobo?: number | null;
  currency?: string | null;
  eventId?: string | null;
  paymentPayload?: Prisma.InputJsonValue | null;
  providerTransactionId?: string | null;
}) {
  const target = await resolveInvoicePaymentTargetByReference(input.reference);
  if (!target) {
    return { error: "Invoice not found" } as const;
  }

  return processInvoicePayment({
    invoiceId: target.invoiceId,
    workspaceId: target.workspaceId,
    actorUserId: null,
    paidAt: input.paidAt,
    amountKobo: input.amountKobo,
    currency: input.currency ?? null,
    provider: input.provider,
    eventId: input.eventId ?? null,
    paymentReference: input.reference,
    paymentPayload: input.paymentPayload ?? null,
    providerTransactionId: input.providerTransactionId ?? null,
  });
}

async function handlePaystackWebhook(rawBody: string, signature: string) {
  if (!verifyPaystackSignature(rawBody, signature)) {
    const reference = extractWebhookReference(rawBody);
    const target = reference
      ? await resolveInvoicePaymentTargetByReference(reference)
      : null;

    try {
      await sendWebhookVerificationFailureAlert({
        reference,
        workspaceId: target?.workspaceId ?? null,
        invoiceId: target?.invoiceId ?? null,
        reason: "INVALID_SIGNATURE",
      });
    } catch (error) {
      logRouteError("payments webhook invalid-signature alert failed", error, {
        reference,
        workspaceId: target?.workspaceId ?? null,
        invoiceId: target?.invoiceId ?? null,
      });
    }

    await logPaymentLifecycleEvent({
      event: "PAYMENT_FAILED",
      invoiceId: null,
      reference,
      workspaceId: null,
      status: "INVALID_SIGNATURE",
      metadata: {
        source: "paystack_webhook",
        provider: "PAYSTACK",
      },
    });
    return NextResponse.json({ error: "Invalid Paystack signature" }, { status: 401 });
  }

  let body: PaystackInvoiceWebhookBody;
  try {
    body = JSON.parse(rawBody || "{}") as PaystackInvoiceWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  const eventType = String(body.event ?? "").trim().toLowerCase();
  if (eventType !== "charge.success") {
    return NextResponse.json(
      {
        received: true,
        provider: "PAYSTACK",
        ignored: true,
        reason: "unsupported_event",
      },
      { status: 202 }
    );
  }

  const transaction = body.data;
  const reference = String(transaction?.reference ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "Missing Paystack transaction reference" }, { status: 400 });
  }

  if (String(transaction?.status ?? "").trim().toLowerCase() !== "success") {
    return NextResponse.json(
      {
        received: true,
        provider: "PAYSTACK",
        ignored: true,
        reason: "transaction_not_successful",
      },
      { status: 202 }
    );
  }

  const amountKobo = parseNumber(transaction?.amount);
  if (amountKobo === null) {
    return NextResponse.json({ error: "Invalid Paystack amount" }, { status: 400 });
  }

  const target = await resolveInvoicePaymentTargetByReference(reference);
  if (!target) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  await logPaymentLifecycleEvent({
    event: "PAYMENT_WEBHOOK_RECEIVED",
    invoiceId: target.invoiceId,
    reference,
    workspaceId: target.workspaceId,
    status: "RECEIVED",
    metadata: {
      source: "paystack_webhook",
      provider: "PAYSTACK",
    },
  });

  const validation = validateInvoiceGatewayTransaction({
    transaction: {
      reference,
      amount: amountKobo,
      currency: transaction?.currency,
      metadata: transaction?.metadata,
    },
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
        source: "paystack_webhook",
      },
    });
    await sendPaymentFailureAlert({
      invoiceId: target.invoiceId,
      workspaceId: target.workspaceId,
      reference,
      source: "paystack_webhook",
      status: "METADATA_MISMATCH",
      severity: "CRITICAL",
      summary: validation.error,
    });
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  await logPaymentLifecycleEvent({
    event: "PAYMENT_VERIFIED",
    invoiceId: target.invoiceId,
    reference,
    workspaceId: target.workspaceId,
    status: String(transaction?.status ?? "success").trim().toUpperCase(),
    metadata: {
      source: "paystack_webhook",
      provider: "PAYSTACK",
    },
  });

  const confirmed = await processReferencePayment({
    reference,
    provider: "paystack",
    paidAt: parsePaidAt(transaction?.paid_at),
    amountKobo,
    currency:
      typeof transaction?.currency === "string" ? transaction.currency : null,
    eventId:
      transaction?.id !== undefined && transaction?.id !== null
        ? String(transaction.id)
        : reference,
    providerTransactionId:
      transaction?.id !== undefined && transaction?.id !== null
        ? String(transaction.id)
        : reference,
    paymentPayload: body as Prisma.InputJsonValue,
  });

  if ("error" in confirmed) {
    await logPaymentLifecycleEvent({
      event: "PAYMENT_FAILED",
      invoiceId: target.invoiceId,
      reference,
      workspaceId: target.workspaceId,
      status: confirmed.error,
      metadata: {
        source: "paystack_webhook",
        provider: "PAYSTACK",
      },
    });
    await sendPaymentFailureAlert({
      invoiceId: target.invoiceId,
      workspaceId: target.workspaceId,
      reference,
      source: "paystack_webhook",
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

  const payload = await buildWebhookSuccessResponse({
    invoiceId: confirmed.invoice.id,
    workspaceId: confirmed.invoice.workspaceId,
    alreadyProcessed: confirmed.alreadyProcessed,
    ledgerEntryId: confirmed.ledgerEntryId,
    taxRecordId: confirmed.taxRecordId,
  });

  try {
    await recordPaystackWebhookActivity({
      rawBody,
      preferredWorkspaceId: confirmed.invoice.workspaceId,
      preferredInvoiceId: confirmed.invoice.id,
      preferredPaymentId: confirmed.paymentId,
      autoConfirmInvoicePayment: false,
    });
  } catch (error) {
    logRouteError("payments webhook activity import failed", error, {
      reference,
      workspaceId: confirmed.invoice.workspaceId,
      invoiceId: confirmed.invoice.id,
    });
  }

  return NextResponse.json({
    ...payload,
    provider: "PAYSTACK",
  });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const paystackSignature = req.headers.get("x-paystack-signature");

  try {
    if (!paystackSignature) {
      const reference = extractWebhookReference(rawBody);
      const target = reference
        ? await resolveInvoicePaymentTargetByReference(reference)
        : null;

      try {
        await sendWebhookVerificationFailureAlert({
          reference,
          workspaceId: target?.workspaceId ?? null,
          invoiceId: target?.invoiceId ?? null,
          reason: "MISSING_SIGNATURE",
        });
      } catch (error) {
        logRouteError("payments webhook missing-signature alert failed", error, {
          reference,
          workspaceId: target?.workspaceId ?? null,
          invoiceId: target?.invoiceId ?? null,
        });
      }

      await logPaymentLifecycleEvent({
        event: "PAYMENT_FAILED",
        invoiceId: null,
        reference,
        workspaceId: null,
        status: "MISSING_SIGNATURE",
        metadata: {
          source: "paystack_webhook",
          provider: "PAYSTACK",
        },
      });
      return NextResponse.json(
        { error: "Missing Paystack signature" },
        { status: 401 }
      );
    }

    return await handlePaystackWebhook(rawBody, paystackSignature);
  } catch (error) {
    logRouteError("payments webhook failed", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
