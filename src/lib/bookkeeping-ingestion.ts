import "server-only";

import crypto from "node:crypto";
import type { BookkeepingIngestionChannel } from "@prisma/client";
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
import { prisma } from "@/lib/prisma";

export type IngestBookkeepingDocumentInput = {
  workspaceId: number;
  clientBusinessId: number;
  actorUserId?: number | null;
  fileName: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  lastModifiedAtMs?: number | null;
  buffer: Buffer;
  ingestionChannel?: BookkeepingIngestionChannel;
};

export type IngestBookkeepingDocumentResult = {
  uploadId: number;
  status: string;
  upload: Awaited<ReturnType<typeof getWorkspaceBookkeepingReviewUpload>>;
  extractionProvider: "openai" | "heuristic-fallback" | "unavailable";
  documentType: "RECEIPT" | "INVOICE" | "CREDIT_NOTE" | "UNKNOWN";
  suggestedType: "INCOME" | "EXPENSE";
  duplicateOfUploadId: number | null;
};

export function isSupportedBookkeepingMimeType(fileType: string) {
  return SUPPORTED_BOOKKEEPING_MIME_TYPES.includes(
    fileType as (typeof SUPPORTED_BOOKKEEPING_MIME_TYPES)[number]
  );
}

export function validateBookkeepingDocument(input: {
  fileType?: string | null;
  fileSizeBytes?: number | null;
}) {
  const fileType = input.fileType?.trim() || "application/octet-stream";
  const fileSizeBytes = input.fileSizeBytes ?? null;

  if (!isSupportedBookkeepingMimeType(fileType)) {
    return {
      ok: false,
      error:
        "Unsupported file type. Upload JPG, PNG, WEBP, HEIC, HEIF, or PDF receipts and invoices.",
    } as const;
  }

  if (
    fileType === "application/pdf" &&
    typeof fileSizeBytes === "number" &&
    fileSizeBytes > MAX_BOOKKEEPING_PDF_BYTES
  ) {
    return {
      ok: false,
      error: "PDF must be 15MB or smaller",
    } as const;
  }

  if (
    fileType.startsWith("image/") &&
    typeof fileSizeBytes === "number" &&
    fileSizeBytes > MAX_BOOKKEEPING_IMAGE_BYTES
  ) {
    return {
      ok: false,
      error: "Image must be 8MB or smaller",
    } as const;
  }

  return {
    ok: true,
    fileType,
    fileSizeBytes: fileSizeBytes ?? 0,
  } as const;
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

export async function ingestBookkeepingDocument(
  input: IngestBookkeepingDocumentInput
): Promise<IngestBookkeepingDocumentResult> {
  const validation = validateBookkeepingDocument({
    fileType: input.fileType,
    fileSizeBytes: input.fileSizeBytes ?? input.buffer.byteLength,
  });

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const clientBusiness = await prisma.clientBusiness.findFirst({
    where: {
      id: input.clientBusinessId,
      workspaceId: input.workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  });

  if (!clientBusiness) {
    throw new Error("Client business not found");
  }

  const fileHash = crypto.createHash("sha256").update(input.buffer).digest("hex");
  let uploadId: number | null = null;

  try {
    const upload = await prisma.bookkeepingUpload.create({
      data: {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId,
        uploadedByUserId: input.actorUserId ?? null,
        fileName: input.fileName || "bookkeeping-document",
        fileType: validation.fileType,
        sourceType: "OTHER",
        documentType: "UNKNOWN",
        status: "UPLOADED",
        ingestionChannel: input.ingestionChannel ?? "DIRECT_UPLOAD",
        uploadSizeBytes: validation.fileSizeBytes,
        fileHash,
        fileData: Uint8Array.from(input.buffer),
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

    if (validation.fileType === "application/pdf") {
      rawText = await extractPdfText(input.buffer);

      if (rawText && openAiAvailable) {
        try {
          extractionResult = await extractBookkeepingFromText({
            text: rawText,
            fileName: input.fileName,
            mimeType: validation.fileType,
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
            fileName: input.fileName,
            rawText,
            warnings: openAiAvailable
              ? warnings
              : ["OPENAI_API_KEY is not configured. Using local PDF heuristics."],
          }),
          metadata: {
            provider: openAiAvailable ? "heuristic-fallback" : "unavailable",
            model: null,
            warnings,
            fileName: input.fileName,
            mimeType: validation.fileType,
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
            fileName: input.fileName,
            mimeType: validation.fileType,
            lastModified: input.lastModifiedAtMs ?? null,
            warnings,
          }),
          metadata: {
            provider: "unavailable",
            model: null,
            warnings,
            fileName: input.fileName,
            mimeType: validation.fileType,
          },
          rawResponse: null,
        };
      }
    } else {
      if (openAiAvailable) {
        try {
          const dataUrl = `data:${validation.fileType};base64,${input.buffer.toString("base64")}`;
          extractionResult = await extractBookkeepingFromImage({
            dataUrl,
            fileName: input.fileName,
            mimeType: validation.fileType,
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
            fileName: input.fileName,
            mimeType: validation.fileType,
            lastModified: input.lastModifiedAtMs ?? null,
            warnings,
          }),
          metadata: {
            provider: openAiAvailable ? "heuristic-fallback" : "unavailable",
            model: null,
            warnings,
            fileName: input.fileName,
            mimeType: validation.fileType,
          },
          rawResponse: null,
        };
      }
    }

    const extraction = extractionResult.extraction;
    const storedAmounts = buildStoredDraftAmounts(extraction);
    const finalReference = extraction.documentNumber ?? input.fileName ?? null;
    const historySuggestion = await buildWorkspaceHistorySuggestion({
      clientBusinessId: input.clientBusinessId,
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
      workspaceId: input.workspaceId,
      currentUploadId: upload.id,
      clientBusinessId: input.clientBusinessId,
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

    const hydratedUpload = await getWorkspaceBookkeepingReviewUpload(
      input.workspaceId,
      upload.id
    );

    return {
      uploadId: upload.id,
      status: hydratedUpload?.status ?? "READY_FOR_REVIEW",
      upload: hydratedUpload,
      extractionProvider: extractionResult.metadata.provider,
      documentType: extraction.documentType,
      suggestedType: extraction.suggestedType,
      duplicateOfUploadId: duplicateDetection.duplicateOfUploadId,
    };
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

    throw error;
  }
}
