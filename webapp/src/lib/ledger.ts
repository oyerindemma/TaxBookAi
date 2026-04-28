import "server-only";

import type {
  LedgerDirection,
  Prisma,
  PrismaClient,
  TaxCategory,
  TaxEvidenceStatus,
  TransactionOrigin,
  TransactionReviewStatus,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { logInfo } from "@/lib/logger";
import { ensureDefaultTransactionCategoriesForClientBusiness } from "@/lib/transaction-categories";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

type LedgerSyncResult = {
  entryId: number | null;
  created: boolean;
  updated: boolean;
  deleted: boolean;
  skippedReason?: string | null;
};

const INVOICE_REFERENCE_PREFIX = "INVOICE:";
const TAX_REFERENCE_PREFIX = "TAX:";

function buildInvoiceLedgerReference(invoiceId: number) {
  return `${INVOICE_REFERENCE_PREFIX}${invoiceId}`;
}

function buildTaxLedgerReference(taxPeriodId: number, taxType: "VAT" | "WHT") {
  return `${TAX_REFERENCE_PREFIX}${taxType}:${taxPeriodId}`;
}

function joinNotes(...parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return normalized.length > 0 ? normalized.join("\n\n") : null;
}

function logInvoiceLedgerSkip(input: {
  invoiceId: number;
  workspaceId?: number | null;
  skippedReason: string;
  clientBusinessId?: number | null;
}) {
  logInfo("ledger", "Invoice ledger sync skipped", {
    invoiceId: input.invoiceId,
    workspaceId: input.workspaceId ?? null,
    clientBusinessId: input.clientBusinessId ?? null,
    skippedReason: input.skippedReason,
  });
}

async function resolveSingleActiveClientBusinessId(
  tx: PrismaExecutor,
  workspaceId: number
) {
  const businesses = await tx.clientBusiness.findMany({
    where: {
      workspaceId,
      archivedAt: null,
    },
    orderBy: { id: "asc" },
    select: { id: true },
    take: 2,
  });

  return businesses.length === 1 ? businesses[0].id : null;
}

export async function deleteIncomeEntryFromInvoice(
  tx: PrismaExecutor,
  input: { invoiceId: number }
) {
  const deleted = await tx.ledgerTransaction.deleteMany({
    where: {
      reference: buildInvoiceLedgerReference(input.invoiceId),
    },
  });

  return {
    deletedCount: deleted.count,
  };
}

export async function createIncomeEntryFromInvoice(
  tx: PrismaExecutor,
  input: {
    invoiceId: number;
    actorUserId?: number | null;
    occurredOn?: Date;
    bankTransactionId?: number | null;
    clientBusinessId?: number | null;
  }
): Promise<LedgerSyncResult> {
  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      workspaceId: true,
      clientBusinessId: true,
      invoiceNumber: true,
      paymentReference: true,
      paidAt: true,
      status: true,
      totalAmount: true,
      taxAmount: true,
      vatTreatment: true,
      whtTreatment: true,
      taxCategory: true,
      taxEvidenceStatus: true,
      filingPeriodKey: true,
      sourceDocumentNumber: true,
      notes: true,
      clientBusiness: {
        select: {
          id: true,
          defaultCurrency: true,
        },
      },
    },
  });

  if (!invoice) {
    logInvoiceLedgerSkip({
      invoiceId: input.invoiceId,
      skippedReason: "invoice_not_found",
    });
    return {
      entryId: null,
      created: false,
      updated: false,
      deleted: false,
      skippedReason: "invoice_not_found",
    };
  }

  const reference = buildInvoiceLedgerReference(invoice.id);
  const existingEntry = await tx.ledgerTransaction.findFirst({
    where: {
      reference,
    },
    select: {
      id: true,
      clientBusinessId: true,
      bankTransactionId: true,
    },
  });

  if (
    input.bankTransactionId !== undefined &&
    input.bankTransactionId !== null &&
    existingEntry?.bankTransactionId &&
    existingEntry.bankTransactionId !== input.bankTransactionId
  ) {
    throw new Error("Invoice ledger entry is already linked to a different bank transaction");
  }

  if (invoice.status !== "PAID") {
    logInvoiceLedgerSkip({
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      clientBusinessId: invoice.clientBusinessId,
      skippedReason: "invoice_not_paid",
    });
    return {
      entryId: existingEntry?.id ?? null,
      created: false,
      updated: false,
      deleted: false,
      skippedReason: "invoice_not_paid",
    };
  }

  const resolvedClientBusinessId =
    input.clientBusinessId ??
    invoice.clientBusinessId ??
    existingEntry?.clientBusinessId ??
    null;

  if (!resolvedClientBusinessId) {
    logInvoiceLedgerSkip({
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      clientBusinessId: invoice.clientBusinessId,
      skippedReason: "missing_client_business_mapping",
    });
    return {
      entryId: existingEntry?.id ?? null,
      created: false,
      updated: false,
      deleted: false,
      skippedReason: "missing_client_business_mapping",
    };
  }

  if (!invoice.clientBusinessId) {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        clientBusinessId: resolvedClientBusinessId,
      },
    });
  }

  await ensureDefaultTransactionCategoriesForClientBusiness(tx, resolvedClientBusinessId);

  const revenueCategory = await tx.transactionCategory.findFirst({
    where: {
      clientBusinessId: resolvedClientBusinessId,
      name: "Revenue",
    },
    select: {
      id: true,
    },
  });

  const data = {
    clientBusinessId: resolvedClientBusinessId,
    categoryId: revenueCategory?.id ?? null,
    createdByUserId: input.actorUserId ?? null,
    transactionDate: input.occurredOn ?? invoice.paidAt ?? new Date(),
    description: `Invoice ${invoice.invoiceNumber} payment`,
    reference,
    direction: "MONEY_IN" as LedgerDirection,
    amountMinor: invoice.totalAmount,
    currency: invoice.clientBusiness?.defaultCurrency ?? "NGN",
    bankTransactionId:
      input.bankTransactionId === undefined
        ? existingEntry?.bankTransactionId ?? null
        : input.bankTransactionId,
    vatAmountMinor: invoice.vatTreatment !== "NONE" ? invoice.taxAmount : 0,
    whtAmountMinor: 0,
    vatTreatment: invoice.vatTreatment,
    whtTreatment: invoice.whtTreatment,
    taxCategory: invoice.taxCategory,
    taxEvidenceStatus: invoice.taxEvidenceStatus,
    filingPeriodKey: invoice.filingPeriodKey,
    sourceDocumentNumber: invoice.sourceDocumentNumber ?? invoice.invoiceNumber,
    origin: "MANUAL" as TransactionOrigin,
    reviewStatus: "POSTED" as TransactionReviewStatus,
    notes: joinNotes(
      invoice.notes,
      invoice.paymentReference ? `Payment reference: ${invoice.paymentReference}` : null,
      "Auto-synced from paid invoice."
    ),
  };

  if (existingEntry) {
    await tx.ledgerTransaction.update({
      where: { id: existingEntry.id },
      data,
    });

    return {
      entryId: existingEntry.id,
      created: false,
      updated: true,
      deleted: false,
    };
  }

  const created = await tx.ledgerTransaction.create({
    data,
    select: { id: true },
  });

  return {
    entryId: created.id,
    created: true,
    updated: false,
    deleted: false,
  };
}

export async function createExpenseEntryFromReceipt(
  tx: PrismaExecutor,
  input: {
    draftId: number;
    clientBusinessId: number;
    actorUserId?: number | null;
    transactionDate: Date;
    description: string;
    reference?: string | null;
    sourceDocumentNumber?: string | null;
    vendorId?: number | null;
    categoryId?: number | null;
    direction?: LedgerDirection;
    amountMinor: number;
    currency?: string | null;
    vatAmountMinor?: number | null;
    whtAmountMinor?: number | null;
    vatTreatment?: VatTreatment;
    whtTreatment?: WhtTreatment;
    taxCategory?: TaxCategory | null;
    taxEvidenceStatus?: TaxEvidenceStatus;
    filingPeriodKey?: string | null;
    notes?: string | null;
    origin?: TransactionOrigin;
    reviewStatus?: TransactionReviewStatus;
  }
): Promise<LedgerSyncResult> {
  const existingEntry = await tx.ledgerTransaction.findUnique({
    where: {
      sourceDraftId: input.draftId,
    },
    select: {
      id: true,
    },
  });

  const data = {
    clientBusinessId: input.clientBusinessId,
    vendorId: input.vendorId ?? null,
    categoryId: input.categoryId ?? null,
    sourceDraftId: input.draftId,
    createdByUserId: input.actorUserId ?? null,
    transactionDate: input.transactionDate,
    description: input.description.trim() || "Receipt draft",
    reference: input.reference?.trim() || null,
    direction: input.direction ?? ("MONEY_OUT" as const),
    amountMinor: input.amountMinor,
    currency: input.currency?.trim() || "NGN",
    vatAmountMinor: input.vatAmountMinor ?? 0,
    whtAmountMinor: input.whtAmountMinor ?? 0,
    vatTreatment: input.vatTreatment ?? "NONE",
    whtTreatment: input.whtTreatment ?? "NONE",
    taxCategory: input.taxCategory ?? null,
    taxEvidenceStatus: input.taxEvidenceStatus ?? "UNKNOWN",
    filingPeriodKey: input.filingPeriodKey ?? null,
    sourceDocumentNumber: input.sourceDocumentNumber?.trim() || null,
    origin: input.origin ?? "AI_DRAFT",
    reviewStatus: input.reviewStatus ?? "POSTED",
    notes: input.notes?.trim() || null,
  };

  if (existingEntry) {
    await tx.ledgerTransaction.update({
      where: { id: existingEntry.id },
      data,
    });

    return {
      entryId: existingEntry.id,
      created: false,
      updated: true,
      deleted: false,
    };
  }

  const created = await tx.ledgerTransaction.create({
    data,
    select: {
      id: true,
    },
  });

  return {
    entryId: created.id,
    created: true,
    updated: false,
    deleted: false,
  };
}

export async function createTaxEntry(
  tx: PrismaExecutor,
  input: {
    taxPeriodId: number;
    taxType: "VAT" | "WHT";
    actorUserId?: number | null;
  }
): Promise<LedgerSyncResult> {
  const [period, computation] = await Promise.all([
    tx.taxPeriod.findUnique({
      where: { id: input.taxPeriodId },
      select: {
        id: true,
        workspaceId: true,
        clientBusinessId: true,
        periodKey: true,
        label: true,
        endDate: true,
        currency: true,
      },
    }),
    tx.taxComputation.findUnique({
      where: {
        taxPeriodId_taxType: {
          taxPeriodId: input.taxPeriodId,
          taxType: input.taxType,
        },
      },
      select: {
        id: true,
        clientBusinessId: true,
        currency: true,
        status: true,
        netVatMinor: true,
        whtDeductedMinor: true,
        whtSufferedMinor: true,
        exceptionCount: true,
      },
    }),
  ]);

  if (!period || !computation) {
    return {
      entryId: null,
      created: false,
      updated: false,
      deleted: false,
      skippedReason: "missing_tax_computation",
    };
  }

  const reference = buildTaxLedgerReference(period.id, input.taxType);
  const existingEntry = await tx.ledgerTransaction.findFirst({
    where: {
      reference,
    },
    select: {
      id: true,
      clientBusinessId: true,
    },
  });

  const amountMinor =
    input.taxType === "VAT"
      ? Math.max(computation.netVatMinor, 0)
      : Math.max(computation.whtDeductedMinor - computation.whtSufferedMinor, 0);

  if (amountMinor <= 0) {
    if (existingEntry) {
      await tx.ledgerTransaction.delete({
        where: { id: existingEntry.id },
      });

      return {
        entryId: existingEntry.id,
        created: false,
        updated: false,
        deleted: true,
        skippedReason: "no_positive_liability",
      };
    }

    return {
      entryId: null,
      created: false,
      updated: false,
      deleted: false,
      skippedReason: "no_positive_liability",
    };
  }

  const resolvedClientBusinessId =
    period.clientBusinessId ??
    computation.clientBusinessId ??
    existingEntry?.clientBusinessId ??
    (await resolveSingleActiveClientBusinessId(tx, period.workspaceId));

  if (!resolvedClientBusinessId) {
    return {
      entryId: existingEntry?.id ?? null,
      created: false,
      updated: false,
      deleted: false,
      skippedReason: "missing_client_business_mapping",
    };
  }

  const data = {
    clientBusinessId: resolvedClientBusinessId,
    createdByUserId: input.actorUserId ?? null,
    transactionDate: period.endDate,
    description:
      input.taxType === "VAT"
        ? `VAT liability for ${period.label}`
        : `WHT liability for ${period.label}`,
    reference,
    direction: "MONEY_OUT" as LedgerDirection,
    amountMinor,
    currency: computation.currency || period.currency || "NGN",
    vatAmountMinor: 0,
    whtAmountMinor: 0,
    vatTreatment: "NONE" as VatTreatment,
    whtTreatment: "NONE" as WhtTreatment,
    taxCategory: "TAX_PAYMENT" as TaxCategory,
    taxEvidenceStatus: "VERIFIED" as TaxEvidenceStatus,
    filingPeriodKey: period.periodKey,
    sourceDocumentNumber: `${period.periodKey}:${input.taxType}`,
    origin: "MANUAL" as TransactionOrigin,
    reviewStatus: "DRAFT" as TransactionReviewStatus,
    notes: joinNotes(
      `Auto-synced from ${input.taxType} computation for ${period.label}.`,
      `Computation status: ${computation.status}.`,
      computation.exceptionCount > 0
        ? `${computation.exceptionCount} exception(s) remain for review.`
        : "No computation exceptions detected."
    ),
  };

  if (existingEntry) {
    await tx.ledgerTransaction.update({
      where: { id: existingEntry.id },
      data,
    });

    return {
      entryId: existingEntry.id,
      created: false,
      updated: true,
      deleted: false,
    };
  }

  const created = await tx.ledgerTransaction.create({
    data,
    select: { id: true },
  });

  return {
    entryId: created.id,
    created: true,
    updated: false,
    deleted: false,
  };
}
