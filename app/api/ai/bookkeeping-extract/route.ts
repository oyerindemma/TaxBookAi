import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { enforceAiScanLimit, getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  buildFallbackBookkeepingExtraction,
  buildImageMetadataFallbackExtraction,
  buildStoredDraftAmounts,
  deriveLedgerDirection,
  deriveUploadSourceType,
  extractBookkeepingFromImage,
  extractBookkeepingFromText,
  extractPdfText,
  MAX_BOOKKEEPING_IMAGE_BYTES,
  MAX_BOOKKEEPING_PDF_BYTES,
  SUPPORTED_BOOKKEEPING_MIME_TYPES,
} from "@/lib/bookkeeping-extract";
import {
  buildReceiptReviewSignals,
  buildReceiptScannerPayload,
  buildWorkspaceHistorySuggestion,
  detectDuplicateBookkeepingUpload,
} from "@/lib/bookkeeping-receipts";
import { getWorkspaceBookkeepingReviewUpload } from "@/lib/bookkeeping-review";
import { hasOpenAiServerConfig } from "@/lib/env";
import {
  attachTraceId,
  buildTraceErrorPayload,
  createRouteLogger,
} from "@/lib/observability";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isSupportedMimeType(fileType: string) {
  return SUPPORTED_BOOKKEEPING_MIME_TYPES.includes(
    fileType as (typeof SUPPORTED_BOOKKEEPING_MIME_TYPES)[number]
  );
}

function mergeNotes(...noteLists: Array<string[] | undefined>) {
  const unique = new Set<string>();
  for (const list of noteLists) {
    for (const note of list ?? []) {
      const normalized = typeof note === "string" ? note.trim() : "";
      if (normalized) unique.add(normalized);
    }
  }
  return Array.from(unique).slice(0, 10);
}

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

  let uploadId: number | null = null;

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

    const fileType = file.type?.trim() || "application/octet-stream";
    if (!isSupportedMimeType(fileType)) {
      return attachTraceId(
        NextResponse.json(
          {
            error:
              "Unsupported file type. Upload JPG, PNG, WEBP, HEIC, HEIF, or PDF receipts and invoices.",
          },
          { status: 400 }
        ),
        logger.traceId
      );
    }

    if (fileType === "application/pdf" && file.size > MAX_BOOKKEEPING_PDF_BYTES) {
      return attachTraceId(
        NextResponse.json({ error: "PDF must be 15MB or smaller" }, { status: 400 }),
        logger.traceId
      );
    }

    if (fileType.startsWith("image/") && file.size > MAX_BOOKKEEPING_IMAGE_BYTES) {
      return attachTraceId(
        NextResponse.json({ error: "Image must be 8MB or smaller" }, { status: 400 }),
        logger.traceId
      );
    }

    const clientBusiness = await prisma.clientBusiness.findFirst({
      where: {
        id: clientBusinessId,
        workspaceId: ctx.workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        defaultCurrency: true,
      },
    });

    if (!clientBusiness) {
      return NextResponse.json({ error: "Client business not found" }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    const upload = await prisma.bookkeepingUpload.create({
      data: {
        workspaceId: ctx.workspaceId,
        clientBusinessId,
        uploadedByUserId: ctx.userId,
        fileName: file.name || "bookkeeping-document",
        fileType,
        sourceType: "OTHER",
        documentType: "UNKNOWN",
        status: "UPLOADED",
        uploadSizeBytes: file.size,
        fileHash,
        fileData: buffer,
      },
      select: { id: true },
    });
    uploadId = upload.id;

    const openAiAvailable = hasOpenAiServerConfig();
    const warnings: string[] = [];
    let rawText: string | null = null;

    let extractionResult:
      | Awaited<ReturnType<typeof extractBookkeepingFromImage>>
      | Awaited<ReturnType<typeof extractBookkeepingFromText>>
      | null = null;

    if (fileType === "application/pdf") {
      rawText = await extractPdfText(buffer);

      if (rawText && openAiAvailable) {
        try {
          extractionResult = await extractBookkeepingFromText({
            text: rawText,
            fileName: file.name,
            mimeType: fileType,
          });
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? error.message
              : "AI PDF extraction failed. Falling back to local heuristics."
          );
        }
      }

      if (!extractionResult && rawText) {
        extractionResult = {
          extraction: buildFallbackBookkeepingExtraction(rawText, {
            fileName: file.name,
            rawText,
            warnings: openAiAvailable
              ? warnings
              : ["OPENAI_API_KEY is not configured. Using local PDF heuristics."],
          }),
          metadata: {
            provider: openAiAvailable ? "heuristic-fallback" : "unavailable",
            model: null,
            warnings,
            fileName: file.name,
            mimeType: fileType,
          },
          rawResponse: null,
        };
      }

      if (!extractionResult) {
        warnings.push(
          "PDF text could not be extracted. The review draft was created from file metadata only."
        );
        extractionResult = {
          extraction: buildImageMetadataFallbackExtraction({
            fileName: file.name,
            mimeType: fileType,
            lastModified: "lastModified" in file ? file.lastModified : null,
            warnings,
          }),
          metadata: {
            provider: "unavailable",
            model: null,
            warnings,
            fileName: file.name,
            mimeType: fileType,
          },
          rawResponse: null,
        };
      }
    } else {
      if (openAiAvailable) {
        try {
          const dataUrl = `data:${fileType};base64,${buffer.toString("base64")}`;
          extractionResult = await extractBookkeepingFromImage({
            dataUrl,
            fileName: file.name,
            mimeType: fileType,
          });
          rawText = extractionResult.extraction.rawText;
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? error.message
              : "AI image extraction failed. Falling back to file metadata."
          );
        }
      } else {
        warnings.push(
          "OPENAI_API_KEY is not configured. Image uploads fall back to file metadata in this environment."
        );
      }

      if (!extractionResult) {
        extractionResult = {
          extraction: buildImageMetadataFallbackExtraction({
            fileName: file.name,
            mimeType: fileType,
            lastModified: "lastModified" in file ? file.lastModified : null,
            warnings,
          }),
          metadata: {
            provider: openAiAvailable ? "heuristic-fallback" : "unavailable",
            model: null,
            warnings,
            fileName: file.name,
            mimeType: fileType,
          },
          rawResponse: null,
        };
      }
    }

    const extraction = extractionResult.extraction;
    const storedAmounts = buildStoredDraftAmounts(extraction);
    const finalReference = extraction.documentNumber ?? file.name ?? null;
    const historySuggestion = await buildWorkspaceHistorySuggestion({
      clientBusinessId,
      vendorName: extraction.vendorName,
      description: extraction.description,
      reference: finalReference,
      suggestedCategoryName: extraction.suggestedCategory,
      amountMinor: storedAmounts.totalAmountMinor ?? storedAmounts.amountMinor ?? null,
      transactionDate: extraction.transactionDate,
      suggestedType: extraction.suggestedType,
      documentType: extraction.documentType,
      vatTreatment: extraction.vatTreatment,
      whtTreatment: extraction.whtTreatment,
    });

    const duplicateDetection = await detectDuplicateBookkeepingUpload({
      workspaceId: ctx.workspaceId,
      currentUploadId: upload.id,
      clientBusinessId,
      fileHash,
      documentNumber: extraction.documentNumber,
      vendorName: extraction.vendorName ?? historySuggestion.vendorName,
      reference: finalReference,
      totalAmountMinor: storedAmounts.totalAmountMinor ?? storedAmounts.amountMinor ?? null,
      transactionDate: extraction.transactionDate,
    });

    const reviewSignals = buildReceiptReviewSignals({
      extraction,
      metadata: extractionResult.metadata,
      historySuggestion,
      duplicateDetection,
    });

    const payload = buildReceiptScannerPayload({
      extraction,
      metadata: extractionResult.metadata,
      historySuggestion,
      duplicateDetection,
      reviewSignals,
      rawResponse: extractionResult.rawResponse,
    });

    const reviewNotes = mergeNotes(
      extraction.notes,
      extractionResult.metadata.warnings,
      historySuggestion.notes,
      duplicateDetection.reason ? [duplicateDetection.reason] : undefined,
      reviewSignals.map((signal) => signal.detail)
    );
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.bookkeepingUpload.update({
        where: { id: upload.id },
        data: {
          sourceType: deriveUploadSourceType(extraction.documentType),
          documentType: extraction.documentType,
          status: "EXTRACTED",
          rawText,
          extractedAt: now,
          aiPayload: JSON.stringify(payload),
          reviewNotes: reviewNotes.length > 0 ? reviewNotes.join("\n") : null,
          failureReason: null,
          duplicateOfUploadId: duplicateDetection.duplicateOfUploadId,
          duplicateConfidence: duplicateDetection.confidence,
          duplicateReason: duplicateDetection.reason,
        },
      });

      await tx.bookkeepingDraft.create({
        data: {
          uploadId: upload.id,
          vendorId: historySuggestion.vendorId,
          categoryId: historySuggestion.categoryId,
          proposedDate: extraction.transactionDate ? new Date(extraction.transactionDate) : null,
          description: extraction.description,
          reference: finalReference,
          documentNumber: extraction.documentNumber,
          vendorName: extraction.vendorName ?? historySuggestion.vendorName,
          suggestedCategoryName:
            historySuggestion.suggestedCategoryName ?? extraction.suggestedCategory,
          paymentMethod: extraction.paymentMethod,
          direction: deriveLedgerDirection(extraction.suggestedType),
          subtotalMinor: storedAmounts.subtotalMinor,
          amountMinor: storedAmounts.amountMinor,
          totalAmountMinor: storedAmounts.totalAmountMinor ?? storedAmounts.amountMinor,
          taxAmountMinor: storedAmounts.taxAmountMinor,
          taxRate: extraction.taxRate,
          currency: extraction.currency || clientBusiness.defaultCurrency,
          vatAmountMinor: storedAmounts.vatAmountMinor,
          whtAmountMinor: storedAmounts.whtAmountMinor,
          vatTreatment: historySuggestion.vatTreatment,
          whtTreatment: historySuggestion.whtTreatment,
          confidence: extraction.confidenceScore,
          deductibilityHint:
            historySuggestion.deductibilityHint ?? extraction.deductibilityHint,
          fieldConfidencePayload: JSON.stringify(extraction.fieldConfidences),
          lineItemsPayload: JSON.stringify(extraction.lineItems),
          reviewStatus: "PENDING",
          aiPayload: JSON.stringify(payload),
        },
      });

      await tx.bookkeepingUpload.update({
        where: { id: upload.id },
        data: {
          status: "READY_FOR_REVIEW",
        },
      });
    });

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "BOOKKEEPING_UPLOAD_EXTRACTED",
      metadata: {
        uploadId: upload.id,
        clientBusinessId,
        fileName: file.name,
        fileType,
        provider: extractionResult.metadata.provider,
        documentType: extraction.documentType,
        suggestedType: extraction.suggestedType,
        duplicateOfUploadId: duplicateDetection.duplicateOfUploadId,
      },
    });

    const hydratedUpload = await getWorkspaceBookkeepingReviewUpload(ctx.workspaceId, upload.id);

    logger.info("upload processed", {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      uploadId: upload.id,
      clientBusinessId,
      fileType,
      provider: extractionResult.metadata.provider,
      aiEnabled: hasOpenAiServerConfig(),
      duplicateOfUploadId: duplicateDetection.duplicateOfUploadId,
      status: hydratedUpload?.status ?? "READY_FOR_REVIEW",
    });

    return attachTraceId(
      NextResponse.json({
        upload: hydratedUpload,
        uploadId: upload.id,
        status: hydratedUpload?.status ?? "READY_FOR_REVIEW",
      }),
      logger.traceId
    );
  } catch (error) {
    if (uploadId) {
      await prisma.bookkeepingUpload.update({
        where: { id: uploadId },
        data: {
          status: "FAILED",
          failureReason:
            error instanceof Error ? error.message : "Bookkeeping extraction failed",
          reviewedAt: new Date(),
        },
      });
    }

    logger.error("extraction failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      uploadId,
    });

    return attachTraceId(
      NextResponse.json(
        buildTraceErrorPayload(
          error instanceof Error ? error.message : "Bookkeeping extraction failed",
          logger.traceId
        ),
        { status: 500 }
      ),
      logger.traceId
    );
  }
}
