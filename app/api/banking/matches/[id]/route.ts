import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { logAudit } from "@/lib/audit";
import { logRouteError } from "@/lib/logger";
import { approveReconciliationMatch } from "@/lib/banking";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "BANKING");
  if (!featureAccess.ok) {
    return NextResponse.json(
      {
        error: featureAccess.error,
        currentPlan: featureAccess.plan,
        requiredPlan: featureAccess.requiredPlan,
      },
      { status: 402 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "approve";
    const params = await context.params;
    const matchId = Number(params.id);

    if (!Number.isFinite(matchId) || !Number.isInteger(matchId) || matchId <= 0) {
      return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
    }

    if (action !== "approve") {
      return NextResponse.json(
        { error: "Only approve is supported on this endpoint" },
        { status: 400 }
      );
    }

    const match = await approveReconciliationMatch({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      matchId,
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "BANK_RECONCILIATION_MATCH_APPROVED",
      metadata: {
        matchId,
      },
    });

    return NextResponse.json({
      match: match?.id
        ? {
            id: match.id,
            status: match.status,
            bankTransactionId: match.bankTransactionId,
          }
        : null,
      transaction: match?.bankTransaction ?? null,
    });
  } catch (error) {
    logRouteError("bank reconciliation match approval failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to approve match",
      },
      { status: 500 }
    );
  }
}
