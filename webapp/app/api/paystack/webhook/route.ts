import { NextResponse } from "next/server";
import { handlePaystackWebhookRequest } from "@/lib/billing-webhooks";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    }
  );
}

export async function POST(req: Request) {
  return handlePaystackWebhookRequest(req, "/api/paystack/webhook");
}
