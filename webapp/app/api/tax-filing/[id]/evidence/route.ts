import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import { addTaxFilingEvidence } from "@/lib/tax-filing";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function normalizeEvidenceKind(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "SOURCE_DOCUMENT" ||
    normalized === "NOTE" ||
    normalized === "SUPPORT_SCHEDULE" ||
    normalized === "BANK_PROOF" ||
    normalized === "OTHER"
  ) {
    return normalized;
  }
  return undefined;
}

export async function POST(req: Request, context: RouteContext) {
  const logger = createRouteLogger("/api/tax-filing/[id]/evidence", req);
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
    const { id } = await context.params;
    const filingDraftId = Number(id);
    if (!Number.isInteger(filingDraftId) || filingDraftId <= 0) {
      return attachTraceId(
        NextResponse.json({ error: "Invalid filing draft id." }, { status: 400 }),
        logger.traceId
      );
    }

    const detail = await addTaxFilingEvidence({
      workspaceId: ctx.workspaceId,
      filingDraftId,
      actorUserId: ctx.userId,
      label: typeof body.label === "string" ? body.label : "",
      note: typeof body.note === "string" ? body.note : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      evidenceKind: normalizeEvidenceKind(body.evidenceKind),
    });

    return attachTraceId(NextResponse.json({ detail }), logger.traceId);
  } catch (error) {
    logger.error("evidence attach failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload(
          error instanceof Error ? error.message : "Failed to attach filing evidence.",
          logger.traceId
        ),
        { status: 400 }
      ),
      logger.traceId
    );
  }
}
