import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type {
  PaystackSubscriptionPayload,
  PaystackTransactionVerificationData,
} from "@/lib/paystack";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
  hashForLogs,
} from "@/lib/observability";
import { verifyPaystackSignature } from "@/lib/paystack";
import {
  markWorkspaceSubscriptionStatusFromPaystackEvent,
  parseBillingMetadata,
  syncWorkspaceSubscriptionFromPaystackSubscription,
  syncWorkspaceSubscriptionFromPaystackTransaction,
} from "@/lib/paystack-billing";
import { prisma } from "@/lib/prisma";

const WEBHOOK_PROCESSING_STALE_MS = 5 * 60 * 1000;

function parseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashPayload(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractEventIdentifiers(data: unknown) {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const nestedSubscription =
    record.subscription && typeof record.subscription === "object"
      ? (record.subscription as Record<string, unknown>)
      : null;
  const nestedCustomer =
    record.customer && typeof record.customer === "object"
      ? (record.customer as Record<string, unknown>)
      : null;

  const metadata = parseBillingMetadata(record.metadata ?? nestedSubscription?.metadata);

  return {
    workspaceId: metadata.workspaceId ?? null,
    reference: parseString(record.reference),
    subscriptionCode:
      parseString(record.subscription_code) ??
      parseString(nestedSubscription?.subscription_code),
    customerCode:
      parseString(record.customer_code) ?? parseString(nestedCustomer?.customer_code),
  };
}

function buildEventKey(eventType: string, payloadHash: string) {
  return `paystack:${eventType}:${payloadHash}`;
}

function buildErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown billing webhook error";
}

type PaystackWebhookEvent = {
  event?: unknown;
  data?: unknown;
};

type ParsedPaystackWebhookPayload =
  | {
      ok: true;
      eventType: string;
      data: unknown;
    }
  | {
      ok: false;
      reason: "invalid_json" | "missing_event_type";
    };

function parsePaystackWebhookPayload(rawBody: string): ParsedPaystackWebhookPayload {
  let event: PaystackWebhookEvent;

  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
    };
  }

  const eventType = parseString(event.event)?.toLowerCase();
  if (!eventType) {
    return {
      ok: false,
      reason: "missing_event_type",
    };
  }

  return {
    ok: true,
    eventType,
    data: event.data,
  };
}

function requireResolvedWorkspaceSubscription<T extends { workspaceId: number } | null>(
  value: T,
  eventType: string
): Exclude<T, null> {
  if (!value) {
    throw new Error(`Unable to resolve workspace subscription for ${eventType}`);
  }

  return value as Exclude<T, null>;
}

async function beginPaystackWebhookEvent(input: {
  eventType: string;
  rawBody: string;
  data: unknown;
}) {
  const payloadHash = hashPayload(input.rawBody);
  const identifiers = extractEventIdentifiers(input.data);
  const eventKey = buildEventKey(input.eventType, payloadHash);
  const baseData = {
    provider: "PAYSTACK",
    workspaceId: identifiers.workspaceId ?? undefined,
    eventType: input.eventType,
    eventKey,
    payloadHash,
    reference: identifiers.reference ?? undefined,
    subscriptionCode: identifiers.subscriptionCode ?? undefined,
    customerCode: identifiers.customerCode ?? undefined,
    status: "PROCESSING",
    payload: input.rawBody,
    lastError: null,
    processedAt: null,
  } satisfies Prisma.BillingWebhookEventUncheckedCreateInput;

  try {
    const event = await prisma.billingWebhookEvent.create({
      data: baseData,
    });

    return {
      event,
      duplicate: false,
      shouldSkip: false,
      reason: null as "processed" | "in_flight" | null,
    };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    const existing = await prisma.billingWebhookEvent.findUnique({
      where: { eventKey },
    });

    if (!existing) {
      throw error;
    }

    if (existing.status === "PROCESSED") {
      return {
        event: existing,
        duplicate: true,
        shouldSkip: true,
        reason: "processed" as const,
      };
    }

    const isFreshProcessingAttempt =
      existing.status === "PROCESSING" &&
      Date.now() - existing.updatedAt.getTime() < WEBHOOK_PROCESSING_STALE_MS;

    if (isFreshProcessingAttempt) {
      return {
        event: existing,
        duplicate: true,
        shouldSkip: true,
        reason: "in_flight" as const,
      };
    }

    const event = await prisma.billingWebhookEvent.update({
      where: { eventKey },
      data: {
        workspaceId: existing.workspaceId ?? identifiers.workspaceId ?? undefined,
        reference: existing.reference ?? identifiers.reference ?? undefined,
        subscriptionCode: existing.subscriptionCode ?? identifiers.subscriptionCode ?? undefined,
        customerCode: existing.customerCode ?? identifiers.customerCode ?? undefined,
        status: "PROCESSING",
        payload: input.rawBody,
        lastError: null,
        processedAt: null,
      },
    });

    return {
      event,
      duplicate: true,
      shouldSkip: false,
      reason: null as "processed" | "in_flight" | null,
    };
  }
}

async function markBillingWebhookEventProcessed(
  eventId: number,
  workspaceId?: number | null
) {
  return prisma.billingWebhookEvent.update({
    where: { id: eventId },
    data: {
      workspaceId: workspaceId ?? undefined,
      status: "PROCESSED",
      processedAt: new Date(),
      lastError: null,
    },
  });
}

async function markBillingWebhookEventFailed(
  eventId: number,
  error: unknown,
  workspaceId?: number | null
) {
  return prisma.billingWebhookEvent.update({
    where: { id: eventId },
    data: {
      workspaceId: workspaceId ?? undefined,
      status: "FAILED",
      lastError: buildErrorMessage(error),
    },
  });
}

export async function handlePaystackWebhookRequest(
  req: Request,
  routeName = "/api/paystack/webhook"
): Promise<Response> {
  const logger = createRouteLogger(routeName, req);
  const signature = req.headers.get("x-paystack-signature");
  const rawBody = await req.text();
  const payloadHash = hashForLogs(rawBody);

  if (!signature?.trim()) {
    logger.warn("signature missing", {
      payloadHash,
      bodyLength: rawBody.length,
    });
    return attachTraceId(
      NextResponse.json(buildTraceErrorPayload("Missing signature", logger.traceId), {
        status: 401,
      }),
      logger.traceId
    );
  }

  if (!verifyPaystackSignature(rawBody, signature)) {
    logger.warn("signature verification failed", {
      payloadHash,
      bodyLength: rawBody.length,
    });
    return attachTraceId(
      NextResponse.json(buildTraceErrorPayload("Invalid signature", logger.traceId), {
        status: 401,
      }),
      logger.traceId
    );
  }

  const parsedPayload = parsePaystackWebhookPayload(rawBody);
  if (!parsedPayload.ok) {
    logger.warn("invalid webhook payload", {
      payloadHash,
      bodyLength: rawBody.length,
      reason: parsedPayload.reason,
    });
    return attachTraceId(
      NextResponse.json(buildTraceErrorPayload("Invalid payload", logger.traceId), {
        status: 400,
      }),
      logger.traceId
    );
  }

  const identifiers = extractEventIdentifiers(parsedPayload.data);

  logger.info("webhook received", {
    eventType: parsedPayload.eventType,
    payloadHash,
    bodyLength: rawBody.length,
    workspaceId: identifiers.workspaceId,
    reference: identifiers.reference,
    subscriptionCode: identifiers.subscriptionCode,
    customerCode: identifiers.customerCode,
  });

  let webhookEvent: Awaited<ReturnType<typeof beginPaystackWebhookEvent>>;

  try {
    webhookEvent = await beginPaystackWebhookEvent({
      eventType: parsedPayload.eventType,
      rawBody,
      data: parsedPayload.data,
    });
  } catch (error) {
    logger.error("failed to persist webhook delivery", error, {
      eventType: parsedPayload.eventType,
      payloadHash,
      workspaceId: identifiers.workspaceId,
      reference: identifiers.reference,
      subscriptionCode: identifiers.subscriptionCode,
      customerCode: identifiers.customerCode,
    });
    return attachTraceId(
      NextResponse.json(buildTraceErrorPayload("Webhook handler failed", logger.traceId), {
        status: 500,
      }),
      logger.traceId
    );
  }

  if (webhookEvent.shouldSkip) {
    logger.info("duplicate delivery skipped", {
      eventType: parsedPayload.eventType,
      webhookEventId: webhookEvent.event.id,
      reason: webhookEvent.reason,
      workspaceId: webhookEvent.event.workspaceId,
      reference: webhookEvent.event.reference,
      subscriptionCode: webhookEvent.event.subscriptionCode,
      customerCode: webhookEvent.event.customerCode,
    });
    return attachTraceId(
      NextResponse.json({
        received: true,
        duplicate: true,
        eventType: parsedPayload.eventType,
        reason: webhookEvent.reason,
      }),
      logger.traceId
    );
  }

  let resolvedWorkspaceId = webhookEvent.event.workspaceId ?? identifiers.workspaceId ?? null;
  let outcome = "ignored";

  try {
    switch (parsedPayload.eventType) {
      case "charge.success": {
        const transaction = parsedPayload.data as PaystackTransactionVerificationData;
        const synced = requireResolvedWorkspaceSubscription(
          await syncWorkspaceSubscriptionFromPaystackTransaction(
            transaction,
            parseBillingMetadata(transaction.metadata).plan ?? null
          ),
          parsedPayload.eventType
        );
        resolvedWorkspaceId = synced.workspaceId;
        outcome = "subscription_synced";
        break;
      }
      case "subscription.create":
      case "subscription.enable":
      case "subscription.not_renew":
      case "subscription.disable": {
        const statusHintByEventType = {
          "subscription.create": "active",
          "subscription.enable": "active",
          "subscription.not_renew": "non_renewing",
          "subscription.disable": "disabled",
        } as const;

        const synced = requireResolvedWorkspaceSubscription(
          await syncWorkspaceSubscriptionFromPaystackSubscription(
            parsedPayload.data as PaystackSubscriptionPayload,
            {
              statusHint: statusHintByEventType[parsedPayload.eventType],
            }
          ),
          parsedPayload.eventType
        );
        resolvedWorkspaceId = synced.workspaceId;
        outcome = "subscription_synced";
        break;
      }
      case "invoice.payment_failed":
      case "charge.failed": {
        const synced = requireResolvedWorkspaceSubscription(
          await markWorkspaceSubscriptionStatusFromPaystackEvent(
            parsedPayload.data,
            "payment_failed"
          ),
          parsedPayload.eventType
        );
        resolvedWorkspaceId = synced.workspaceId;
        outcome = "subscription_status_updated";
        break;
      }
      default:
        logger.info("event type ignored", {
          eventType: parsedPayload.eventType,
          webhookEventId: webhookEvent.event.id,
          workspaceId: resolvedWorkspaceId,
        });
        break;
    }

    await markBillingWebhookEventProcessed(
      webhookEvent.event.id,
      resolvedWorkspaceId ?? undefined
    );
    logger.info("webhook processed", {
      eventType: parsedPayload.eventType,
      webhookEventId: webhookEvent.event.id,
      workspaceId: resolvedWorkspaceId,
      duplicate: webhookEvent.duplicate,
      outcome,
      reference: identifiers.reference,
      subscriptionCode: identifiers.subscriptionCode,
      customerCode: identifiers.customerCode,
    });
  } catch (error) {
    try {
      await markBillingWebhookEventFailed(
        webhookEvent.event.id,
        error,
        resolvedWorkspaceId ?? undefined
      );
    } catch (persistError) {
      logger.error("failed to persist webhook failure state", persistError, {
        eventType: parsedPayload.eventType,
        webhookEventId: webhookEvent.event.id,
        workspaceId: resolvedWorkspaceId,
      });
    }

    logger.error("event handling failed", error, {
      eventType: parsedPayload.eventType,
      webhookEventId: webhookEvent.event.id,
      workspaceId: resolvedWorkspaceId,
      reference: identifiers.reference,
      subscriptionCode: identifiers.subscriptionCode,
      customerCode: identifiers.customerCode,
    });
    return attachTraceId(
      NextResponse.json(buildTraceErrorPayload("Webhook handler failed", logger.traceId), {
        status: 500,
      }),
      logger.traceId
    );
  }

  return attachTraceId(
    NextResponse.json({
      received: true,
      eventType: parsedPayload.eventType,
      outcome,
    }),
    logger.traceId
  );
}
