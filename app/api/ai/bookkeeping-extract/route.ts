import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { enforceAiScanLimit, getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  ingestBookkeepingDocument,
  validateBookkeepingDocument,
} from "@/lib/bookkeeping-ingestion";
import { hasOpenAiServerConfig } from "@/lib/env";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";

export const runtime = "nodejs";

const BAD_REQUEST_ERRORS = new Set<string>([
  "Unsupported file type. Upload JPG, PNG, WEBP, HEIC, HEIF, or PDF receipts and invoices.",
  "PDF must be 15MB or smaller",
  "Image must be 8MB or smaller",
]);

export async function POST(req: Request) {
  const logger = createRouteLogger("/api/ai/bookkeeping-extract", req);
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

  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "AI_ASSISTANT");
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

  const aiScanLimit = await enforceAiScanLimit(ctx.workspaceId, 1);
  if (!aiScanLimit.ok) {
    return attachTraceId(
      NextResponse.json(
        {
          error: aiScanLimit.error,
          currentPlan: aiScanLimit.plan,
          maxAiScansPerMonth: aiScanLimit.max,
          currentAiScansThisMonth: aiScanLimit.current,
          recommendedPlan: aiScanLimit.recommendedPlan,
        },
        { status: 402 }
      ),
      logger.traceId
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const rawClientBusinessId = formData.get("clientBusinessId");
    const clientBusinessId =
      typeof rawClientBusinessId === "string" ? Number(rawClientBusinessId) : NaN;

    if (!file || typeof file === "string") {
      return attachTraceId(
        NextResponse.json({ error: "file is required" }, { status: 400 }),
        logger.traceId
      );
    }

    if (!Number.isInteger(clientBusinessId)) {
      return attachTraceId(
        NextResponse.json({ error: "clientBusinessId is required" }, { status: 400 }),
        logger.traceId
      );
    }

    const validation = validateBookkeepingDocument({
      fileType: file.type,
      fileSizeBytes: file.size,
    });

    if (!validation.ok) {
      return attachTraceId(
        NextResponse.json({ error: validation.error }, { status: 400 }),
        logger.traceId
      );
    }

    const result = await ingestBookkeepingDocument({
      workspaceId: ctx.workspaceId,
      clientBusinessId,
      actorUserId: ctx.userId,
      fileName: file.name || "bookkeeping-document",
      fileType: file.type,
      fileSizeBytes: file.size,
      lastModifiedAtMs: "lastModified" in file ? file.lastModified : null,
      buffer: Buffer.from(await file.arrayBuffer()),
      ingestionChannel: "DIRECT_UPLOAD",
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "BOOKKEEPING_UPLOAD_EXTRACTED",
      metadata: {
        uploadId: result.uploadId,
        clientBusinessId,
        fileName: file.name,
        fileType: file.type?.trim() || "application/octet-stream",
        provider: result.extractionProvider,
        documentType: result.documentType,
        suggestedType: result.suggestedType,
        duplicateOfUploadId: result.duplicateOfUploadId,
        ingestionChannel: "DIRECT_UPLOAD",
      },
    });

    logger.info("upload processed", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      uploadId: result.uploadId,
      clientBusinessId,
      fileType: file.type?.trim() || "application/octet-stream",
      provider: result.extractionProvider,
      aiEnabled: hasOpenAiServerConfig(),
      duplicateOfUploadId: result.duplicateOfUploadId,
      status: result.status,
    });

    return attachTraceId(
      NextResponse.json({
        upload: result.upload,
        uploadId: result.uploadId,
        status: result.status,
      }),
      logger.traceId
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bookkeeping extraction failed";
    const status =
      message === "Client business not found"
        ? 404
        : BAD_REQUEST_ERRORS.has(message)
          ? 400
          : 500;

    logger.error("extraction failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });

    return attachTraceId(
      NextResponse.json(
        status === 500 ? buildTraceErrorPayload(message, logger.traceId) : { error: message },
        { status }
      ),
      logger.traceId
    );
  }
}
