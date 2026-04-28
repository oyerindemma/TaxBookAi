import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import {
  getWorkspaceTaxEngineOverview,
  parseClientBusinessFilter,
  parseReviewedFilter,
  parseTaxTypeFilter,
} from "@/lib/tax-engine";
import { resolveTaxPeriodState } from "@/lib/tax-compliance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const logger = createRouteLogger("/api/tax-engine", req);
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

    const clientBusinessId = parseClientBusinessFilter(
      url.searchParams.get("clientBusinessId") ?? undefined
    );
    const reviewed = parseReviewedFilter(url.searchParams.get("reviewed") ?? undefined);
    const taxType = parseTaxTypeFilter(url.searchParams.get("taxType") ?? undefined);
    const overview = await getWorkspaceTaxEngineOverview({
      workspaceId: ctx.workspaceId,
      clientBusinessId,
      reviewed,
      taxType,
      period,
    });

    logger.info("overview generated", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      clientBusinessId,
      reviewed,
      taxType,
      periodLabel: period.label,
      periodMode: period.mode,
      exceptionCount: overview.exceptions.length,
      filingDraftCount: overview.filings.length,
    });

    return attachTraceId(NextResponse.json({ overview }), logger.traceId);
  } catch (error) {
    logger.error("overview failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload("Server error loading tax engine overview", logger.traceId),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}
