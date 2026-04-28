import { NextResponse } from "next/server";
import { createRouteLogger } from "@/lib/observability";
import { handlePaystackPaymentIntegrationWebhook } from "@/lib/payment-tax-integration";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/payments/integrations/paystack/webhook", req);
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  try {
    const result = await handlePaystackPaymentIntegrationWebhook({
      rawBody,
      signature,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    logger.info("paystack webhook imported", {
      processed: result.processed,
      ignored: result.ignored,
      failed: result.failed,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("paystack integration webhook failed", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
