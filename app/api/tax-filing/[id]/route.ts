import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import { getTaxFilingDetail, updateTaxFilingDraft } from "@/lib/tax-filing";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ADMIN_ACTIONS = new Set([
  "APPROVE_FOR_SUBMISSION",
  "MARK_SUBMISSION_PENDING",
  "MARK_SUBMITTED_MANUALLY",
  "MARK_SUBMITTED",
  "MARK_FAILED",
  "CANCEL",
]);

function normalizeAction(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "PREPARE_DRAFT" ||
    normalized === "SAVE_METADATA" ||
    normalized === "APPROVE_FOR_SUBMISSION" ||
    normalized === "MARK_SUBMISSION_PENDING" ||
    normalized === "MARK_SUBMITTED_MANUALLY" ||
    normalized === "MARK_SUBMITTED" ||
    normalized === "MARK_FAILED" ||
    normalized === "CANCEL" ||
    normalized === "REOPEN_REVIEW"
  ) {
    return normalized;
  }
  return null;
}

export async function GET(req: Request, context: RouteContext) {
  const logger = createRouteLogger("/api/tax-filing/[id]", req);
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
      NextResponse.json({ error: featureAccess.error }, { status: 402 }),
      logger.traceId
    );
  }

  try {
    const { id } = await context.params;
    const filingDraftId = Number(id);
    if (!Number.isInteger(filingDraftId) || filingDraftId <= 0) {
      return attachTraceId(
        NextResponse.json({ error: "Invalid filing draft id." }, { status: 400 }),
        logger.traceId
      );
    }

    const detail = await getTaxFilingDetail({
      workspaceId: ctx.workspaceId,
      filingDraftId,
    });

    if (!detail) {
      return attachTraceId(
        NextResponse.json({ error: "Filing draft not found." }, { status: 404 }),
        logger.traceId
      );
    }

    return attachTraceId(NextResponse.json({ detail }), logger.traceId);
  } catch (error) {
    logger.error("detail load failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload("Failed to load the filing draft.", logger.traceId),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const logger = createRouteLogger("/api/tax-filing/[id]", req);
  const ctx = await getAuthContext();
  if (!ctx) {
    return attachTraceId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      logger.traceId
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = normalizeAction(body.action);
    if (!action) {
      return attachTraceId(
        NextResponse.json({ error: "Unsupported filing action." }, { status: 400 }),
        logger.traceId
      );
    }

    const auth = await requireRoleAtLeast(
      ctx.workspaceId,
      ADMIN_ACTIONS.has(action) ? "ADMIN" : "MEMBER"
    );
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
        NextResponse.json({ error: featureAccess.error }, { status: 402 }),
        logger.traceId
      );
    }

    const { id } = await context.params;
    const filingDraftId = Number(id);
    if (!Number.isInteger(filingDraftId) || filingDraftId <= 0) {
      return attachTraceId(
        NextResponse.json({ error: "Invalid filing draft id." }, { status: 400 }),
        logger.traceId
      );
    }

    const detail = await updateTaxFilingDraft({
      workspaceId: ctx.workspaceId,
      filingDraftId,
      actorUserId: ctx.userId,
      action,
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : undefined,
      portalUsernameHint:
        typeof body.portalUsernameHint === "string" ? body.portalUsernameHint : undefined,
      adapterCode: typeof body.adapterCode === "string" ? body.adapterCode : undefined,
      submissionReference:
        typeof body.submissionReference === "string" ? body.submissionReference : undefined,
    });

    return attachTraceId(NextResponse.json({ detail }), logger.traceId);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "FilingCheckError"
        ? error.message
        : "Failed to update the filing draft.";
    const status = error instanceof Error && error.name === "FilingCheckError" ? 409 : 500;

    logger.error("detail update failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return attachTraceId(
      NextResponse.json(buildTraceErrorPayload(message, logger.traceId), { status }),
      logger.traceId
    );
  }
}
