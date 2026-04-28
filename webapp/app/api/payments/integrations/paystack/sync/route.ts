import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { createRouteLogger } from "@/lib/observability";
import { syncWorkspacePaystackIntegration } from "@/lib/payment-tax-integration";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/payments/integrations/paystack/sync", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as {
      days?: number | string;
    };
    const parsedDays =
      typeof body.days === "number"
        ? body.days
        : typeof body.days === "string" && body.days.trim()
          ? Number(body.days)
          : null;

    const result = await syncWorkspacePaystackIntegration({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      days: Number.isFinite(parsedDays) ? parsedDays : null,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info("paystack sync completed", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      importedEventCount: result.importedEventCount,
      importedSettlementCount: result.importedSettlementCount,
      failedEventCount: result.failedEventCount,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("paystack sync failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      { error: "Failed to sync Paystack payment activity" },
      { status: 500 }
    );
  }
}
