import { NextResponse } from "next/server";
import {
  detectWhatsAppReceiptProvider,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppReceiptWebhookRequest,
} from "@/lib/whatsapp-receipt-provider";
import { processWhatsAppReceiptWebhook } from "@/lib/whatsapp-receipt-capture";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";

export const runtime = "nodejs";

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/whatsapp/receipts/webhook", req);
  const provider = detectWhatsAppReceiptProvider(req, null);
  const verification = verifyWhatsAppReceiptWebhookRequest({
    provider,
    req,
  });

  if (!verification.ok) {
    logger.warn("verification failed", {
      provider,
      error: verification.error,
    });
    return attachTraceId(
      NextResponse.json({ error: verification.error }, { status: verification.status }),
      logger.traceId
    );
  }

  const url = new URL(req.url);
  const challenge = url.searchParams.get("hub.challenge");

  logger.info("verification succeeded", {
    provider,
  });

  if (provider === "META_CLOUD_API" && challenge) {
    const response = new NextResponse(challenge, { status: 200 });
    response.headers.set("content-type", "text/plain; charset=utf-8");
    return attachTraceId(response, logger.traceId);
  }

  return attachTraceId(
    NextResponse.json({ ok: true, provider }, { status: 200 }),
    logger.traceId
  );
}

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/whatsapp/receipts/webhook", req);

  try {
    const rawBody = await req.text();
    const payload = safeJsonParse(rawBody);
    if (!payload) {
      return attachTraceId(
        NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
        logger.traceId
      );
    }

    const provider = detectWhatsAppReceiptProvider(req, payload);
    const verification = verifyWhatsAppReceiptWebhookRequest({
      provider,
      req,
      rawBody,
    });

    if (!verification.ok) {
      logger.warn("signature verification failed", {
        provider,
        error: verification.error,
      });
      return attachTraceId(
        NextResponse.json({ error: verification.error }, { status: verification.status }),
        logger.traceId
      );
    }

    const items = parseWhatsAppWebhookPayload({
      provider,
      payload,
    });

    const result = await processWhatsAppReceiptWebhook({
      provider,
      items,
    });

    logger.info("webhook processed", {
      provider,
      receivedCount: result.receivedCount,
      processedCount: result.processedCount,
      ignoredCount: result.ignoredCount,
      failedCount: result.failedCount,
    });

    return attachTraceId(
      NextResponse.json({
        ok: true,
        provider,
        receivedCount: result.receivedCount,
        processedCount: result.processedCount,
        ignoredCount: result.ignoredCount,
        failedCount: result.failedCount,
        results: result.results,
      }),
      logger.traceId
    );
  } catch (error) {
    logger.error("webhook processing failed", error);

    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload(
          error instanceof Error ? error.message : "WhatsApp receipt webhook failed",
          logger.traceId
        ),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}
