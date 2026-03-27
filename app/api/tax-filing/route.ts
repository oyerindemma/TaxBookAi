import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";
import { parseClientBusinessFilter } from "@/lib/tax-engine";
import {
  getWorkspaceTaxFilingWorkspace,
  prepareTaxFilingDraft,
} from "@/lib/tax-filing";

export const runtime = "nodejs";

function parseTaxType(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "VAT" || normalized === "WHT" || normalized === "CIT") {
    return normalized;
  }
  return null;
}

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/tax-filing", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return attachTraceId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      logger.traceId
    );
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return attachTraceId(
      NextResponse.json({ error: auth.error }, { status: auth.status }),
      logger.traceId
    );
  }

  const featureAccess = await getWorkspaceFeatureAccess(
    ctx.workspaceId,
    "TAX_FILING_ASSISTANT"
  );
  if (!featureAccess.ok) {
    return attachTraceId(
      NextResponse.json(
        {
          error: featureAccess.error,
          currentPlan: featureAccess.plan,
          requiredPlan: featureAccess.requiredPlan,
        },
        { status: 402 }
      ),
      logger.traceId
    );
  }

  try {
    const url = new URL(req.url);
    const period = resolveTaxPeriodState({
      period: url.searchParams.get("period") ?? undefined,
      month: url.searchParams.get("month") ?? undefined,
      quarter: url.searchParams.get("quarter") ?? undefined,
      year: url.searchParams.get("year") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    if (period.errorMsg) {
      return attachTraceId(
        NextResponse.json({ error: period.errorMsg }, { status: 400 }),
        logger.traceId
      );
    }

    const workspace = await getWorkspaceTaxFilingWorkspace({
      workspaceId: ctx.workspaceId,
      clientBusinessId: parseClientBusinessFilter(
        url.searchParams.get("clientBusinessId") ?? undefined
      ),
      period,
    });

    return attachTraceId(NextResponse.json({ workspace }), logger.traceId);
  } catch (error) {
    logger.error("workspace load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload("Failed to load the tax filing workspace.", logger.traceId),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/tax-filing", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return attachTraceId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      logger.traceId
    );
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "MEMBER");
  if (!auth.ok) {
    return attachTraceId(
      NextResponse.json({ error: auth.error }, { status: auth.status }),
      logger.traceId
    );
  }

  try {
    const featureAccess = await getWorkspaceFeatureAccess(
      ctx.workspaceId,
      "TAX_FILING_ASSISTANT"
    );
    if (!featureAccess.ok) {
      return attachTraceId(
        NextResponse.json({ error: featureAccess.error }, { status: 402 }),
        logger.traceId
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const taxType = parseTaxType(body.taxType);
    if (!taxType) {
      return attachTraceId(
        NextResponse.json({ error: "taxType must be VAT, WHT, or CIT." }, { status: 400 }),
        logger.traceId
      );
    }

    const period = resolveTaxPeriodState({
      period: typeof body.period === "string" ? body.period : undefined,
      month: typeof body.month === "string" ? body.month : undefined,
      quarter: typeof body.quarter === "string" ? body.quarter : undefined,
      year: typeof body.year === "string" ? body.year : undefined,
      from: typeof body.from === "string" ? body.from : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
    });

    if (period.errorMsg) {
      return attachTraceId(
        NextResponse.json({ error: period.errorMsg }, { status: 400 }),
        logger.traceId
      );
    }

    const detail = await prepareTaxFilingDraft({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      taxType,
      clientBusinessId: parseClientBusinessFilter(
        typeof body.clientBusinessId === "string" ? body.clientBusinessId : undefined
      ),
      period,
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : undefined,
      portalUsernameHint:
        typeof body.portalUsernameHint === "string" ? body.portalUsernameHint : undefined,
      adapterCode: typeof body.adapterCode === "string" ? body.adapterCode : undefined,
    });

    return attachTraceId(NextResponse.json({ detail }), logger.traceId);
  } catch (error) {
    logger.error("draft prepare failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload("Failed to prepare the filing draft.", logger.traceId),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}
