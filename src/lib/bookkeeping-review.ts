import "server-only";

import type { DraftReviewStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  parseFieldConfidences,
  parseLineItems,
  parseReceiptScannerPayload,
} from "@/lib/bookkeeping-receipts";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

const BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT = {
  tables: [
    "BookkeepingUpload",
    "BookkeepingDraft",
    "ClientBusiness",
    "User",
    "WhatsAppReceiptMessage",
    "WhatsAppReceiptConnection",
  ],
  columns: [
    "BookkeepingUpload.workspaceId",
    "BookkeepingUpload.ingestionChannel",
    "BookkeepingUpload.createdAt",
    "BookkeepingDraft.uploadId",
    "ClientBusiness.name",
    "User.fullName",
    "User.email",
    "WhatsAppReceiptMessage.bookkeepingUploadId",
    "WhatsAppReceiptConnection.label",
  ],
} as const;

const BOOKKEEPING_UPLOAD_FALLBACK_QUERY_SUPPORT = {
  tables: ["BookkeepingUpload", "BookkeepingDraft", "ClientBusiness", "User"],
  columns: [
    "BookkeepingUpload.workspaceId",
    "BookkeepingUpload.createdAt",
    "BookkeepingDraft.uploadId",
    "ClientBusiness.name",
    "User.fullName",
    "User.email",
  ],
} as const;

const bookkeepingReviewWarningKeys = new Set<string>();

function logBookkeepingReviewWarningOnce(
  key: string,
  message: string,
  metadata: Record<string, unknown>
) {
  if (bookkeepingReviewWarningKeys.has(key)) {
    return;
  }

  bookkeepingReviewWarningKeys.add(key);
  logWarn("bookkeeping-review", message, metadata);
}

function buildDraftCounts(statuses: DraftReviewStatus[]) {
  return statuses.reduce(
    (counts, status) => {
      counts[status] += 1;
      return counts;
    },
    {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      NEEDS_INFO: 0,
    } satisfies Record<DraftReviewStatus, number>
  );
}

const bookkeepingDraftSelect = {
  id: true,
  description: true,
  reference: true,
  documentNumber: true,
  vendorId: true,
  vendorName: true,
  categoryId: true,
  suggestedCategoryName: true,
  paymentMethod: true,
  direction: true,
  subtotalMinor: true,
  amountMinor: true,
  totalAmountMinor: true,
  taxAmountMinor: true,
  taxRate: true,
  currency: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  vatTreatment: true,
  whtTreatment: true,
  confidence: true,
  deductibilityHint: true,
  fieldConfidencePayload: true,
  lineItemsPayload: true,
  reviewStatus: true,
  reviewerNote: true,
  proposedDate: true,
  reviewedAt: true,
  approvedAt: true,
  rejectedAt: true,
  vendor: {
    select: {
      name: true,
    },
  },
  category: {
    select: {
      name: true,
    },
  },
  reviewedBy: {
    select: {
      fullName: true,
    },
  },
  ledgerTransaction: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.BookkeepingDraftSelect;

const bookkeepingUploadFallbackSelect = {
  id: true,
  fileName: true,
  fileType: true,
  sourceType: true,
  documentType: true,
  status: true,
  uploadSizeBytes: true,
  reviewNotes: true,
  rawText: true,
  failureReason: true,
  duplicateConfidence: true,
  duplicateReason: true,
  extractedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  aiPayload: true,
  duplicateOfUpload: {
    select: {
      id: true,
      fileName: true,
      createdAt: true,
      status: true,
      clientBusiness: {
        select: {
          name: true,
        },
      },
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  uploadedBy: {
    select: {
      fullName: true,
      email: true,
    },
  },
  drafts: {
    orderBy: [{ createdAt: "asc" }],
    select: bookkeepingDraftSelect,
  },
} satisfies Prisma.BookkeepingUploadSelect;

const bookkeepingUploadSelect = {
  ...bookkeepingUploadFallbackSelect,
  ingestionChannel: true,
  whatsAppReceiptMessage: {
    select: {
      id: true,
      provider: true,
      senderPhoneNumber: true,
      senderName: true,
      receivedAt: true,
      externalMessageId: true,
      connection: {
        select: {
          label: true,
        },
      },
    },
  },
} satisfies Prisma.BookkeepingUploadSelect;

type BookkeepingUploadRecord =
  | Prisma.BookkeepingUploadGetPayload<{
      select: typeof bookkeepingUploadSelect;
    }>
  | Prisma.BookkeepingUploadGetPayload<{
      select: typeof bookkeepingUploadFallbackSelect;
    }>;

function serializeUpload(upload: BookkeepingUploadRecord) {
  const payload = parseReceiptScannerPayload(upload.aiPayload);
  const draftStatuses = upload.drafts.map((draft) => draft.reviewStatus);
  const draftCounts = buildDraftCounts(draftStatuses);
  const ingestionChannel =
    "ingestionChannel" in upload ? upload.ingestionChannel : "DIRECT_UPLOAD";
  const whatsAppReceiptMessage =
    "whatsAppReceiptMessage" in upload ? upload.whatsAppReceiptMessage : null;

  return {
    id: upload.id,
    fileName: upload.fileName,
    fileType: upload.fileType,
    sourceType: upload.sourceType,
    ingestionChannel,
    documentType: upload.documentType,
    status: upload.status,
    uploadSizeBytes: upload.uploadSizeBytes,
    reviewNotes: upload.reviewNotes,
    rawText: upload.rawText,
    failureReason: upload.failureReason,
    duplicateConfidence: upload.duplicateConfidence,
    duplicateReason: upload.duplicateReason,
    extractedAt: upload.extractedAt?.toISOString() ?? null,
    reviewedAt: upload.reviewedAt?.toISOString() ?? null,
    createdAt: upload.createdAt.toISOString(),
    updatedAt: upload.updatedAt.toISOString(),
    previewUrl: `/api/bookkeeping/uploads/${upload.id}/file`,
    assistant: {
      provider: payload?.metadata.provider ?? null,
      model: payload?.metadata.model ?? null,
      warnings: payload?.metadata.warnings ?? [],
      notes: payload?.extraction.notes ?? [],
      historyNotes: payload?.historySuggestion.notes ?? [],
      reviewSignals: payload?.reviewSignals ?? [],
    },
    duplicateOfUpload: upload.duplicateOfUpload
      ? {
          id: upload.duplicateOfUpload.id,
          fileName: upload.duplicateOfUpload.fileName,
          createdAt: upload.duplicateOfUpload.createdAt.toISOString(),
          status: upload.duplicateOfUpload.status,
          clientBusinessName: upload.duplicateOfUpload.clientBusiness.name,
        }
      : null,
    whatsAppReceiptMessage: whatsAppReceiptMessage
      ? {
          id: whatsAppReceiptMessage.id,
          provider: whatsAppReceiptMessage.provider,
          senderPhoneNumber: whatsAppReceiptMessage.senderPhoneNumber,
          senderName: whatsAppReceiptMessage.senderName,
          connectionLabel: whatsAppReceiptMessage.connection.label,
          receivedAt: whatsAppReceiptMessage.receivedAt.toISOString(),
          externalMessageId: whatsAppReceiptMessage.externalMessageId,
        }
      : null,
    clientBusiness: upload.clientBusiness,
    uploadedByName: upload.uploadedBy?.fullName ?? null,
    uploadedByEmail: upload.uploadedBy?.email ?? null,
    draftCount: upload.drafts.length,
    pendingDraftCount: draftCounts.PENDING + draftCounts.NEEDS_INFO,
    approvedDraftCount: draftCounts.APPROVED,
    rejectedDraftCount: draftCounts.REJECTED,
    drafts: upload.drafts.map((draft) => ({
      id: draft.id,
      description: draft.description,
      reference: draft.reference,
      documentNumber: draft.documentNumber,
      vendorId: draft.vendorId,
      vendorName: draft.vendorName ?? draft.vendor?.name ?? null,
      categoryId: draft.categoryId,
      suggestedCategoryName: draft.suggestedCategoryName ?? draft.category?.name ?? null,
      paymentMethod: draft.paymentMethod,
      direction: draft.direction,
      subtotalMinor: draft.subtotalMinor,
      amountMinor: draft.amountMinor,
      totalAmountMinor: draft.totalAmountMinor,
      taxAmountMinor: draft.taxAmountMinor,
      taxRate: draft.taxRate,
      currency: draft.currency,
      vatAmountMinor: draft.vatAmountMinor,
      whtAmountMinor: draft.whtAmountMinor,
      vatTreatment: draft.vatTreatment,
      whtTreatment: draft.whtTreatment,
      confidence: draft.confidence,
      deductibilityHint: draft.deductibilityHint,
      fieldConfidences: parseFieldConfidences(draft.fieldConfidencePayload),
      lineItems: parseLineItems(draft.lineItemsPayload),
      reviewStatus: draft.reviewStatus,
      reviewerNote: draft.reviewerNote,
      proposedDate: draft.proposedDate?.toISOString() ?? null,
      reviewedAt: draft.reviewedAt?.toISOString() ?? null,
      approvedAt: draft.approvedAt?.toISOString() ?? null,
      rejectedAt: draft.rejectedAt?.toISOString() ?? null,
      ledgerTransactionId: draft.ledgerTransaction?.id ?? null,
      reviewedByName: draft.reviewedBy?.fullName ?? null,
    })),
  };
}

async function fetchWorkspaceUploads(workspaceId: number) {
  const supportsFullQuery = await hasPrismaDatabaseSupport(
    BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT
  );
  const supportsFallbackQuery = supportsFullQuery
    ? true
    : await hasPrismaDatabaseSupport(BOOKKEEPING_UPLOAD_FALLBACK_QUERY_SUPPORT);

  if (!supportsFullQuery && !supportsFallbackQuery) {
    logBookkeepingReviewWarningOnce(
      "missing-upload-query-support",
      "Bookkeeping review uploads are unavailable in the current database; returning an empty list.",
      {
        workspaceId,
      }
    );
    return [] satisfies BookkeepingUploadRecord[];
  }

  if (!supportsFullQuery) {
    logBookkeepingReviewWarningOnce(
      "fallback-upload-query",
      "Bookkeeping review uploads are using a legacy-safe query because optional upload columns or WhatsApp relations are unavailable.",
      {
        workspaceId,
      }
    );
  }

  try {
    return await prisma.bookkeepingUpload.findMany({
      where: {
        workspaceId,
      },
      select: supportsFullQuery ? bookkeepingUploadSelect : bookkeepingUploadFallbackSelect,
      orderBy: [{ createdAt: "desc" }],
      take: 25,
    });
  } catch (error) {
    if (
      supportsFullQuery &&
      isPrismaSchemaCompatibilityError(error, {
        tables: [...BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT.tables],
        columns: [...BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT.columns],
      })
    ) {
      logBookkeepingReviewWarningOnce(
        "runtime-upload-query-fallback",
        "Bookkeeping review uploads hit a schema mismatch at runtime; retrying with a legacy-safe query.",
        {
          workspaceId,
        }
      );

      try {
        return await prisma.bookkeepingUpload.findMany({
          where: {
            workspaceId,
          },
          select: bookkeepingUploadFallbackSelect,
          orderBy: [{ createdAt: "desc" }],
          take: 25,
        });
      } catch (fallbackError) {
        logError(
          "bookkeeping-review",
          "Bookkeeping review uploads fallback query failed; returning an empty list.",
          fallbackError,
          {
            workspaceId,
          }
        );
        return [] satisfies BookkeepingUploadRecord[];
      }
    }

    logError(
      "bookkeeping-review",
      "Bookkeeping review uploads query failed; returning an empty list.",
      error,
      {
        workspaceId,
      }
    );
    return [] satisfies BookkeepingUploadRecord[];
  }
}

export async function listWorkspaceBookkeepingReviewUploads(workspaceId: number) {
  const uploads = await fetchWorkspaceUploads(workspaceId);
  return uploads.map((upload) => serializeUpload(upload));
}

export async function getWorkspaceBookkeepingReviewUpload(
  workspaceId: number,
  uploadId: number
) {
  const supportsFullQuery = await hasPrismaDatabaseSupport(
    BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT
  );
  const supportsFallbackQuery = supportsFullQuery
    ? true
    : await hasPrismaDatabaseSupport(BOOKKEEPING_UPLOAD_FALLBACK_QUERY_SUPPORT);

  if (!supportsFullQuery && !supportsFallbackQuery) {
    logBookkeepingReviewWarningOnce(
      "missing-single-upload-query-support",
      "Bookkeeping review upload details are unavailable in the current database; returning an empty state.",
      {
        workspaceId,
        uploadId,
      }
    );
    return null;
  }

  if (!supportsFullQuery) {
    logBookkeepingReviewWarningOnce(
      "fallback-single-upload-query",
      "Bookkeeping review upload details are using a legacy-safe query because optional upload columns or WhatsApp relations are unavailable.",
      {
        workspaceId,
        uploadId,
      }
    );
  }

  try {
    const upload = await prisma.bookkeepingUpload.findFirst({
      where: {
        id: uploadId,
        workspaceId,
      },
      select: supportsFullQuery ? bookkeepingUploadSelect : bookkeepingUploadFallbackSelect,
    });

    return upload ? serializeUpload(upload) : null;
  } catch (error) {
    if (
      supportsFullQuery &&
      isPrismaSchemaCompatibilityError(error, {
        tables: [...BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT.tables],
        columns: [...BOOKKEEPING_UPLOAD_FULL_QUERY_SUPPORT.columns],
      })
    ) {
      logBookkeepingReviewWarningOnce(
        "runtime-single-upload-query-fallback",
        "Bookkeeping review upload details hit a schema mismatch at runtime; retrying with a legacy-safe query.",
        {
          workspaceId,
          uploadId,
        }
      );

      try {
        const fallbackUpload = await prisma.bookkeepingUpload.findFirst({
          where: {
            id: uploadId,
            workspaceId,
          },
          select: bookkeepingUploadFallbackSelect,
        });

        return fallbackUpload ? serializeUpload(fallbackUpload) : null;
      } catch (fallbackError) {
        logError(
          "bookkeeping-review",
          "Bookkeeping review upload fallback query failed; returning an empty state.",
          fallbackError,
          {
            workspaceId,
            uploadId,
          }
        );
        return null;
      }
    }

    logError(
      "bookkeeping-review",
      "Bookkeeping review upload query failed; returning an empty state.",
      error,
      {
        workspaceId,
        uploadId,
      }
    );
    return null;
  }
}

export async function listWorkspaceClientBusinessReviewOptions(workspaceId: number) {
  const businesses = await prisma.clientBusiness.findMany({
    where: {
      workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
      categories: {
        orderBy: [{ type: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    defaultCurrency: business.defaultCurrency,
    categories: business.categories,
  }));
}

export async function recalculateBookkeepingUploadStatus(
  tx: PrismaExecutor,
  uploadId: number
) {
  const drafts = await tx.bookkeepingDraft.findMany({
    where: { uploadId },
    select: { reviewStatus: true },
  });

  if (drafts.length === 0) {
    return tx.bookkeepingUpload.update({
      where: { id: uploadId },
      data: {
        status: "FAILED",
        reviewedAt: new Date(),
      },
    });
  }

  const counts = buildDraftCounts(drafts.map((draft) => draft.reviewStatus));
  const hasPending = counts.PENDING > 0 || counts.NEEDS_INFO > 0;
  let status: "READY_FOR_REVIEW" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";

  if (hasPending) {
    status = "READY_FOR_REVIEW";
  } else if (counts.APPROVED > 0 && counts.REJECTED > 0) {
    status = "PARTIALLY_APPROVED";
  } else if (counts.APPROVED > 0) {
    status = "APPROVED";
  } else {
    status = "REJECTED";
  }

  return tx.bookkeepingUpload.update({
    where: { id: uploadId },
    data: {
      status,
      reviewedAt: hasPending ? null : new Date(),
    },
  });
}

export async function findWorkspaceBookkeepingDraft(workspaceId: number, draftId: number) {
  return prisma.bookkeepingDraft.findFirst({
    where: {
      id: draftId,
      upload: {
        workspaceId,
      },
    },
    include: {
      upload: {
        select: {
          id: true,
          fileName: true,
          clientBusinessId: true,
        },
      },
      ledgerTransaction: {
        select: {
          id: true,
        },
      },
    },
  });
}

export async function resolveVendorForDraft(
  tx: PrismaExecutor,
  clientBusinessId: number,
  vendorName: string | null
) {
  const trimmedVendor = vendorName?.trim();
  if (!trimmedVendor) return null;

  const existing = await tx.vendor.findUnique({
    where: {
      clientBusinessId_name: {
        clientBusinessId,
        name: trimmedVendor,
      },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await tx.vendor.create({
    data: {
      clientBusinessId,
      name: trimmedVendor,
    },
    select: { id: true },
  });

  return created.id;
}

export async function resolveCategoryForDraft(
  tx: PrismaExecutor,
  input: {
    clientBusinessId: number;
    categoryId: number | null;
    suggestedCategoryName: string | null;
    direction: "MONEY_IN" | "MONEY_OUT" | "JOURNAL";
  }
) {
  if (input.categoryId) {
    const existing = await tx.transactionCategory.findFirst({
      where: {
        id: input.categoryId,
        clientBusinessId: input.clientBusinessId,
      },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  const trimmedCategory = input.suggestedCategoryName?.trim();
  if (!trimmedCategory) return null;

  const existing = await tx.transactionCategory.findUnique({
    where: {
      clientBusinessId_name: {
        clientBusinessId: input.clientBusinessId,
        name: trimmedCategory,
      },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await tx.transactionCategory.create({
    data: {
      clientBusinessId: input.clientBusinessId,
      name: trimmedCategory,
      type: input.direction === "MONEY_IN" ? "INCOME" : "EXPENSE",
    },
    select: { id: true },
  });

  return created.id;
}
