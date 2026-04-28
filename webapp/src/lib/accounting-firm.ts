import "server-only";

import type {
  BookkeepingUploadStatus,
  DraftReviewStatus,
  Prisma,
  PrismaClient,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLIENT_BUSINESS_CATEGORIES = [
  { name: "Revenue", type: "INCOME" },
  { name: "Cost of sales", type: "EXPENSE" },
  { name: "Operations", type: "EXPENSE" },
  { name: "Payroll", type: "EXPENSE" },
  { name: "Rent and utilities", type: "EXPENSE" },
  { name: "Professional fees", type: "EXPENSE" },
  { name: "Tax and compliance", type: "EXPENSE" },
  { name: "Travel and logistics", type: "EXPENSE" },
] as const satisfies ReadonlyArray<{
  name: string;
  type:
    | "INCOME"
    | "EXPENSE"
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "OTHER";
}>;

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

function readString(
  value: unknown,
  options?: {
    required?: boolean;
    maxLength?: number;
    fallback?: string;
  }
) {
  const raw = typeof value === "string" ? value.trim() : "";
  const resolved = raw || options?.fallback || "";

  if (!resolved) {
    return options?.required ? { error: "This field is required." } : { value: null };
  }

  if (options?.maxLength && resolved.length > options.maxLength) {
    return {
      error: `Use ${options.maxLength} characters or fewer.`,
    };
  }

  return { value: resolved };
}

function readInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { value: fallback };
  }
  return { value: parsed };
}

export function parseClientBusinessPayload(input: Record<string, unknown>) {
  const name = readString(input.name, { required: true, maxLength: 120 });
  if ("error" in name) {
    return { error: "Business name is required." } as const;
  }

  const legalName = readString(input.legalName, { maxLength: 160 });
  if ("error" in legalName) {
    return { error: "Legal name must be 160 characters or fewer." } as const;
  }

  const industry = readString(input.industry, { maxLength: 80 });
  if ("error" in industry) {
    return { error: "Industry must be 80 characters or fewer." } as const;
  }

  const country = readString(input.country, {
    maxLength: 80,
    fallback: "Nigeria",
  });
  if ("error" in country) {
    return { error: "Country must be 80 characters or fewer." } as const;
  }

  const state = readString(input.state, { maxLength: 80 });
  if ("error" in state) {
    return { error: "State must be 80 characters or fewer." } as const;
  }

  const taxIdentificationNumber = readString(input.taxIdentificationNumber, {
    maxLength: 80,
  });
  if ("error" in taxIdentificationNumber) {
    return { error: "TIN must be 80 characters or fewer." } as const;
  }

  const vatRegistrationNumber = readString(input.vatRegistrationNumber, {
    maxLength: 80,
  });
  if ("error" in vatRegistrationNumber) {
    return { error: "VAT registration must be 80 characters or fewer." } as const;
  }

  const defaultCurrency = readString(input.defaultCurrency, {
    maxLength: 12,
    fallback: "NGN",
  });
  if ("error" in defaultCurrency) {
    return { error: "Currency must be 12 characters or fewer." } as const;
  }

  const notes = readString(input.notes, { maxLength: 500 });
  if ("error" in notes) {
    return { error: "Notes must be 500 characters or fewer." } as const;
  }

  const fiscalYearStartMonth = readInteger(input.fiscalYearStartMonth, 1, 1, 12);

  return {
    data: {
      name: name.value ?? "",
      legalName: legalName.value,
      industry: industry.value,
      country: country.value ?? "Nigeria",
      state: state.value,
      taxIdentificationNumber: taxIdentificationNumber.value,
      vatRegistrationNumber: vatRegistrationNumber.value,
      defaultCurrency: (defaultCurrency.value ?? "NGN").toUpperCase(),
      fiscalYearStartMonth: fiscalYearStartMonth.value,
      notes: notes.value,
    },
  } as const;
}

export async function seedDefaultClientBusinessCategories(
  tx: PrismaExecutor,
  clientBusinessId: number
) {
  await tx.transactionCategory.createMany({
    data: DEFAULT_CLIENT_BUSINESS_CATEGORIES.map((category) => ({
      clientBusinessId,
      name: category.name,
      type: category.type,
    })),
  });
}

export async function getWorkspaceClientBusiness(workspaceId: number, clientBusinessId: number) {
  const business = await prisma.clientBusiness.findFirst({
    where: {
      id: clientBusinessId,
      workspaceId,
    },
    include: {
      _count: {
        select: {
          vendors: true,
          categories: true,
          transactions: true,
          bookkeepingUploads: true,
        },
      },
    },
  });

  if (!business) return null;

  return {
    id: business.id,
    name: business.name,
    legalName: business.legalName,
    industry: business.industry,
    country: business.country,
    state: business.state,
    taxIdentificationNumber: business.taxIdentificationNumber,
    vatRegistrationNumber: business.vatRegistrationNumber,
    defaultCurrency: business.defaultCurrency,
    fiscalYearStartMonth: business.fiscalYearStartMonth,
    status: business.status,
    archivedAt: business.archivedAt?.toISOString() ?? null,
    notes: business.notes,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
    vendorCount: business._count.vendors,
    categoryCount: business._count.categories,
    transactionCount: business._count.transactions,
    uploadCount: business._count.bookkeepingUploads,
  };
}

export async function listWorkspaceClientBusinesses(workspaceId: number) {
  const businesses = await prisma.clientBusiness.findMany({
    where: { workspaceId },
    include: {
      _count: {
        select: {
          vendors: true,
          categories: true,
          transactions: true,
          bookkeepingUploads: true,
        },
      },
    },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  });

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    legalName: business.legalName,
    industry: business.industry,
    country: business.country,
    state: business.state,
    taxIdentificationNumber: business.taxIdentificationNumber,
    vatRegistrationNumber: business.vatRegistrationNumber,
    defaultCurrency: business.defaultCurrency,
    fiscalYearStartMonth: business.fiscalYearStartMonth,
    status: business.status,
    archivedAt: business.archivedAt?.toISOString() ?? null,
    notes: business.notes,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
    vendorCount: business._count.vendors,
    categoryCount: business._count.categories,
    transactionCount: business._count.transactions,
    uploadCount: business._count.bookkeepingUploads,
  }));
}

export async function getWorkspaceBookkeepingMetrics(workspaceId: number) {
  const activeUploadStatuses: BookkeepingUploadStatus[] = [
    "UPLOADED",
    "QUEUED",
    "PROCESSING",
    "EXTRACTED",
    "READY_FOR_REVIEW",
  ];
  const reviewStatuses: DraftReviewStatus[] = ["PENDING", "NEEDS_INFO"];

  const [businessCount, transactionCount, queuedUploadCount, pendingDraftCount] =
    await Promise.all([
      prisma.clientBusiness.count({
        where: {
          workspaceId,
          archivedAt: null,
        },
      }),
      prisma.ledgerTransaction.count({
        where: {
          clientBusiness: {
            workspaceId,
          },
        },
      }),
      prisma.bookkeepingUpload.count({
        where: {
          status: { in: activeUploadStatuses },
          clientBusiness: {
            workspaceId,
          },
        },
      }),
      prisma.bookkeepingDraft.count({
        where: {
          reviewStatus: { in: reviewStatuses },
          upload: {
            clientBusiness: {
              workspaceId,
            },
          },
        },
      }),
    ]);

  return {
    businessCount,
    transactionCount,
    queuedUploadCount,
    pendingDraftCount,
  };
}

function buildDraftCounts(
  statuses: DraftReviewStatus[]
): Record<DraftReviewStatus, number> {
  return statuses.reduce(
    (counts, status) => ({
      ...counts,
      [status]: (counts[status] ?? 0) + 1,
    }),
    {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      NEEDS_INFO: 0,
    } satisfies Record<DraftReviewStatus, number>
  );
}

export async function listWorkspaceBookkeepingUploads(workspaceId: number) {
  const uploads = await prisma.bookkeepingUpload.findMany({
    where: {
      clientBusiness: {
        workspaceId,
      },
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      sourceType: true,
      status: true,
      uploadSizeBytes: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
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
        orderBy: [{ reviewStatus: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          description: true,
          reference: true,
          direction: true,
          amountMinor: true,
          currency: true,
          vatAmountMinor: true,
          whtAmountMinor: true,
          confidence: true,
          reviewStatus: true,
          proposedDate: true,
          category: {
            select: {
              name: true,
            },
          },
          vendor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 20,
  });

  return uploads.map((upload) => {
    const draftStatuses = upload.drafts.map((draft) => draft.reviewStatus);
    const draftCounts = buildDraftCounts(draftStatuses);

    return {
      id: upload.id,
      fileName: upload.fileName,
      fileType: upload.fileType,
      sourceType: upload.sourceType,
      status: upload.status,
      uploadSizeBytes: upload.uploadSizeBytes,
      reviewNotes: upload.reviewNotes,
      reviewedAt: upload.reviewedAt?.toISOString() ?? null,
      createdAt: upload.createdAt.toISOString(),
      updatedAt: upload.updatedAt.toISOString(),
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
        direction: draft.direction,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        vatAmountMinor: draft.vatAmountMinor,
        whtAmountMinor: draft.whtAmountMinor,
        confidence: draft.confidence,
        reviewStatus: draft.reviewStatus,
        proposedDate: draft.proposedDate?.toISOString() ?? null,
        categoryName: draft.category?.name ?? null,
        vendorName: draft.vendor?.name ?? null,
      })),
    };
  });
}

function applyTaxBucket(
  summary: {
    outputVatMinor: number;
    inputVatMinor: number;
    whtPayableMinor: number;
    whtReceivableMinor: number;
  },
  vatTreatment: VatTreatment,
  vatAmountMinor: number,
  whtTreatment: WhtTreatment,
  whtAmountMinor: number
) {
  if (vatTreatment === "OUTPUT") {
    summary.outputVatMinor += vatAmountMinor;
  }
  if (vatTreatment === "INPUT") {
    summary.inputVatMinor += vatAmountMinor;
  }
  if (whtTreatment === "PAYABLE") {
    summary.whtPayableMinor += whtAmountMinor;
  }
  if (whtTreatment === "RECEIVABLE") {
    summary.whtReceivableMinor += whtAmountMinor;
  }
}

export async function getWorkspaceTaxSummary(
  workspaceId: number,
  options?: {
    from?: Date | null;
    to?: Date | null;
  }
) {
  const from = options?.from ?? null;
  const to = options?.to ?? null;

  const transactions = await prisma.ledgerTransaction.findMany({
    where: {
      clientBusiness: {
        workspaceId,
      },
      transactionDate: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      vatAmountMinor: true,
      whtAmountMinor: true,
      vatTreatment: true,
      whtTreatment: true,
      reviewStatus: true,
      clientBusiness: {
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
        },
      },
    },
    orderBy: [{ transactionDate: "desc" }],
  });

  const perBusiness = new Map<
    number,
    {
      clientBusinessId: number;
      clientBusinessName: string;
      currency: string;
      transactionCount: number;
      postedCount: number;
      draftCount: number;
      outputVatMinor: number;
      inputVatMinor: number;
      whtPayableMinor: number;
      whtReceivableMinor: number;
    }
  >();

  const currencies = new Set<string>();
  const totals = {
    transactionCount: 0,
    postedCount: 0,
    draftCount: 0,
    outputVatMinor: 0,
    inputVatMinor: 0,
    whtPayableMinor: 0,
    whtReceivableMinor: 0,
  };

  for (const transaction of transactions) {
    currencies.add(transaction.currency);
    totals.transactionCount += 1;
    if (transaction.reviewStatus === "POSTED") {
      totals.postedCount += 1;
    } else {
      totals.draftCount += 1;
    }

    applyTaxBucket(
      totals,
      transaction.vatTreatment,
      transaction.vatAmountMinor,
      transaction.whtTreatment,
      transaction.whtAmountMinor
    );

    const existing =
      perBusiness.get(transaction.clientBusiness.id) ??
      {
        clientBusinessId: transaction.clientBusiness.id,
        clientBusinessName: transaction.clientBusiness.name,
        currency: transaction.clientBusiness.defaultCurrency,
        transactionCount: 0,
        postedCount: 0,
        draftCount: 0,
        outputVatMinor: 0,
        inputVatMinor: 0,
        whtPayableMinor: 0,
        whtReceivableMinor: 0,
      };

    existing.transactionCount += 1;
    if (transaction.reviewStatus === "POSTED") {
      existing.postedCount += 1;
    } else {
      existing.draftCount += 1;
    }

    applyTaxBucket(
      existing,
      transaction.vatTreatment,
      transaction.vatAmountMinor,
      transaction.whtTreatment,
      transaction.whtAmountMinor
    );

    perBusiness.set(transaction.clientBusiness.id, existing);
  }

  return {
    from,
    to,
    totals: {
      ...totals,
      netVatMinor: totals.outputVatMinor - totals.inputVatMinor,
    },
    currencyMode:
      currencies.size <= 1 ? Array.from(currencies)[0] ?? "NGN" : "MIXED",
    businesses: Array.from(perBusiness.values())
      .map((business) => ({
        ...business,
        netVatMinor: business.outputVatMinor - business.inputVatMinor,
      }))
      .sort((left, right) => left.clientBusinessName.localeCompare(right.clientBusinessName)),
  };
}
