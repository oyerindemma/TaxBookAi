import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import { getCitWorkflowDetail, updateCitWorkflowPeriod } from "@/lib/cit-workflow";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ADMIN_ACTIONS = new Set(["MARK_APPROVED_FOR_EXPORT"]);

function parseId(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseAction(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (
    normalized === "SAVE_NOTES" ||
    normalized === "MARK_IN_REVIEW" ||
    normalized === "MARK_READY" ||
    normalized === "MARK_BLOCKED" ||
    normalized === "MARK_APPROVED_FOR_EXPORT"
  ) {
    return normalized;
  }

  return null;
}

export async function GET(_req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureAccess = await getWorkspaceFeatureAccess(
    ctx.workspaceId,
    "TAX_FILING_ASSISTANT"
  );
  if (!featureAccess.ok) {
    return NextResponse.json({ error: featureAccess.error }, { status: 402 });
  }

  try {
    const { id } = await context.params;
    const citPeriodId = parseId(id);
    if (!citPeriodId) {
      return NextResponse.json({ error: "Invalid CIT period id." }, { status: 400 });
    }

    const detail = await getCitWorkflowDetail({
      workspaceId: ctx.workspaceId,
      citPeriodId,
    });

    if (!detail) {
      return NextResponse.json({ error: "CIT period not found." }, { status: 404 });
    }

    return NextResponse.json({ detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logRouteError("cit workflow detail load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json({ error: "Failed to load the CIT period." }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = parseAction(body.action);
    if (!action) {
      return NextResponse.json({ error: "Unsupported CIT action." }, { status: 400 });
    }

    const auth = await requireRoleAtLeast(
      ctx.workspaceId,
      ADMIN_ACTIONS.has(action) ? "ADMIN" : "MEMBER"
    );
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const featureAccess = await getWorkspaceFeatureAccess(
      ctx.workspaceId,
      "TAX_FILING_ASSISTANT"
    );
    if (!featureAccess.ok) {
      return NextResponse.json({ error: featureAccess.error }, { status: 402 });
    }

    const { id } = await context.params;
    const citPeriodId = parseId(id);
    if (!citPeriodId) {
      return NextResponse.json({ error: "Invalid CIT period id." }, { status: 400 });
    }

    const detail = await updateCitWorkflowPeriod({
      workspaceId: ctx.workspaceId,
      citPeriodId,
      actorUserId: ctx.userId,
      action,
      note: typeof body.note === "string" ? body.note : undefined,
      evidenceNote: typeof body.evidenceNote === "string" ? body.evidenceNote : undefined,
    });

    return NextResponse.json({ detail });
  } catch (error) {
    logRouteError("cit workflow period update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update the CIT period." },
      { status: 400 }
    );
  }
}
