import { handlePaystackWebhookRequest } from "@/lib/billing-webhooks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handlePaystackWebhookRequest(req, "/api/billing/webhook");
}
