import "server-only";

import type {
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
  Prisma,
  PrismaClient,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD,
  refreshWorkspaceBankTransactionAutoBookkeepingSignalsInDb,
  writeBankTransactionBookkeepingFeedback,
} from "@/lib/bank-transaction-auto-bookkeeping";
import { writeBankTransactionCategorizationFeedback } from "@/lib/bank-transaction-categorization";
import {
  BANK_TRANSACTION_REVIEW_STATUSES,
  bankTransactionInclude,
  serializeBankTransaction,
  type SerializedReconciliationMatch,
  type SerializedBankTransaction,
} from "@/lib/banking";
import { prisma } from "@/lib/prisma";
import {
  buildManualBankTransactionTaxUpdate,
  resolveBankTransactionTax,
} from "@/lib/transaction-tax";
import {
  hasPrismaDatabaseSupport,
  isPrismaSchemaCompatibilityError,
} from "@/lib/prisma-schema-compat";
import { ensureDefaultTransactionCategoriesForWorkspace } from "@/lib/transaction-categories";
import { logError, logWarn } from "@/lib/logger";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;
export type BankTransactionCategorizationState =
  | "UNCATEGORIZED"
  | "NEEDS_SUGGESTION"
  | "SUGGESTED"
  | "CATEGORIZED";
export type BankTransactionReviewConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const BANK_TRANSACTION_REVIEW_FULL_QUERY_SUPPORT = {
  tables: ["BankTransaction"],
  columns: [
    "BankTransaction.source",
    "BankTransaction.reviewStatus",
    "BankTransaction.postingReadiness",
    "BankTransaction.normalizedMerchantName",
  ],
} as const;
const bankTransactionReviewWarningKeys = new Set<string>();

const legacyBankTransactionReviewSelect = {
  id: true,
  workspaceId: true,
  clientBusinessId: true,
  bankAccountId: true,
  statementImportId: true,
  uploadedByUserId: true,
  matchedLedgerTransactionId: true,
  matchedInvoiceId: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  debitAmountMinor: true,
  creditAmountMinor: true,
  balanceAmountMinor: true,
  type: true,
  status: true,
  sourceRowNumber: true,
  rawRowPayload: true,
  currency: true,
  suggestedType: true,
  suggestedCounterparty: true,
  suggestedCategoryName: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
  suggestedNarrationMeaning: true,
  confidenceScore: true,
  categorizationProvider: true,
  reviewNotes: true,
  matchedAt: true,
  ignoredAt: true,
  createdAt: true,
  updatedAt: true,
  bankAccount: {
    select: {
      id: true,
      name: true,
      bankName: true,
      accountNumber: true,
      currency: true,
    },
  },
  clientBusiness: {
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  },
  statementImport: {
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      importedCount: true,
      duplicateCount: true,
      failedCount: true,
    },
  },
  matches: {
    orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      matchType: true,
      status: true,
      score: true,
      rationale: true,
      matchedAmountMinor: true,
      createdAt: true,
      approvedAt: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          taxAmount: true,
          paymentReference: true,
          client: {
            select: {
              name: true,
              companyName: true,
            },
          },
        },
      },
      taxRecord: {
        select: {
          id: true,
          kind: true,
          amountKobo: true,
          occurredOn: true,
          description: true,
        },
      },
      ledgerTransaction: {
        select: {
          id: true,
          description: true,
          reference: true,
          amountMinor: true,
          transactionDate: true,
          direction: true,
          reviewStatus: true,
          clientBusiness: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      bookkeepingDraft: {
        select: {
          id: true,
          description: true,
          reference: true,
          amountMinor: true,
          direction: true,
          reviewStatus: true,
          vendorName: true,
          suggestedCategoryName: true,
          upload: {
            select: {
              id: true,
              clientBusinessId: true,
              clientBusiness: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },
  splitLines: {
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      description: true,
      reference: true,
      amountMinor: true,
      direction: true,
      currency: true,
      vatAmountMinor: true,
      whtAmountMinor: true,
      vatTreatment: true,
      whtTreatment: true,
      vendor: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      ledgerTransaction: {
        select: {
          id: true,
          reviewStatus: true,
        },
      },
    },
  },
} satisfies Prisma.BankTransactionSelect;

type LegacyBankTransactionReviewRecord = Prisma.BankTransactionGetPayload<{
  select: typeof legacyBankTransactionReviewSelect;
}>;

export type SerializedBankTransactionReviewDashboard = {
  accounts: Array<{
    id: number;
    name: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    currency: string;
    clientBusinessId: number | null;
    clientBusinessName: string | null;
  }>;
  clientBusinesses: Array<{
    id: number;
    name: string;
    defaultCurrency: string;
    categories: Array<{
      id: number;
      name: string;
      type: string;
    }>;
  }>;
  transactions: SerializedBankTransaction[];
  summary: {
    total: number;
    byReviewStatus: Record<BankTransactionReviewStatus, number>;
    lowConfidenceCount: number;
    readyToPostCount: number;
    reviewRequiredCount: number;
    duplicateCount: number;
    suspiciousCount: number;
    pendingSuggestionCount: number;
  };
};

type WorkspaceBankTransactionReviewDataInput = {
  workspaceId: number;
  query?: string | null;
  reviewStatus?: BankTransactionReviewStatus | null;
  categorizationState?: BankTransactionCategorizationState | null;
  confidenceBand?: BankTransactionReviewConfidenceBand | null;
  postingReadiness?: BankTransactionPostingReadiness | null;
  bankAccountId?: number | null;
  clientBusinessId?: number | null;
  categoryId?: number | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

function normalizeString(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isLegacyBankTransactionSchemaError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2022"
  ) {
    const meta = (error as {
      meta?: {
        column?: unknown;
        driverAdapterError?: {
          cause?: {
            column?: unknown;
          };
        };
      };
    }).meta;
    const column =
      typeof meta?.column === "string"
        ? meta.column
        : typeof meta?.driverAdapterError?.cause?.column === "string"
          ? meta.driverAdapterError.cause.column
          : null;

    if (typeof column === "string" && column.startsWith("BankTransaction.")) {
      return true;
    }
  }

  return isPrismaSchemaCompatibilityError(error, {
    tables: ["BankTransaction"],
    columns: [...BANK_TRANSACTION_REVIEW_FULL_QUERY_SUPPORT.columns],
  });
}

function logBankTransactionReviewWarningOnce(
  key: string,
  message: string,
  metadata: Record<string, unknown>
) {
  if (bankTransactionReviewWarningKeys.has(key)) {
    return;
  }

  bankTransactionReviewWarningKeys.add(key);
  logWarn("bank-transaction-review", message, metadata);
}

function buildLegacyBankTransactionWhere(
  input: WorkspaceBankTransactionReviewDataInput,
  normalizedQuery: string
): Prisma.BankTransactionWhereInput {
  let forceNoResults = false;

  if (input.reviewStatus && input.reviewStatus !== "IMPORTED") {
    forceNoResults = true;
  }

  if (input.postingReadiness && input.postingReadiness !== "NOT_READY") {
    forceNoResults = true;
  }

  if (input.categoryId !== undefined && input.categoryId !== null) {
    forceNoResults = true;
  }

  const categorizationWhere: Prisma.BankTransactionWhereInput =
    input.categorizationState === "UNCATEGORIZED" ||
    input.categorizationState === "NEEDS_SUGGESTION"
      ? {
          suggestedCategoryName: null,
        }
      : input.categorizationState === "SUGGESTED"
        ? {
            suggestedCategoryName: {
              not: null,
            },
          }
        : input.categorizationState === "CATEGORIZED"
          ? ((forceNoResults = true), {})
          : {};

  const confidenceWhere: Prisma.BankTransactionWhereInput =
    input.confidenceBand === "LOW"
      ? {
          confidenceScore: {
            lt: AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD,
          },
        }
      : input.confidenceBand === "MEDIUM"
        ? {
            confidenceScore: {
              gte: AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD,
              lt: HIGH_CONFIDENCE_THRESHOLD,
            },
          }
        : input.confidenceBand === "HIGH"
          ? {
              confidenceScore: {
                gte: HIGH_CONFIDENCE_THRESHOLD,
              },
            }
          : {};

  return {
    workspaceId: input.workspaceId,
    ...(forceNoResults ? { id: -1 } : {}),
    ...categorizationWhere,
    ...confidenceWhere,
    bankAccountId: input.bankAccountId ?? undefined,
    clientBusinessId: input.clientBusinessId ?? undefined,
    transactionDate:
      input.dateFrom || input.dateTo
        ? {
            gte: input.dateFrom ?? undefined,
            lte: input.dateTo ?? undefined,
          }
        : undefined,
    OR: normalizedQuery
      ? [
          {
            description: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reference: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reviewNotes: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            suggestedCounterparty: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            suggestedCategoryName: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            bankAccount: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            clientBusiness: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
        ]
      : undefined,
  };
}

function serializeLegacyBankTransactionMatch(
  match: LegacyBankTransactionReviewRecord["matches"][number]
): SerializedReconciliationMatch {
  if (match.ledgerTransaction) {
    return {
      id: match.id,
      matchType: match.matchType,
      status: match.status,
      score: match.score,
      rationale: match.rationale,
      matchedAmountMinor: match.matchedAmountMinor,
      createdAt: match.createdAt.toISOString(),
      approvedAt: match.approvedAt?.toISOString() ?? null,
      target: {
        title: match.ledgerTransaction.description,
        subtitle: `${match.ledgerTransaction.clientBusiness?.name ?? "Ledger"} · ${
          match.ledgerTransaction.reviewStatus
        }`,
        amountMinor: match.ledgerTransaction.amountMinor,
        reference: match.ledgerTransaction.reference ?? null,
        kind: "LEDGER_TRANSACTION",
        linkedId: match.ledgerTransaction.id,
        clientBusinessName: match.ledgerTransaction.clientBusiness?.name ?? null,
      },
    };
  }

  if (match.bookkeepingDraft) {
    return {
      id: match.id,
      matchType: match.matchType,
      status: match.status,
      score: match.score,
      rationale: match.rationale,
      matchedAmountMinor: match.matchedAmountMinor,
      createdAt: match.createdAt.toISOString(),
      approvedAt: match.approvedAt?.toISOString() ?? null,
      target: {
        title: match.bookkeepingDraft.description ?? "Bookkeeping draft",
        subtitle: `${match.bookkeepingDraft.upload.clientBusiness.name} · ${match.bookkeepingDraft.reviewStatus}`,
        amountMinor: match.bookkeepingDraft.amountMinor,
        reference: match.bookkeepingDraft.reference ?? null,
        kind: "BOOKKEEPING_DRAFT",
        linkedId: match.bookkeepingDraft.id,
        clientBusinessName: match.bookkeepingDraft.upload.clientBusiness.name,
      },
    };
  }

  if (match.invoice) {
    return {
      id: match.id,
      matchType: match.matchType,
      status: match.status,
      score: match.score,
      rationale: match.rationale,
      matchedAmountMinor: match.matchedAmountMinor,
      createdAt: match.createdAt.toISOString(),
      approvedAt: match.approvedAt?.toISOString() ?? null,
      target: {
        title: `Invoice ${match.invoice.invoiceNumber}`,
        subtitle: `${match.invoice.client.companyName ?? match.invoice.client.name ?? "Client"} · ${
          match.invoice.status
        }`,
        amountMinor: match.invoice.totalAmount,
        reference: match.invoice.paymentReference ?? match.invoice.invoiceNumber,
        kind: "INVOICE",
        linkedId: match.invoice.id,
        clientBusinessName: null,
      },
    };
  }

  if (match.taxRecord) {
    return {
      id: match.id,
      matchType: match.matchType,
      status: match.status,
      score: match.score,
      rationale: match.rationale,
      matchedAmountMinor: match.matchedAmountMinor,
      createdAt: match.createdAt.toISOString(),
      approvedAt: match.approvedAt?.toISOString() ?? null,
      target: {
        title: match.taxRecord.description ?? "Tax record",
        subtitle: match.taxRecord.kind,
        amountMinor: match.taxRecord.amountKobo,
        reference: null,
        kind: "TAX_RECORD",
        linkedId: match.taxRecord.id,
        clientBusinessName: null,
      },
    };
  }

  return {
    id: match.id,
    matchType: match.matchType,
    status: match.status,
    score: match.score,
    rationale: match.rationale,
    matchedAmountMinor: match.matchedAmountMinor,
    createdAt: match.createdAt.toISOString(),
    approvedAt: match.approvedAt?.toISOString() ?? null,
    target: {
      title: "Manual reconciliation",
      subtitle: null,
      amountMinor: match.matchedAmountMinor,
      reference: null,
      kind: match.matchType,
      linkedId: null,
      clientBusinessName: null,
    },
  };
}

function serializeLegacyBankTransaction(
  transaction: LegacyBankTransactionReviewRecord
): SerializedBankTransaction {
  const resolvedTax = resolveBankTransactionTax({
    amountMinor: transaction.amount,
    description: transaction.description,
    reference: transaction.reference,
    vatTreatment: "NONE",
    whtTreatment: "NONE",
    vatRate: 0,
    whtRate: 0,
    vatAmountMinor: 0,
    whtAmountMinor: 0,
    taxTreatmentSource: "UNSET",
    suggestedVatTreatment: transaction.suggestedVatTreatment,
    suggestedWhtTreatment: transaction.suggestedWhtTreatment,
  });

  const approvedMatch = transaction.matches.find((match) => match.status === "APPROVED") ?? null;
  const serializedApprovedMatch = approvedMatch
    ? serializeLegacyBankTransactionMatch(approvedMatch)
    : null;
  const suggestions = transaction.matches.filter((match) => match.status === "SUGGESTED");
  const suggestionConfidence = transaction.confidenceScore ?? null;

  return {
    id: transaction.id,
    transactionDate: transaction.transactionDate.toISOString(),
    description: transaction.description,
    reference: transaction.reference,
    amountMinor: transaction.amount,
    debitAmountMinor: transaction.debitAmountMinor,
    creditAmountMinor: transaction.creditAmountMinor,
    balanceAmountMinor: transaction.balanceAmountMinor,
    type: transaction.type,
    source: "CSV_IMPORT",
    status: transaction.status,
    reviewStatus: "IMPORTED",
    currency: transaction.currency,
    sourceRowNumber: transaction.sourceRowNumber ?? null,
    reviewNotes: transaction.reviewNotes,
    reviewedAt: null,
    reviewedBy: null,
    bankAccount: {
      id: transaction.bankAccount.id,
      name: transaction.bankAccount.name,
      accountName: transaction.bankAccount.name,
      bankName: transaction.bankAccount.bankName,
      accountNumber: transaction.bankAccount.accountNumber,
      currency: transaction.bankAccount.currency,
    },
    clientBusiness: transaction.clientBusiness
      ? {
          id: transaction.clientBusiness.id,
          name: transaction.clientBusiness.name,
          defaultCurrency: transaction.clientBusiness.defaultCurrency,
        }
      : null,
    statementImport: transaction.statementImport
      ? {
          id: transaction.statementImport.id,
          fileName: transaction.statementImport.fileName,
          status: transaction.statementImport.status,
          createdAt: transaction.statementImport.createdAt.toISOString(),
          importedCount: transaction.statementImport.importedCount,
          duplicateCount: transaction.statementImport.duplicateCount,
          failedCount: transaction.statementImport.failedCount,
        }
      : null,
    category: null,
    suggestedCategory: null,
    vatTreatment: resolvedTax.vatTreatment,
    whtTreatment: resolvedTax.whtTreatment,
    vatRate: resolvedTax.vatRate,
    whtRate: resolvedTax.whtRate,
    vatAmountMinor: resolvedTax.vatAmountMinor,
    whtAmountMinor: resolvedTax.whtAmountMinor,
    taxTreatmentSource: resolvedTax.taxTreatmentSource,
    usesSuggestedTaxFallback: resolvedTax.usesSuggestedFallback,
    suggestionConfidence,
    suggestionReason: null,
    normalizedDescription: null,
    normalizedMerchantName: null,
    autoBookkeepingConfidence: suggestionConfidence,
    autoBookkeepingReason: null,
    autoBookkeepingProvider: transaction.categorizationProvider ?? null,
    autoBookkeepingProcessedAt: null,
    postingReadiness: "NOT_READY",
    possibleDuplicateOf: null,
    duplicateConfidence: null,
    duplicateReason: null,
    suspiciousPatternScore: null,
    suspiciousPatternReason: null,
    matchedLedgerEntryId:
      transaction.matchedLedgerTransactionId ??
      (serializedApprovedMatch?.target.kind === "LEDGER_TRANSACTION"
        ? serializedApprovedMatch.target.linkedId
        : null),
    matchedInvoiceId:
      transaction.matchedInvoiceId ??
      (serializedApprovedMatch?.target.kind === "INVOICE"
        ? serializedApprovedMatch.target.linkedId
        : null),
    categorization: {
      suggestedType: transaction.suggestedType,
      counterpartyName: transaction.suggestedCounterparty,
      suggestedCategoryName: transaction.suggestedCategoryName,
      suggestedVatTreatment: transaction.suggestedVatTreatment,
      suggestedWhtTreatment: transaction.suggestedWhtTreatment,
      narrationMeaning: transaction.suggestedNarrationMeaning,
      confidenceScore: transaction.confidenceScore,
      provider: transaction.categorizationProvider,
      vatRelevance: transaction.suggestedVatTreatment === "NONE" ? "NOT_RELEVANT" : "RELEVANT",
      whtRelevance: transaction.suggestedWhtTreatment === "NONE" ? "NOT_RELEVANT" : "RELEVANT",
      vatRate: resolvedTax.vatRate,
      whtRate: resolvedTax.whtRate,
    },
    approvedMatch: serializedApprovedMatch,
    suggestions: suggestions.map((match) => serializeLegacyBankTransactionMatch(match)),
    splitLines: transaction.splitLines.map((line) => ({
      id: line.id,
      description: line.description,
      reference: line.reference,
      amountMinor: line.amountMinor,
      direction: line.direction,
      currency: line.currency,
      vatAmountMinor: line.vatAmountMinor,
      whtAmountMinor: line.whtAmountMinor,
      vatTreatment: line.vatTreatment,
      whtTreatment: line.whtTreatment,
      vendorName: line.vendor?.name ?? null,
      categoryName: line.category?.name ?? null,
      ledgerTransactionId: line.ledgerTransaction?.id ?? null,
    })),
  };
}

function buildReviewSummary(transactions: SerializedBankTransaction[]) {
  const byReviewStatus = Object.fromEntries(
    BANK_TRANSACTION_REVIEW_STATUSES.map((status) => [status, 0])
  ) as Record<BankTransactionReviewStatus, number>;
  let lowConfidenceCount = 0;
  let readyToPostCount = 0;
  let reviewRequiredCount = 0;
  let duplicateCount = 0;
  let suspiciousCount = 0;
  let pendingSuggestionCount = 0;

  for (const transaction of transactions) {
    byReviewStatus[transaction.reviewStatus] += 1;
    if (
      typeof transaction.autoBookkeepingConfidence === "number" &&
      transaction.autoBookkeepingConfidence < AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD
    ) {
      lowConfidenceCount += 1;
    }
    if (transaction.postingReadiness === "READY_TO_POST") {
      readyToPostCount += 1;
    }
    if (transaction.postingReadiness === "REVIEW_REQUIRED") {
      reviewRequiredCount += 1;
    }
    if ((transaction.duplicateConfidence ?? 0) >= 0.62) {
      duplicateCount += 1;
    }
    if ((transaction.suspiciousPatternScore ?? 0) >= 0.56) {
      suspiciousCount += 1;
    }
    if (transaction.suggestedCategory || transaction.usesSuggestedTaxFallback) {
      pendingSuggestionCount += 1;
    }
  }

  return {
    total: transactions.length,
    byReviewStatus,
    lowConfidenceCount,
    readyToPostCount,
    reviewRequiredCount,
    duplicateCount,
    suspiciousCount,
    pendingSuggestionCount,
  };
}

function buildReviewTrackingFields(
  reviewStatus: BankTransactionReviewStatus,
  actorUserId: number
) {
  if (reviewStatus === "REVIEWED" || reviewStatus === "POSTED" || reviewStatus === "FLAGGED") {
    return {
      reviewedAt: new Date(),
      reviewedByUserId: actorUserId,
    };
  }

  return {
    reviewedAt: null,
    reviewedByUserId: null,
  };
}

function buildClearSuggestionFields(): Prisma.BankTransactionUncheckedUpdateInput {
  return {
    suggestedCategoryId: null,
    suggestionConfidence: null,
    suggestionReason: null,
  };
}

async function getReviewTransactionOrThrow(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      clientBusinessId: true,
      bankAccountId: true,
      categoryId: true,
      suggestedCategoryId: true,
      description: true,
      reference: true,
      transactionDate: true,
      amount: true,
      currency: true,
      status: true,
      reviewStatus: true,
      reviewNotes: true,
      suggestionConfidence: true,
      suggestionReason: true,
      categorizationProvider: true,
      normalizedDescription: true,
      normalizedMerchantName: true,
      autoBookkeepingConfidence: true,
      autoBookkeepingReason: true,
      autoBookkeepingProvider: true,
      autoBookkeepingProcessedAt: true,
      postingReadiness: true,
      possibleDuplicateOfTransactionId: true,
      duplicateConfidence: true,
      duplicateReason: true,
      suspiciousPatternScore: true,
      suspiciousPatternReason: true,
      vatTreatment: true,
      whtTreatment: true,
      vatRate: true,
      whtRate: true,
      vatAmountMinor: true,
      whtAmountMinor: true,
      taxTreatmentSource: true,
      suggestedVatTreatment: true,
      suggestedWhtTreatment: true,
      matchedLedgerTransactionId: true,
      matchedInvoiceId: true,
    },
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  return transaction;
}

async function getSerializedReviewTransaction(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  try {
    const transaction = await db.bankTransaction.findFirst({
      where: {
        id: transactionId,
        workspaceId,
      },
      include: bankTransactionInclude,
    });

    if (!transaction) {
      throw new Error("Transaction not found.");
    }

    return serializeBankTransaction(transaction);
  } catch (error) {
    if (!isLegacyBankTransactionSchemaError(error)) {
      throw error;
    }

    const transaction = await db.bankTransaction.findFirst({
      where: {
        id: transactionId,
        workspaceId,
      },
      select: legacyBankTransactionReviewSelect,
    });

    if (!transaction) {
      throw new Error("Transaction not found.");
    }

    return serializeLegacyBankTransaction(transaction);
  }
}

function assertDeletableTransaction(transaction: {
  status: string;
  reviewStatus: BankTransactionReviewStatus;
  matchedLedgerTransactionId: number | null;
  matchedInvoiceId: number | null;
}) {
  if (
    transaction.status === "MATCHED" ||
    transaction.status === "SPLIT" ||
    transaction.reviewStatus === "POSTED" ||
    transaction.matchedLedgerTransactionId ||
    transaction.matchedInvoiceId
  ) {
    throw new Error(
      "Posted or reconciled transactions cannot be deleted. Reverse the downstream links first."
    );
  }
}

export async function getWorkspaceBankTransactionReviewData(
  input: WorkspaceBankTransactionReviewDataInput
) {
  await ensureDefaultTransactionCategoriesForWorkspace(prisma, input.workspaceId);

  const normalizedQuery = normalizeString(input.query);
  const supportsFullQuery = await hasPrismaDatabaseSupport(
    BANK_TRANSACTION_REVIEW_FULL_QUERY_SUPPORT
  );
  const categorizationWhere: Prisma.BankTransactionWhereInput =
    input.categorizationState === "UNCATEGORIZED"
      ? {
          categoryId: null,
        }
      : input.categorizationState === "NEEDS_SUGGESTION"
        ? {
            categoryId: null,
            suggestedCategoryId: null,
          }
        : input.categorizationState === "SUGGESTED"
          ? {
              suggestedCategoryId: {
                not: null,
              },
            }
          : input.categorizationState === "CATEGORIZED"
        ? {
            categoryId: {
                not: null,
              },
            }
          : {};
  const confidenceWhere: Prisma.BankTransactionWhereInput =
    input.confidenceBand === "LOW"
      ? {
          autoBookkeepingConfidence: {
            lt: AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD,
          },
        }
      : input.confidenceBand === "MEDIUM"
        ? {
            autoBookkeepingConfidence: {
              gte: AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD,
              lt: HIGH_CONFIDENCE_THRESHOLD,
            },
          }
        : input.confidenceBand === "HIGH"
          ? {
              autoBookkeepingConfidence: {
                gte: HIGH_CONFIDENCE_THRESHOLD,
              },
            }
          : {};
  const where: Prisma.BankTransactionWhereInput = {
    workspaceId: input.workspaceId,
    ...categorizationWhere,
    ...confidenceWhere,
    reviewStatus: input.reviewStatus ?? undefined,
    postingReadiness: input.postingReadiness ?? undefined,
    bankAccountId: input.bankAccountId ?? undefined,
    clientBusinessId: input.clientBusinessId ?? undefined,
    categoryId: input.categoryId ?? undefined,
    transactionDate:
      input.dateFrom || input.dateTo
        ? {
            gte: input.dateFrom ?? undefined,
            lte: input.dateTo ?? undefined,
          }
        : undefined,
    OR: normalizedQuery
      ? [
          {
            description: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reference: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            reviewNotes: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            suggestedCounterparty: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            suggestedCategoryName: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            suggestionReason: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            normalizedMerchantName: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            autoBookkeepingReason: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            duplicateReason: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            suspiciousPatternReason: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            category: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            suggestedCategory: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            bankAccount: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            clientBusiness: {
              is: {
                name: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            },
          },
        ]
      : undefined,
  };

  const [accounts, clientBusinesses] = await Promise.all([
    prisma.bankAccount.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        bankName: true,
        accountNumber: true,
        currency: true,
        clientBusinessId: true,
        clientBusiness: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.clientBusiness.findMany({
      where: {
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        defaultCurrency: true,
        categories: {
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    }),
  ]);
  let serializedTransactions: SerializedBankTransaction[];

  if (!supportsFullQuery) {
    logBankTransactionReviewWarningOnce(
      "legacy-review-query",
      "Transaction review is using a legacy-safe query because advanced BankTransaction review columns are unavailable in the current database.",
      {
        workspaceId: input.workspaceId,
        failureKind: "SCHEMA_MISMATCH",
      }
    );

    try {
      const legacyTransactions = await prisma.bankTransaction.findMany({
        where: buildLegacyBankTransactionWhere(input, normalizedQuery),
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        select: legacyBankTransactionReviewSelect,
      });

      serializedTransactions = legacyTransactions.map((transaction) =>
        serializeLegacyBankTransaction(transaction)
      );
    } catch (legacyError) {
      logError(
        "bank-transaction-review",
        "Transaction review fallback query failed.",
        legacyError,
        {
          workspaceId: input.workspaceId,
          failureKind: "QUERY_ERROR",
        }
      );

      throw legacyError;
    }
  } else {
    try {
      const transactions = await prisma.bankTransaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        include: bankTransactionInclude,
      });

      serializedTransactions = transactions.map((transaction) =>
        serializeBankTransaction(transaction)
      );
    } catch (error) {
      if (!isLegacyBankTransactionSchemaError(error)) {
        throw error;
      }

      logBankTransactionReviewWarningOnce(
        "runtime-legacy-review-query",
        "Transaction review hit a runtime schema mismatch and is retrying with a legacy-safe query.",
        {
          workspaceId: input.workspaceId,
          failureKind: "SCHEMA_MISMATCH",
        }
      );

      try {
        const legacyTransactions = await prisma.bankTransaction.findMany({
          where: buildLegacyBankTransactionWhere(input, normalizedQuery),
          orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
          select: legacyBankTransactionReviewSelect,
        });

        serializedTransactions = legacyTransactions.map((transaction) =>
          serializeLegacyBankTransaction(transaction)
        );
      } catch (legacyError) {
        logError(
          "bank-transaction-review",
          "Transaction review fallback query failed.",
          legacyError,
          {
            workspaceId: input.workspaceId,
            failureKind: "QUERY_ERROR",
          }
        );

        throw legacyError;
      }
    }
  }

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      accountName: account.name,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      currency: account.currency,
      clientBusinessId: account.clientBusinessId,
      clientBusinessName: account.clientBusiness?.name ?? null,
    })),
    clientBusinesses,
    transactions: serializedTransactions,
    summary: buildReviewSummary(serializedTransactions),
  } satisfies SerializedBankTransactionReviewDashboard;
}

export async function updateWorkspaceBankTransactionReview(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
  reviewStatus?: BankTransactionReviewStatus;
  reviewNotes?: string | null;
  description?: string;
  reference?: string | null;
  transactionDate?: Date;
  categoryId?: number | null;
  vatTreatment?: VatTreatment;
  whtTreatment?: WhtTreatment;
  vatRate?: number;
  whtRate?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await getReviewTransactionOrThrow(tx, input.workspaceId, input.transactionId);

    let nextClientBusinessId = existing.clientBusinessId;
    let nextCategoryId = existing.categoryId;
    let nextSuggestedCategoryName: string | null | undefined = undefined;

    if (input.categoryId !== undefined) {
      if (input.categoryId === null) {
        nextCategoryId = null;
        nextSuggestedCategoryName = null;
      } else {
        const category = await tx.transactionCategory.findFirst({
          where: {
            id: input.categoryId,
            clientBusiness: {
              workspaceId: input.workspaceId,
              archivedAt: null,
            },
          },
          select: {
            id: true,
            name: true,
            clientBusinessId: true,
          },
        });

        if (!category) {
          throw new Error("The selected category does not belong to this workspace.");
        }

        if (existing.clientBusinessId && existing.clientBusinessId !== category.clientBusinessId) {
          throw new Error(
            "The selected category belongs to a different client business than this transaction."
          );
        }

        nextClientBusinessId = existing.clientBusinessId ?? category.clientBusinessId;
        nextCategoryId = category.id;
        nextSuggestedCategoryName = category.name;
      }
    }

    const nextReviewStatus = input.reviewStatus ?? existing.reviewStatus;
    const nextReviewNotes =
      input.reviewNotes === undefined ? existing.reviewNotes : input.reviewNotes;
    const nextDescription = input.description ?? existing.description;
    const nextReference = input.reference === undefined ? existing.reference : input.reference;
    const nextTransactionDate = input.transactionDate ?? existing.transactionDate;
    const currentResolvedTax = resolveBankTransactionTax({
      amountMinor: existing.amount,
      description: existing.description,
      reference: existing.reference,
      vatTreatment: existing.vatTreatment,
      whtTreatment: existing.whtTreatment,
      vatRate: existing.vatRate,
      whtRate: existing.whtRate,
      vatAmountMinor: existing.vatAmountMinor,
      whtAmountMinor: existing.whtAmountMinor,
      taxTreatmentSource: existing.taxTreatmentSource,
      suggestedVatTreatment: existing.suggestedVatTreatment,
      suggestedWhtTreatment: existing.suggestedWhtTreatment,
    });
    const hasManualTaxUpdate =
      input.vatTreatment !== undefined ||
      input.whtTreatment !== undefined ||
      input.vatRate !== undefined ||
      input.whtRate !== undefined;
    const nextTaxUpdate = hasManualTaxUpdate
      ? buildManualBankTransactionTaxUpdate({
          amountMinor: existing.amount,
          vatTreatment: input.vatTreatment ?? currentResolvedTax.vatTreatment,
          whtTreatment: input.whtTreatment ?? currentResolvedTax.whtTreatment,
          vatRate: input.vatRate ?? currentResolvedTax.vatRate,
          whtRate: input.whtRate ?? currentResolvedTax.whtRate,
        })
      : null;

    const data: Prisma.BankTransactionUncheckedUpdateInput = {};
    const before = {
      reviewStatus: existing.reviewStatus,
      reviewNotes: existing.reviewNotes,
      description: existing.description,
      reference: existing.reference,
      transactionDate: existing.transactionDate.toISOString(),
      categoryId: existing.categoryId,
      vatTreatment: currentResolvedTax.vatTreatment,
      whtTreatment: currentResolvedTax.whtTreatment,
      vatRate: currentResolvedTax.vatRate,
      whtRate: currentResolvedTax.whtRate,
      taxTreatmentSource: existing.taxTreatmentSource,
      suggestedVatTreatment: existing.suggestedVatTreatment,
      suggestedWhtTreatment: existing.suggestedWhtTreatment,
      postingReadiness: existing.postingReadiness,
    };
    const after = {
      reviewStatus: nextReviewStatus,
      reviewNotes: nextReviewNotes,
      description: nextDescription,
      reference: nextReference,
      transactionDate: nextTransactionDate.toISOString(),
      categoryId: nextCategoryId,
      vatTreatment: nextTaxUpdate?.vatTreatment ?? currentResolvedTax.vatTreatment,
      whtTreatment: nextTaxUpdate?.whtTreatment ?? currentResolvedTax.whtTreatment,
      vatRate: nextTaxUpdate?.vatRate ?? currentResolvedTax.vatRate,
      whtRate: nextTaxUpdate?.whtRate ?? currentResolvedTax.whtRate,
      taxTreatmentSource: nextTaxUpdate?.taxTreatmentSource ?? existing.taxTreatmentSource,
      suggestedVatTreatment: existing.suggestedVatTreatment,
      suggestedWhtTreatment: existing.suggestedWhtTreatment,
    };

    if (nextReviewStatus !== existing.reviewStatus) {
      data.reviewStatus = nextReviewStatus;
      Object.assign(data, buildReviewTrackingFields(nextReviewStatus, input.actorUserId));
    }

    if (nextReviewNotes !== existing.reviewNotes) {
      data.reviewNotes = nextReviewNotes;
    }

    if (nextDescription !== existing.description) {
      data.description = nextDescription;
    }

    if (nextReference !== existing.reference) {
      data.reference = nextReference;
    }

    if (nextTransactionDate.getTime() !== existing.transactionDate.getTime()) {
      data.transactionDate = nextTransactionDate;
    }

    if (
      nextTaxUpdate &&
      (nextTaxUpdate.vatTreatment !== existing.vatTreatment ||
        nextTaxUpdate.whtTreatment !== existing.whtTreatment ||
        nextTaxUpdate.vatRate !== existing.vatRate ||
        nextTaxUpdate.whtRate !== existing.whtRate ||
        nextTaxUpdate.vatAmountMinor !== existing.vatAmountMinor ||
        nextTaxUpdate.whtAmountMinor !== existing.whtAmountMinor ||
        nextTaxUpdate.taxTreatmentSource !== existing.taxTreatmentSource)
    ) {
      data.vatTreatment = nextTaxUpdate.vatTreatment;
      data.whtTreatment = nextTaxUpdate.whtTreatment;
      data.vatRate = nextTaxUpdate.vatRate;
      data.whtRate = nextTaxUpdate.whtRate;
      data.vatAmountMinor = nextTaxUpdate.vatAmountMinor;
      data.whtAmountMinor = nextTaxUpdate.whtAmountMinor;
      data.taxTreatmentSource = nextTaxUpdate.taxTreatmentSource;
    }

    if (nextCategoryId !== existing.categoryId) {
      data.categoryId = nextCategoryId;
      data.clientBusinessId = nextClientBusinessId;
      data.suggestedCategoryName = nextSuggestedCategoryName;

      const feedbackDecision =
        nextCategoryId === null
          ? existing.suggestedCategoryId
            ? "REJECTED"
            : null
          : nextCategoryId === existing.suggestedCategoryId
            ? "APPROVED"
            : "MANUAL_OVERRIDE";

      if (feedbackDecision) {
        await writeBankTransactionCategorizationFeedback(tx, {
          workspaceId: input.workspaceId,
          transactionId: input.transactionId,
          actorUserId: input.actorUserId,
          decision: feedbackDecision,
          suggestedCategoryId: existing.suggestedCategoryId,
          selectedCategoryId: nextCategoryId,
          suggestionConfidence: existing.suggestionConfidence,
          suggestionReason: existing.suggestionReason,
          provider: existing.categorizationProvider,
        });
      }

      Object.assign(data, buildClearSuggestionFields());
    } else if (
      nextSuggestedCategoryName !== undefined &&
      nextSuggestedCategoryName !== null &&
      nextClientBusinessId !== existing.clientBusinessId
    ) {
      data.clientBusinessId = nextClientBusinessId;
      data.suggestedCategoryName = nextSuggestedCategoryName;
    } else if (nextSuggestedCategoryName === null && input.categoryId !== undefined) {
      data.suggestedCategoryName = null;
    }

    if (Object.keys(data).length === 0) {
      return {
        updated: false,
        transaction: await getSerializedReviewTransaction(
          tx,
          input.workspaceId,
          input.transactionId
        ),
      };
    }

    await tx.bankTransaction.update({
      where: {
        id: input.transactionId,
      },
      data,
    });

    if (
      nextCategoryId !== existing.categoryId ||
      (nextTaxUpdate &&
        (nextTaxUpdate.vatTreatment !== currentResolvedTax.vatTreatment ||
          nextTaxUpdate.whtTreatment !== currentResolvedTax.whtTreatment ||
          nextTaxUpdate.vatRate !== currentResolvedTax.vatRate ||
          nextTaxUpdate.whtRate !== currentResolvedTax.whtRate))
    ) {
      await writeBankTransactionBookkeepingFeedback(tx, {
        workspaceId: input.workspaceId,
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        decision:
          nextCategoryId !== existing.categoryId &&
          nextCategoryId !== null &&
          nextCategoryId === existing.suggestedCategoryId &&
          !nextTaxUpdate
            ? "APPROVED"
            : "MANUAL_OVERRIDE",
        suggestedCategoryId: existing.suggestedCategoryId,
        selectedCategoryId: nextCategoryId,
        suggestedVatTreatment: existing.suggestedVatTreatment,
        selectedVatTreatment: nextTaxUpdate?.vatTreatment ?? currentResolvedTax.vatTreatment,
        suggestedWhtTreatment: existing.suggestedWhtTreatment,
        selectedWhtTreatment: nextTaxUpdate?.whtTreatment ?? currentResolvedTax.whtTreatment,
        suggestedConfidence: existing.suggestionConfidence,
        duplicateConfidence: existing.duplicateConfidence,
        suspiciousPatternScore: existing.suspiciousPatternScore,
        postingReadiness: existing.postingReadiness,
        provider: existing.autoBookkeepingProvider ?? existing.categorizationProvider ?? null,
        reason: existing.autoBookkeepingReason ?? existing.suggestionReason ?? null,
        note: nextReviewNotes ?? null,
      });
    }

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_REVIEW_UPDATED",
      metadata: {
        transactionId: input.transactionId,
        before,
        after,
      },
    });

    return {
      updated: true,
      transaction: await refreshWorkspaceBankTransactionAutoBookkeepingSignalsInDb(tx, {
        workspaceId: input.workspaceId,
        transactionId: input.transactionId,
      }),
    };
  });
}

export async function bulkUpdateWorkspaceBankTransactionReviewStatus(input: {
  workspaceId: number;
  actorUserId: number;
  transactionIds: number[];
  reviewStatus: BankTransactionReviewStatus;
}) {
  return prisma.$transaction(async (tx) => {
    const transactions = await tx.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: {
          in: input.transactionIds,
        },
      },
      select: {
        id: true,
        reviewStatus: true,
      },
    });

    if (transactions.length !== input.transactionIds.length) {
      throw new Error("One or more selected transactions could not be found.");
    }

    const changedTransactions = transactions.filter(
      (transaction) => transaction.reviewStatus !== input.reviewStatus
    );

    for (const transaction of changedTransactions) {
      await tx.bankTransaction.update({
        where: {
          id: transaction.id,
        },
        data: {
          reviewStatus: input.reviewStatus,
          ...buildReviewTrackingFields(input.reviewStatus, input.actorUserId),
        },
      });
      await refreshWorkspaceBankTransactionAutoBookkeepingSignalsInDb(tx, {
        workspaceId: input.workspaceId,
        transactionId: transaction.id,
      });
    }

    if (changedTransactions.length > 0) {
      await writeAuditLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "BANK_TRANSACTION_REVIEW_BULK_UPDATED",
        metadata: {
          transactionIds: changedTransactions.map((transaction) => transaction.id),
          reviewStatus: input.reviewStatus,
          previousReviewStatuses: changedTransactions.map((transaction) => ({
            transactionId: transaction.id,
            reviewStatus: transaction.reviewStatus,
          })),
        },
      });
    }

    return {
      updatedCount: changedTransactions.length,
      skippedCount: transactions.length - changedTransactions.length,
    };
  });
}

export async function deleteWorkspaceBankTransaction(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await getReviewTransactionOrThrow(tx, input.workspaceId, input.transactionId);
    assertDeletableTransaction(existing);

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_DELETED",
      metadata: {
        transactionId: existing.id,
        bankAccountId: existing.bankAccountId,
        clientBusinessId: existing.clientBusinessId,
        amountMinor: existing.amount,
        currency: existing.currency,
        description: existing.description,
        reference: existing.reference,
        transactionDate: existing.transactionDate.toISOString(),
        status: existing.status,
        reviewStatus: existing.reviewStatus,
      },
    });

    await tx.bankTransaction.delete({
      where: {
        id: input.transactionId,
      },
    });

    return {
      ok: true,
    };
  });
}
