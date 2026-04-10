import "server-only";

import type {
  BankTransactionBusinessType,
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
  BankTransactionSource,
  BankTransactionStatus,
  BankTransactionTaxTreatmentSource,
  BankTransactionType,
  DraftReviewStatus,
  LedgerDirection,
  Prisma,
  PrismaClient,
  ReconciliationMatchStatus,
  ReconciliationMatchType,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import { createBankTransactionFingerprintHash } from "@/lib/bank-transaction-fingerprint";
import {
  type DuplicateComparableBankTransaction,
  detectPotentialBankTransactionDuplicate,
} from "@/lib/bank-transaction-duplicates";
import { normalizeBankTransactionText } from "@/lib/bank-transaction-normalization";
import { prisma } from "@/lib/prisma";
import { buildFallbackTextSuggestion, extractOutputText } from "@/lib/bookkeeping-ai";
import { getOpenAiServerConfig, hasOpenAiServerConfig } from "@/lib/env";
import { createIncomeEntryFromInvoice } from "@/lib/ledger";
import { NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";
import {
  buildSuggestedBankTransactionTaxUpdate,
  estimateInclusiveVat,
  estimateWithholdingTax,
  resolveBankTransactionTax,
} from "@/lib/transaction-tax";
import { ensureDefaultTransactionCategoriesForWorkspace } from "@/lib/transaction-categories";
import { logError } from "@/lib/logger";
import {
  recalculateBookkeepingUploadStatus,
  resolveCategoryForDraft,
  resolveVendorForDraft,
} from "@/lib/bookkeeping-review";
import { ensureInvoiceIncomeTaxRecord } from "@/lib/invoice-payments";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

export type BankTransactionRecord = Prisma.BankTransactionGetPayload<{
  include: typeof bankTransactionInclude;
}>;

export const bankTransactionInclude = {
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
  category: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  suggestedCategory: {
    select: {
      id: true,
      name: true,
      type: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  possibleDuplicateOf: {
    select: {
      id: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
    },
  },
  matches: {
    orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "asc" }],
    include: {
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
    include: {
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
} satisfies Prisma.BankTransactionInclude;

export const BANK_TRANSACTION_STATUSES = [
  "UNMATCHED",
  "SUGGESTED",
  "MATCHED",
  "IGNORED",
  "SPLIT",
  "REVIEW_REQUIRED",
] as const satisfies readonly BankTransactionStatus[];

export const BANK_TRANSACTION_REVIEW_STATUSES = [
  "IMPORTED",
  "PENDING_REVIEW",
  "REVIEWED",
  "POSTED",
  "FLAGGED",
] as const satisfies readonly BankTransactionReviewStatus[];

export type BankingDashboardLoadStatus = "ok" | "error" | "no_workspace";

export type BankImportField =
  | "transactionDate"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "balance"
  | "reference";

export type BankImportColumnMapping = Record<BankImportField, string | null>;

export type BankImportPreview = {
  headers: string[];
  suggestedMapping: BankImportColumnMapping;
  previewRows: Array<Record<string, string>>;
  guidance: string[];
};

export type BankImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type BankImportSummaryStatus =
  | "completed"
  | "completed_with_warnings"
  | "empty";

export type BankImportCategorizationStatus = "applied" | "skipped" | "error";
export type BankImportCategorizationMode =
  | "real_provider"
  | "fallback_heuristic"
  | "hybrid_mode";
export type BankImportTaxMode = "suggested_defaults" | "safe_defaults";

export type BankImportSummary = {
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  invalidRows: number;
  status: BankImportSummaryStatus;
};

export type BankImportCategorizationSummary = {
  status: BankImportCategorizationStatus;
  processedRows: number;
  suggestedRows: number;
  uncategorizedRows: number;
  provider: string;
  warning: string | null;
};

export type BankImportLinks = {
  reviewQueueHref: string;
  transactionEngineHref: string;
  taxCenterHref: string;
};

export type BankImportPipelineSummary = {
  rowsReceived: number;
  rowsImported: number;
  rowsSkippedAsDuplicates: number;
  rowsInvalid: number;
  rowsQueuedForReview: number;
  rowsCategorized: number;
  rowsFlaggedForTaxReview: number;
  warnings: string[];
  errors: BankImportRowError[];
  categorizationMode: BankImportCategorizationMode;
  taxMode: BankImportTaxMode;
};

export type BankImportResult = {
  importId: number | null;
  summary: BankImportSummary;
  errors: BankImportRowError[];
  guidance: string[];
  createdTransactionIds: number[];
  categorization: BankImportCategorizationSummary;
  pipeline: BankImportPipelineSummary;
  links: BankImportLinks;
};

const BANK_IMPORT_FIELD_ORDER: BankImportField[] = [
  "transactionDate",
  "description",
  "reference",
  "debit",
  "credit",
  "amount",
  "balance",
];

const BANK_IMPORT_FIELD_META: Record<
  BankImportField,
  {
    aliases: string[];
    label: string;
    sampleKind: "date" | "money" | "text" | "reference";
  }
> = {
  transactionDate: {
    aliases: [
      "date",
      "transactiondate",
      "valuedate",
      "posteddate",
      "postingdate",
      "entrydate",
      "bookingdate",
    ],
    label: "Transaction date",
    sampleKind: "date",
  },
  description: {
    aliases: [
      "description",
      "details",
      "narration",
      "memo",
      "remark",
      "transactiondescription",
      "transactiondetails",
      "particulars",
    ],
    label: "Description",
    sampleKind: "text",
  },
  debit: {
    aliases: [
      "debit",
      "withdrawal",
      "withdrawalamount",
      "outflow",
      "dr",
      "paidout",
    ],
    label: "Debit",
    sampleKind: "money",
  },
  credit: {
    aliases: [
      "credit",
      "deposit",
      "depositamount",
      "inflow",
      "cr",
      "paidin",
    ],
    label: "Credit",
    sampleKind: "money",
  },
  amount: {
    aliases: ["amount", "amt", "transactionamount", "value", "signedamount"],
    label: "Amount",
    sampleKind: "money",
  },
  balance: {
    aliases: [
      "balance",
      "runningbalance",
      "closingbalance",
      "availablebalance",
      "ledgerbalance",
    ],
    label: "Balance",
    sampleKind: "money",
  },
  reference: {
    aliases: [
      "reference",
      "ref",
      "transactionreference",
      "transactionid",
      "sessionid",
      "rrn",
      "paymentreference",
      "serialno",
      "traceid",
      "id",
    ],
    label: "Reference",
    sampleKind: "reference",
  },
};

export type SerializedBankingDashboard = {
  status: BankingDashboardLoadStatus;
  error: string | null;
  accounts: Array<{
    id: number;
    name: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    currency: string;
    clientBusinessId: number | null;
    clientBusinessName: string | null;
    createdAt: string;
    updatedAt: string;
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
  imports: Array<{
    id: number;
    fileName: string;
    status: string;
    createdAt: string;
    processedAt: string | null;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    failedCount: number;
    warningCount: number;
    bankAccount: {
      id: number;
      name: string;
      accountName: string;
    };
    clientBusiness: {
      id: number;
      name: string;
    } | null;
    uploadedByName: string | null;
  }>;
  invoiceOptions: Array<{
    id: number;
    invoiceNumber: string;
    clientName: string;
    status: string;
    totalAmount: number;
    paymentReference: string | null;
    issueDate: string;
    dueDate: string;
  }>;
  ledgerOptions: Array<{
    id: number;
    description: string;
    reference: string | null;
    amountMinor: number;
    currency: string;
    direction: LedgerDirection;
    reviewStatus: string;
    transactionDate: string;
    clientBusinessId: number;
    clientBusinessName: string;
  }>;
  transactions: SerializedBankTransaction[];
  summary: {
    total: number;
    byStatus: Record<BankTransactionStatus, number>;
  };
  aiConfigured: boolean;
};

export type SerializedBankTransaction = {
  id: number;
  transactionDate: string;
  description: string;
  reference: string | null;
  amountMinor: number;
  debitAmountMinor: number | null;
  creditAmountMinor: number | null;
  balanceAmountMinor: number | null;
  type: BankTransactionType;
  source: BankTransactionSource;
  status: BankTransactionStatus;
  reviewStatus: BankTransactionReviewStatus;
  currency: string;
  sourceRowNumber: number | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: {
    id: number;
    fullName: string;
    email: string;
  } | null;
  bankAccount: {
    id: number;
    name: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    currency: string;
  };
  clientBusiness: {
    id: number;
    name: string;
    defaultCurrency: string;
  } | null;
  statementImport: {
    id: number;
    fileName: string;
    status: string;
    createdAt: string;
    importedCount: number;
    duplicateCount: number;
    failedCount: number;
  } | null;
  category: {
    id: number;
    name: string;
    type: string;
  } | null;
  suggestedCategory: {
    id: number;
    name: string;
    type: string;
  } | null;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  vatRate: number;
  whtRate: number;
  vatAmountMinor: number;
  whtAmountMinor: number;
  taxTreatmentSource: BankTransactionTaxTreatmentSource;
  usesSuggestedTaxFallback: boolean;
  suggestionConfidence: number | null;
  suggestionReason: string | null;
  normalizedDescription: string | null;
  normalizedMerchantName: string | null;
  autoBookkeepingConfidence: number | null;
  autoBookkeepingReason: string | null;
  autoBookkeepingProvider: string | null;
  autoBookkeepingProcessedAt: string | null;
  postingReadiness: BankTransactionPostingReadiness;
  possibleDuplicateOf: {
    id: number;
    transactionDate: string;
    description: string;
    reference: string | null;
    amountMinor: number;
  } | null;
  duplicateConfidence: number | null;
  duplicateReason: string | null;
  suspiciousPatternScore: number | null;
  suspiciousPatternReason: string | null;
  matchedLedgerEntryId: number | null;
  matchedInvoiceId: number | null;
  categorization: {
    suggestedType: BankTransactionBusinessType;
    counterpartyName: string | null;
    suggestedCategoryName: string | null;
    suggestedVatTreatment: VatTreatment;
    suggestedWhtTreatment: WhtTreatment;
    narrationMeaning: string | null;
    confidenceScore: number | null;
    provider: string | null;
    vatRelevance: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
    whtRelevance: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
    vatRate: number;
    whtRate: number;
  };
  approvedMatch: SerializedReconciliationMatch | null;
  suggestions: SerializedReconciliationMatch[];
  splitLines: Array<{
    id: number;
    description: string;
    reference: string | null;
    amountMinor: number;
    direction: LedgerDirection;
    currency: string;
    vatAmountMinor: number;
    whtAmountMinor: number;
    vatTreatment: VatTreatment;
    whtTreatment: WhtTreatment;
    vendorName: string | null;
    categoryName: string | null;
    ledgerTransactionId: number | null;
  }>;
};

export type SerializedReconciliationMatch = {
  id: number;
  matchType: ReconciliationMatchType;
  status: ReconciliationMatchStatus;
  score: number;
  rationale: string | null;
  matchedAmountMinor: number | null;
  createdAt: string;
  approvedAt: string | null;
  target: {
    title: string;
    subtitle: string | null;
    amountMinor: number | null;
    reference: string | null;
    kind: string;
    linkedId: number | null;
    clientBusinessName: string | null;
  };
};

type ParsedBankImportRow = {
  rowNumber: number;
  transactionDate: Date;
  description: string;
  reference: string | null;
  amountMinor: number;
  debitAmountMinor: number | null;
  creditAmountMinor: number | null;
  balanceAmountMinor: number | null;
  type: BankTransactionType;
  rawRowPayload: string;
};

type CategorizationResult = {
  suggestedType: BankTransactionBusinessType;
  suggestedCounterparty: string | null;
  suggestedCategoryName: string | null;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
  suggestedNarrationMeaning: string | null;
  confidenceScore: number;
  categorizationProvider: string;
  suggestionReason: string | null;
};

type MatchCandidate = {
  matchType: ReconciliationMatchType;
  score: number;
  matchedAmountMinor: number | null;
  rationale: string;
  invoiceId?: number;
  ledgerTransactionId?: number;
  bookkeepingDraftId?: number;
  taxRecordId?: number;
};

type CreateLedgerInput = {
  transactionId: number;
  clientBusinessId?: number | null;
  description?: string | null;
  reference?: string | null;
  vendorName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  suggestedType?: BankTransactionBusinessType | null;
  vatTreatment?: VatTreatment | null;
  whtTreatment?: WhtTreatment | null;
  vatAmountMinor?: number | null;
  whtAmountMinor?: number | null;
  notes?: string | null;
};

type LinkInvoiceInput = {
  transactionId: number;
  invoiceId: number;
  clientBusinessId?: number | null;
};

type ParsedCsvResult = {
  rows: string[][];
  issues: string[];
};

type BankImportCategorizationContext = {
  status: BankImportCategorizationStatus;
  provider: string;
  usedOpenAi: boolean;
  warning: string | null;
};

type BankImportPipelineRowOutcome = {
  reviewQueued: boolean;
  categorized: boolean;
  taxReviewRequired: boolean;
  taxMode: BankImportTaxMode;
};

type LinkLedgerInput = {
  transactionId: number;
  ledgerTransactionId: number;
  clientBusinessId?: number | null;
};

type SplitLineInput = {
  description: string;
  reference?: string | null;
  amountMinor: number;
  vendorName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  suggestedType?: BankTransactionBusinessType | null;
  vatTreatment?: VatTreatment | null;
  whtTreatment?: WhtTreatment | null;
  vatAmountMinor?: number | null;
  whtAmountMinor?: number | null;
  notes?: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampNumber(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function joinReasonParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => normalizeString(part))
    .filter(Boolean)
    .slice(0, 4)
    .join("; ");
}

function isUniqueConstraintError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function normalizeCategoryLookupKey(value: string | null | undefined) {
  return normalizeString(value).toLowerCase();
}

function buildImportCategorizationMode(input: BankImportCategorizationContext) {
  if (input.status === "error") {
    return "fallback_heuristic" as const;
  }

  if (input.usedOpenAi) {
    return "hybrid_mode" as const;
  }

  return input.provider === "openai" ? "real_provider" : "fallback_heuristic";
}

function buildImportSummaryStatus(input: {
  totalRows: number;
  duplicateRows: number;
  invalidRows: number;
  warningCount?: number;
}) {
  if (input.totalRows <= 0) {
    return "empty" as const;
  }

  if (
    input.duplicateRows > 0 ||
    input.invalidRows > 0 ||
    (input.warningCount ?? 0) > 0
  ) {
    return "completed_with_warnings" as const;
  }

  return "completed" as const;
}

function buildBankImportLinks(input: {
  importId: number | null;
  createdTransactionIds: number[];
}) {
  const reviewParams = new URLSearchParams();
  if (input.createdTransactionIds.length > 0) {
    reviewParams.set("transactionId", String(input.createdTransactionIds[0]));
  }

  return {
    reviewQueueHref: `/dashboard/banking/review${
      reviewParams.toString() ? `?${reviewParams.toString()}` : ""
    }`,
    transactionEngineHref: "/dashboard/banking",
    taxCenterHref: "/dashboard/tax-center",
  } satisfies BankImportLinks;
}

function buildEmptyCategorizationSummary(
  provider = hasOpenAiServerConfig() ? "heuristic+openai" : "heuristic"
) {
  return {
    status: "skipped",
    processedRows: 0,
    suggestedRows: 0,
    uncategorizedRows: 0,
    provider,
    warning: null,
  } satisfies BankImportCategorizationSummary;
}

function buildImportResult(input: {
  importId: number | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  invalidRows: number;
  errors: BankImportRowError[];
  guidance: string[];
  createdTransactionIds: number[];
  categorization?: BankImportCategorizationSummary;
  pipeline?: BankImportPipelineSummary;
}) {
  const summary = {
    totalRows: input.totalRows,
    importedRows: input.importedRows,
    duplicateRows: input.duplicateRows,
    invalidRows: input.invalidRows,
    status: buildImportSummaryStatus({
      totalRows: input.totalRows,
      duplicateRows: input.duplicateRows,
      invalidRows: input.invalidRows,
      warningCount: input.guidance.length,
    }),
  } satisfies BankImportSummary;

  return {
    importId: input.importId,
    summary,
    errors: input.errors,
    guidance: input.guidance,
    createdTransactionIds: input.createdTransactionIds,
    categorization: input.categorization ?? buildEmptyCategorizationSummary(),
    pipeline:
      input.pipeline ??
      ({
        rowsReceived: input.totalRows,
        rowsImported: input.importedRows,
        rowsSkippedAsDuplicates: input.duplicateRows,
        rowsInvalid: input.invalidRows,
        rowsQueuedForReview: input.importedRows,
        rowsCategorized: 0,
        rowsFlaggedForTaxReview: 0,
        warnings: input.guidance,
        errors: input.errors,
        categorizationMode: hasOpenAiServerConfig()
          ? "hybrid_mode"
          : "fallback_heuristic",
        taxMode: "safe_defaults",
      } satisfies BankImportPipelineSummary),
    links: buildBankImportLinks({
      importId: input.importId,
      createdTransactionIds: input.createdTransactionIds,
    }),
  } satisfies BankImportResult;
}

function buildCategorizationSuggestionReason(input: {
  suggestedCategoryName: string | null;
  suggestedCounterparty: string | null;
  suggestedNarrationMeaning: string | null;
  confidenceScore: number;
}) {
  const reasonParts: string[] = [];

  if (input.suggestedCategoryName) {
    reasonParts.push(`Mapped to ${input.suggestedCategoryName}.`);
  }

  if (input.suggestedCounterparty) {
    reasonParts.push(`Counterparty signal: ${input.suggestedCounterparty}.`);
  }

  if (input.suggestedNarrationMeaning) {
    reasonParts.push(input.suggestedNarrationMeaning);
  }

  reasonParts.push(`${Math.round(input.confidenceScore * 100)}% confidence.`);
  return reasonParts.join(" ").trim();
}

function shouldPersistSuggestedTaxValues(input: {
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
}) {
  return (
    input.suggestedVatTreatment === "EXEMPT" ||
    input.suggestedVatTreatment !== "NONE" ||
    input.suggestedWhtTreatment !== "NONE"
  );
}

function buildImportPostingReadiness(input: {
  suggestedCategoryId: number | null;
  confidenceScore: number;
  duplicateConfidence: number | null;
  taxReviewRequired: boolean;
}) {
  if (!input.suggestedCategoryId) {
    return "NOT_READY" satisfies BankTransactionPostingReadiness;
  }

  if (
    input.taxReviewRequired ||
    (input.duplicateConfidence ?? 0) >= 0.62 ||
    input.confidenceScore < 0.7
  ) {
    return "REVIEW_REQUIRED" satisfies BankTransactionPostingReadiness;
  }

  return "READY_TO_POST" satisfies BankTransactionPostingReadiness;
}

function buildImportAutoBookkeepingConfidence(input: {
  confidenceScore: number;
  suggestedCategoryId: number | null;
  duplicateConfidence: number | null;
  taxReviewRequired: boolean;
}) {
  let value = input.confidenceScore;
  if (input.suggestedCategoryId) {
    value += 0.05;
  }
  if (input.taxReviewRequired) {
    value -= 0.08;
  }
  if (input.duplicateConfidence) {
    value -= input.duplicateConfidence * 0.2;
  }

  return Number(clampNumber(value, 0.18, 0.98).toFixed(4));
}

function buildImportAutoBookkeepingReason(input: {
  suggestionReason: string | null;
  duplicateReason: string | null;
  taxReviewRequired: boolean;
}) {
  return (
    joinReasonParts([
      input.suggestionReason,
      input.taxReviewRequired
        ? "Tax treatment was suggested conservatively and should be reviewed before posting."
        : "No strong tax adjustment was identified during import.",
      input.duplicateReason,
    ]) || null
  );
}

function toImportDuplicateComparableTransaction(input: {
  id: number;
  bankAccountId: number;
  transactionDate: Date;
  amount: number;
  type: BankTransactionType;
  description: string;
  reference: string | null;
  normalizedDescription: string | null;
  normalizedMerchantName: string | null;
}) {
  return {
    id: input.id,
    bankAccountId: input.bankAccountId,
    transactionDate: input.transactionDate,
    amount: input.amount,
    type: input.type,
    description: input.description,
    reference: input.reference,
    normalizedDescription: input.normalizedDescription,
    normalizedMerchantName: input.normalizedMerchantName,
  } satisfies DuplicateComparableBankTransaction;
}

function assertTransactionCanCreateOrApproveMatch(transaction: {
  status: BankTransactionStatus;
  matchedLedgerTransactionId?: number | null;
  matchedInvoiceId?: number | null;
}, actionLabel: string) {
  if (transaction.status === "MATCHED" || transaction.status === "SPLIT") {
    throw new Error(`This bank transaction is already reconciled. Clear the existing match before you ${actionLabel}.`);
  }

  if (transaction.status === "IGNORED") {
    throw new Error(`This bank transaction is ignored. Reclassify it before you ${actionLabel}.`);
  }
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenizeHeader(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isBlankRow(values: string[]) {
  return values.every((value) => value.trim() === "");
}

function countDelimiterOccurrences(line: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
}

function detectCsvDelimiter(content: string) {
  const candidates = [",", ";", "\t", "|"] as const;
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (lines.length === 0) {
    return ",";
  }

  let bestDelimiter = ",";
  let bestScore = -1;

  candidates.forEach((delimiter) => {
    const counts = lines.map((line) => countDelimiterOccurrences(line, delimiter));
    const nonZeroCounts = counts.filter((count) => count > 0);
    if (nonZeroCounts.length === 0) {
      return;
    }

    const min = Math.min(...nonZeroCounts);
    const max = Math.max(...nonZeroCounts);
    const average = nonZeroCounts.reduce((sum, count) => sum + count, 0) / nonZeroCounts.length;
    const stabilityPenalty = max - min;
    const score = average - stabilityPenalty * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  });

  return bestDelimiter;
}

function parseCsv(content: string): ParsedCsvResult {
  const normalizedContent = content.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(normalizedContent);
  const rows: string[][] = [];
  const issues: string[] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalizedContent.length; index += 1) {
    const char = normalizedContent[index];
    const next = normalizedContent[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (!isBlankRow(row)) {
        rows.push(row);
      }
      current = "";
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (!isBlankRow(row)) {
      rows.push(row);
    }
  }

  if (inQuotes) {
    issues.push(
      "The CSV contains an unclosed quoted field. Re-export the statement as CSV and try again."
    );
  }

  return {
    rows,
    issues,
  };
}

function buildCsvStructureGuidance(rows: string[][]) {
  if (rows.length <= 1) {
    return [] as string[];
  }

  const headerColumns = rows[0]?.length ?? 0;
  if (headerColumns === 0) {
    return [] as string[];
  }

  const mismatchedCount = rows
    .slice(1)
    .filter((row) => row.length !== headerColumns)
    .length;

  if (mismatchedCount === 0) {
    return [] as string[];
  }

  return [
    `${mismatchedCount} row${
      mismatchedCount === 1 ? " has" : "s have"
    } a different column count from the header. Check for stray commas or broken quotes before importing.`,
  ];
}

function parseFlexibleDate(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (yearFirst) {
    const parsed = new Date(
      Date.UTC(Number(yearFirst[1]), Number(yearFirst[2]) - 1, Number(yearFirst[3]), 12)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (dayFirst) {
    const parsed = new Date(
      Date.UTC(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]), 12)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMinorAmount(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/[₦$£€,]/g, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/\s+/g, "")
    .replace(/CR$/i, "")
    .replace(/DR$/i, "");

  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function buildDefaultMapping(): BankImportColumnMapping {
  return {
    transactionDate: null,
    description: null,
    debit: null,
    credit: null,
    amount: null,
    balance: null,
    reference: null,
  };
}

function getHeaderSampleValues(
  headers: string[],
  previewRows: Array<Record<string, string>>
) {
  return Object.fromEntries(
    headers.map((header) => [
      header,
      previewRows
        .map((row) => normalizeString(row[header] ?? ""))
        .filter(Boolean)
        .slice(0, 3),
    ])
  ) as Record<string, string[]>;
}

function extractReferenceLikeTokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && /[a-z]/.test(token) && /\d/.test(token));
}

function scoreHeaderForField(
  header: string,
  sampleValues: string[],
  field: BankImportField
) {
  const meta = BANK_IMPORT_FIELD_META[field];
  const normalized = normalizeHeader(header);
  const headerTokens = tokenizeHeader(header);
  const reasons: string[] = [];
  let score = 0;

  if (meta.aliases.includes(normalized)) {
    score += 0.78;
    reasons.push("header label matched exactly");
  } else if (meta.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
    score += 0.58;
    reasons.push("header label is a close match");
  } else if (
    headerTokens.some((token) =>
      meta.aliases.some((alias) => alias.includes(token) || token.includes(alias))
    )
  ) {
    score += 0.28;
    reasons.push("header keyword is similar");
  }

  const populatedSamples = sampleValues.filter(Boolean);
  const dateHits = populatedSamples.filter((value) => parseFlexibleDate(value)).length;
  const moneyHits = populatedSamples.filter((value) => parseMinorAmount(value) !== null).length;
  const referenceHits = populatedSamples.filter(
    (value) => extractReferenceLikeTokens(value).length > 0
  ).length;
  const longTextHits = populatedSamples.filter(
    (value) => value.length >= 10 || /\s/.test(value.trim())
  ).length;

  if (meta.sampleKind === "date") {
    if (dateHits >= Math.max(1, Math.ceil(populatedSamples.length / 2))) {
      score += 0.24;
      reasons.push("sample values look like dates");
    }
  } else if (meta.sampleKind === "money") {
    if (moneyHits >= Math.max(1, Math.ceil(populatedSamples.length / 2))) {
      score += 0.2;
      reasons.push("sample values look like money amounts");
    }
  } else if (meta.sampleKind === "reference") {
    if (referenceHits >= 1) {
      score += 0.18;
      reasons.push("sample values look like payment references");
    }
  } else if (meta.sampleKind === "text") {
    if (longTextHits >= Math.max(1, Math.ceil(populatedSamples.length / 2))) {
      score += 0.16;
      reasons.push("sample values look like narrations");
    }
  }

  return {
    score,
    rationale:
      reasons[0] ??
      (populatedSamples.length > 0 ? "sample values are available for review" : "header needs manual review"),
  };
}

function minimumSuggestedScore(field: BankImportField) {
  return field === "reference" || field === "balance" ? 0.32 : 0.42;
}

export function buildSuggestedBankImportMapping(
  headers: string[],
  previewRows: Array<Record<string, string>> = []
) {
  const mapping = buildDefaultMapping();
  const usedHeaders = new Set<string>();
  const sampleValuesByHeader = getHeaderSampleValues(headers, previewRows);

  BANK_IMPORT_FIELD_ORDER.forEach((field) => {
    const rankedHeaders = headers
      .filter((header) => !usedHeaders.has(header))
      .map((header) => ({
        header,
        ...scoreHeaderForField(header, sampleValuesByHeader[header] ?? [], field),
      }))
      .filter((candidate) => candidate.score >= minimumSuggestedScore(field))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.header.localeCompare(right.header);
      });

    const best = rankedHeaders[0];
    if (!best) {
      return;
    }

    mapping[field] = best.header;
    usedHeaders.add(best.header);
  });

  return mapping;
}

function validateBankImportMapping(mapping: BankImportColumnMapping, headers: string[] = []) {
  const guidance: string[] = [];
  const assignments = new Map<string, BankImportField[]>();

  BANK_IMPORT_FIELD_ORDER.forEach((field) => {
    const header = mapping[field];
    if (!header) {
      return;
    }

    if (headers.length > 0 && !headers.includes(header)) {
      guidance.push(`Mapped column "${header}" is not present in this CSV preview.`);
    }

    assignments.set(header, [...(assignments.get(header) ?? []), field]);
  });

  assignments.forEach((fields, header) => {
    if (fields.length > 1) {
      guidance.push(
        `Column "${header}" is mapped more than once (${fields
          .map((field) => BANK_IMPORT_FIELD_META[field].label)
          .join(", ")}).`
      );
    }
  });

  if (!mapping.transactionDate) {
    guidance.push("Map a transaction date column.");
  }
  if (!mapping.description) {
    guidance.push("Map a narration or description column.");
  }
  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    guidance.push(
      "Map either a single signed amount column or the debit and/or credit columns used in the bank export."
    );
  }

  return {
    ok: guidance.length === 0,
    guidance,
  };
}

export function previewBankStatementCsv(content: string): BankImportPreview {
  const parsedCsv = parseCsv(content);
  const rows = parsedCsv.rows;
  if (rows.length === 0) {
    return {
      headers: [],
      suggestedMapping: buildDefaultMapping(),
      previewRows: [],
      guidance:
        parsedCsv.issues.length > 0 ? parsedCsv.issues : ["The uploaded CSV is empty."],
    };
  }

  const headers = rows[0] ?? [];
  const previewRows = rows.slice(1, 6).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
  const suggestedMapping = buildSuggestedBankImportMapping(headers, previewRows);
  const mappingValidation = validateBankImportMapping(suggestedMapping, headers);
  const guidance = [
    ...parsedCsv.issues,
    ...buildCsvStructureGuidance(rows),
    ...mappingValidation.guidance,
  ];

  if (headers.length <= 2) {
    guidance.push(
      "Only a few columns were detected. If the preview looks wrong, re-export the statement as CSV and confirm it uses separate date, narration, and amount columns."
    );
  }

  return {
    headers,
    suggestedMapping,
    previewRows,
    guidance:
      guidance.length > 0
        ? guidance
        : [
            "Review the suggested mapping before import. Different Nigerian bank exports label narration, debit, credit, and reference fields differently.",
          ],
  };
}

function resolveMappedValue(
  row: string[],
  headers: string[],
  mappingValue: string | null
) {
  if (!mappingValue) return "";
  const index = headers.indexOf(mappingValue);
  return index === -1 ? "" : row[index] ?? "";
}

function parseMappedBankRows(content: string, mapping: BankImportColumnMapping) {
  const parsedCsv = parseCsv(content);
  const rows = parsedCsv.rows;
  if (rows.length === 0) {
    return {
      headers: [],
      parsedRows: [] as ParsedBankImportRow[],
      errors: [{ row: 1, field: "file", message: "CSV file is empty" }] as BankImportRowError[],
      guidance:
        parsedCsv.issues.length > 0
          ? parsedCsv.issues
          : ["Upload a CSV export from a bank statement."],
    };
  }

  const headers = rows[0] ?? [];
  if (parsedCsv.issues.length > 0) {
    return {
      headers,
      parsedRows: [] as ParsedBankImportRow[],
      errors: parsedCsv.issues.map((message, index) => ({
        row: index + 1,
        field: "file",
        message,
      })),
      guidance: [
        ...parsedCsv.issues,
        "Fix the CSV structure, preview the file again, then retry the import.",
      ],
    };
  }

  const validation = validateBankImportMapping(mapping, headers);
  if (!validation.ok) {
    return {
      headers,
      parsedRows: [] as ParsedBankImportRow[],
      errors: validation.guidance.map((message, index) => ({
        row: index + 1,
        field: "mapping",
        message,
      })),
      guidance: validation.guidance,
    };
  }

  const errors: BankImportRowError[] = [];
  const parsedRows: ParsedBankImportRow[] = [];
  const csvStructureGuidance = buildCsvStructureGuidance(rows);
  const mappedIndexes = Object.values(mapping)
    .filter((header): header is string => Boolean(header))
    .map((header) => headers.indexOf(header))
    .filter((index) => index >= 0);
  const highestMappedIndex =
    mappedIndexes.length > 0 ? Math.max(...mappedIndexes) : headers.length - 1;

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;

    if (row.length > headers.length) {
      errors.push({
        row: rowNumber,
        field: "row",
        message:
          "This row has more columns than the header. Check for stray commas or broken quotes.",
      });
      return;
    }

    if (highestMappedIndex >= 0 && row.length <= highestMappedIndex) {
      errors.push({
        row: rowNumber,
        field: "row",
        message:
          "This row is missing one or more mapped columns. Confirm the export format or update the mapping.",
      });
      return;
    }

    const transactionDateValue = resolveMappedValue(row, headers, mapping.transactionDate);
    const descriptionValue = resolveMappedValue(row, headers, mapping.description);
    const referenceValue = resolveMappedValue(row, headers, mapping.reference);
    const debitValue = resolveMappedValue(row, headers, mapping.debit);
    const creditValue = resolveMappedValue(row, headers, mapping.credit);
    const amountValue = resolveMappedValue(row, headers, mapping.amount);
    const balanceValue = resolveMappedValue(row, headers, mapping.balance);

    if (
      [
        transactionDateValue,
        descriptionValue,
        referenceValue,
        debitValue,
        creditValue,
        amountValue,
        balanceValue,
      ].every((value) => value.trim() === "")
    ) {
      return;
    }

    const transactionDate = parseFlexibleDate(transactionDateValue);
    if (!transactionDate) {
      errors.push({ row: rowNumber, field: "transactionDate", message: "Invalid date" });
      return;
    }

    const debitAmountMinor = parseMinorAmount(debitValue);
    const creditAmountMinor = parseMinorAmount(creditValue);
    let amountMinor = parseMinorAmount(amountValue);
    let type: BankTransactionType | null = null;

    if (typeof debitAmountMinor === "number" && debitAmountMinor > 0) {
      amountMinor = debitAmountMinor;
      type = "DEBIT";
    } else if (typeof creditAmountMinor === "number" && creditAmountMinor > 0) {
      amountMinor = creditAmountMinor;
      type = "CREDIT";
    } else if (typeof amountMinor === "number" && amountMinor !== 0) {
      type = amountMinor < 0 ? "DEBIT" : "CREDIT";
      amountMinor = Math.abs(amountMinor);
    }

    if (!amountMinor || amountMinor <= 0) {
      errors.push({ row: rowNumber, field: "amount", message: "Invalid amount" });
      return;
    }

    if (!type) {
      errors.push({
        row: rowNumber,
        field: "type",
        message: "Could not determine whether the row is a debit or credit",
      });
      return;
    }

    const description = normalizeString(descriptionValue) || normalizeString(referenceValue);
    if (!description) {
      errors.push({
        row: rowNumber,
        field: "description",
        message: "Description is required",
      });
      return;
    }

    const rawRowPayload = JSON.stringify(
      Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] ?? ""]))
    );

    parsedRows.push({
      rowNumber,
      transactionDate,
      description,
      reference: normalizeString(referenceValue) || null,
      amountMinor,
      debitAmountMinor:
        type === "DEBIT" ? amountMinor : debitAmountMinor && debitAmountMinor > 0 ? debitAmountMinor : null,
      creditAmountMinor:
        type === "CREDIT" ? amountMinor : creditAmountMinor && creditAmountMinor > 0 ? creditAmountMinor : null,
      balanceAmountMinor: parseMinorAmount(balanceValue),
      type,
      rawRowPayload,
    });
  });

  return {
    headers,
    parsedRows,
    errors,
    guidance: [
      ...csvStructureGuidance,
      ...(errors.length > 0
        ? ["Fix the highlighted rows or adjust the column mapping, then import again."]
        : []),
    ],
  };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !/^\d+$/.test(token));
}

function textSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function mapFallbackCategoryToBusinessCategory(category: string | null) {
  const normalized = (category ?? "").toLowerCase();
  if (!normalized) return "Operations";
  if (normalized === "rent" || normalized === "utilities") {
    return "Rent and utilities";
  }
  if (normalized === "transport" || normalized === "marketing") {
    return "Travel and logistics";
  }
  if (normalized === "software" || normalized === "office" || normalized === "miscellaneous") {
    return "Operations";
  }
  return "Operations";
}

function cleanCounterparty(text: string) {
  const normalized = text
    .replace(/\b(trf|nip|mb transfer|pos|atm|ussd|web|mobile app|from|to|ref|session)\b/gi, " ")
    .replace(/[0-9]{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;
  return normalized.split(" ").slice(0, 4).join(" ");
}

function inferBusinessMeaning(
  suggestedType: BankTransactionBusinessType,
  narration: string,
  counterparty: string | null
) {
  const normalized = narration.toLowerCase();
  if (suggestedType === "TRANSFER") {
    return counterparty
      ? `Internal or operational transfer involving ${counterparty}`
      : "Likely an internal or operational transfer";
  }
  if (suggestedType === "OWNER_DRAW") {
    return "Possible owner withdrawal or personal draw";
  }
  if (normalized.includes("salary")) {
    return "Payroll-related bank movement";
  }
  if (normalized.includes("invoice") || normalized.includes("payment from")) {
    return "Customer payment or invoice settlement";
  }
  if (counterparty) {
    return `Bank narration suggests business dealing with ${counterparty}`;
  }
  return "Business-purpose narration inferred from the bank statement";
}

function mapFallbackSignalsToTreatments(
  suggestedType: BankTransactionBusinessType,
  narration: string
) {
  if (suggestedType === "TRANSFER" || suggestedType === "OWNER_DRAW" || suggestedType === "UNKNOWN") {
    return {
      vatTreatment: "NONE" as const,
      whtTreatment: "NONE" as const,
    };
  }

  const fallback = buildFallbackTextSuggestion(narration);
  const vatTreatment: VatTreatment =
    fallback.vat.relevance === "RELEVANT"
      ? suggestedType === "INCOME"
        ? "OUTPUT"
        : "INPUT"
      : "NONE";
  const whtTreatment: WhtTreatment =
    fallback.wht.relevance === "RELEVANT"
      ? suggestedType === "INCOME"
        ? "RECEIVABLE"
        : "PAYABLE"
      : "NONE";

  return {
    vatTreatment,
    whtTreatment,
  };
}

function buildHeuristicCategorization(input: {
  description: string;
  reference: string | null;
  type: BankTransactionType;
}) {
  const narration = `${input.description} ${input.reference ?? ""}`.trim();
  const normalized = narration.toLowerCase();
  const fallback = buildFallbackTextSuggestion(narration);

  const transferKeywords = [
    "transfer",
    "nip",
    "interbank",
    "reversal",
    "from savings",
    "to savings",
    "own account",
  ];
  const ownerDrawKeywords = ["atm", "cash withdrawal", "owner", "personal", "draw", "cash out"];

  let suggestedType: BankTransactionBusinessType;
  if (transferKeywords.some((keyword) => normalized.includes(keyword))) {
    suggestedType = "TRANSFER";
  } else if (ownerDrawKeywords.some((keyword) => normalized.includes(keyword))) {
    suggestedType = "OWNER_DRAW";
  } else if (input.type === "CREDIT") {
    suggestedType = "INCOME";
  } else if (input.type === "DEBIT") {
    suggestedType = "EXPENSE";
  } else {
    suggestedType = "UNKNOWN";
  }

  const counterparty = fallback.vendorName ?? cleanCounterparty(narration);
  const suggestedCategoryName =
    suggestedType === "INCOME"
      ? "Revenue"
      : suggestedType === "TRANSFER"
        ? "Transfers"
        : suggestedType === "OWNER_DRAW"
          ? "Owner drawings"
          : mapFallbackCategoryToBusinessCategory(fallback.suggestedCategory);
  const { vatTreatment, whtTreatment } = mapFallbackSignalsToTreatments(suggestedType, narration);
  const suggestedNarrationMeaning = inferBusinessMeaning(
    suggestedType,
    narration,
    counterparty
  );
  const confidenceScore =
    suggestedType === "TRANSFER" || suggestedType === "OWNER_DRAW"
      ? 0.72
      : fallback.confidence === "HIGH"
        ? 0.82
        : fallback.confidence === "MEDIUM"
          ? 0.64
          : 0.42;

  return {
    suggestedType,
    suggestedCounterparty: counterparty,
    suggestedCategoryName,
    suggestedVatTreatment: vatTreatment,
    suggestedWhtTreatment: whtTreatment,
    suggestedNarrationMeaning,
    confidenceScore,
    categorizationProvider: hasOpenAiServerConfig() ? "heuristic-fallback" : "heuristic-fallback",
    suggestionReason: buildCategorizationSuggestionReason({
      suggestedCategoryName,
      suggestedCounterparty: counterparty,
      suggestedNarrationMeaning,
      confidenceScore,
    }),
  } satisfies CategorizationResult;
}

async function refineCategorizationWithOpenAi(
  rows: Array<{
    rowKey: string;
    description: string;
    reference: string | null;
    type: BankTransactionType;
    heuristic: CategorizationResult;
  }>
) {
  if (!hasOpenAiServerConfig() || rows.length === 0) {
    return new Map<string, Partial<CategorizationResult>>();
  }

  const { apiKey, model } = getOpenAiServerConfig();
  const result = new Map<string, Partial<CategorizationResult>>();
  const batchSize = 20;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const prompt =
      "You are the banking reconciliation assistant for TaxBook AI, a Nigerian bookkeeping product. " +
      "Classify bank statement narrations conservatively for Nigerian SMEs and accountants. " +
      "Pay attention to common bank narration patterns from GTBank, Zenith, Access, UBA, Moniepoint, OPay, Paystack, and Flutterwave. " +
      "For each row, return business meaning, counterparty if visible, a suggested category, and VAT/WHT treatments only when the narration strongly supports them. " +
      `Use ${NIGERIA_TAX_CONFIG.vat.standardRate}% as the normal VAT rate when VAT clearly applies.\n\n` +
      batch
        .map((row) => {
          return [
            `rowKey: ${row.rowKey}`,
            `type: ${row.type}`,
            `description: ${row.description}`,
            `reference: ${row.reference ?? ""}`,
            `heuristicType: ${row.heuristic.suggestedType}`,
            `heuristicCategory: ${row.heuristic.suggestedCategoryName ?? ""}`,
          ].join("\n");
        })
        .join("\n\n---\n\n");

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              rowKey: { type: "string" },
              suggestedType: {
                type: "string",
                enum: ["INCOME", "EXPENSE", "TRANSFER", "OWNER_DRAW", "UNKNOWN"],
              },
              suggestedCounterparty: {
                type: ["string", "null"],
              },
              suggestedCategoryName: {
                type: ["string", "null"],
              },
              suggestedVatTreatment: {
                type: "string",
                enum: ["NONE", "INPUT", "OUTPUT", "EXEMPT"],
              },
              suggestedWhtTreatment: {
                type: "string",
                enum: ["NONE", "PAYABLE", "RECEIVABLE"],
              },
              suggestedNarrationMeaning: {
                type: ["string", "null"],
              },
              suggestionReason: {
                type: ["string", "null"],
              },
              confidenceScore: {
                type: "number",
              },
            },
            required: [
              "rowKey",
              "suggestedType",
              "suggestedCounterparty",
              "suggestedCategoryName",
              "suggestedVatTreatment",
              "suggestedWhtTreatment",
              "suggestedNarrationMeaning",
              "suggestionReason",
              "confidenceScore",
            ],
          },
        },
      },
      required: ["rows"],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          input: prompt,
          temperature: 0.1,
          text: {
            format: {
              type: "json_schema",
              name: "bank_transaction_categorization",
              strict: true,
              schema,
            },
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        continue;
      }

      const outputText = extractOutputText(data);
      if (!outputText) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(outputText);
      } catch {
        continue;
      }

      const aiRows =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as { rows?: unknown[] }).rows)
          ? ((parsed as { rows: Array<Record<string, unknown>> }).rows ?? [])
          : [];

      aiRows.forEach((row) => {
        const rowKey = normalizeString(row.rowKey);
        if (!rowKey) return;
        result.set(rowKey, {
          suggestedType: normalizeString(row.suggestedType).toUpperCase() as BankTransactionBusinessType,
          suggestedCounterparty: normalizeString(row.suggestedCounterparty) || null,
          suggestedCategoryName: normalizeString(row.suggestedCategoryName) || null,
          suggestedVatTreatment: normalizeString(row.suggestedVatTreatment).toUpperCase() as VatTreatment,
          suggestedWhtTreatment: normalizeString(row.suggestedWhtTreatment).toUpperCase() as WhtTreatment,
          suggestedNarrationMeaning: normalizeString(row.suggestedNarrationMeaning) || null,
          suggestionReason: normalizeString(row.suggestionReason) || null,
          confidenceScore: Math.max(
            0,
            Math.min(
              1,
              typeof row.confidenceScore === "number"
                ? row.confidenceScore
                : Number(row.confidenceScore ?? 0)
            )
          ),
          categorizationProvider: "openai",
        });
      });
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  return result;
}

async function categorizeParsedRows(
  rows: ParsedBankImportRow[]
): Promise<Array<ParsedBankImportRow & CategorizationResult>> {
  const heuristics = rows.map((row, index) => {
    const heuristic = buildHeuristicCategorization({
      description: row.description,
      reference: row.reference,
      type: row.type,
    });

    return {
      row,
      rowKey: `${row.rowNumber}-${index}`,
      heuristic,
    };
  });

  const aiRows = await refineCategorizationWithOpenAi(
    heuristics.map((item) => ({
      rowKey: item.rowKey,
      description: item.row.description,
      reference: item.row.reference,
      type: item.row.type,
      heuristic: item.heuristic,
    }))
  );

  return heuristics.map((item) => {
    const ai = aiRows.get(item.rowKey);
    return {
      ...item.row,
      ...item.heuristic,
      ...ai,
      categorizationProvider:
        normalizeString(ai?.categorizationProvider) || item.heuristic.categorizationProvider,
      suggestionReason: normalizeString(ai?.suggestionReason) || item.heuristic.suggestionReason,
    };
  });
}

function buildTransactionFingerprint(input: {
  bankAccountId: number;
  transactionDate: Date;
  amountMinor: number;
  type: BankTransactionType;
  description: string;
  reference: string | null;
}) {
  return createBankTransactionFingerprintHash(input);
}

function defaultStatusForCategorization(
  categorization: CategorizationResult
): BankTransactionStatus {
  if (categorization.confidenceScore < 0.45) {
    return "REVIEW_REQUIRED";
  }
  return "UNMATCHED";
}

function inferDirectionFromBusinessType(
  bankType: BankTransactionType,
  suggestedType: BankTransactionBusinessType | null | undefined
): LedgerDirection {
  if (suggestedType === "INCOME") return "MONEY_IN";
  if (suggestedType === "EXPENSE" || suggestedType === "OWNER_DRAW") return "MONEY_OUT";
  if (suggestedType === "TRANSFER") {
    return bankType === "CREDIT" ? "MONEY_IN" : "MONEY_OUT";
  }
  return bankType === "CREDIT" ? "MONEY_IN" : "MONEY_OUT";
}

function normalizeRelevanceFromTreatment(
  treatment: VatTreatment | WhtTreatment,
  fallbackRelevance: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN"
) {
  if (treatment !== "NONE") return "RELEVANT" as const;
  return fallbackRelevance;
}

function buildBankTaxSignals(input: {
  description: string;
  reference: string | null;
  suggestedVatTreatment: VatTreatment;
  suggestedWhtTreatment: WhtTreatment;
}) {
  const suggestion = buildFallbackTextSuggestion(
    `${input.description} ${input.reference ?? ""}`.trim()
  );

  return {
    vatRelevance: normalizeRelevanceFromTreatment(
      input.suggestedVatTreatment,
      suggestion.vat.relevance
    ),
    whtRelevance: normalizeRelevanceFromTreatment(
      input.suggestedWhtTreatment,
      suggestion.wht.relevance
    ),
    vatRate:
      input.suggestedVatTreatment !== "NONE"
        ? suggestion.vat.suggestedRate || NIGERIA_TAX_CONFIG.vat.standardRate
        : suggestion.vat.suggestedRate || 0,
    whtRate:
      input.suggestedWhtTreatment !== "NONE"
        ? suggestion.wht.suggestedRate || NIGERIA_TAX_CONFIG.wht.heuristicDefaultRate
        : suggestion.wht.suggestedRate || 0,
  };
}

function normalizeReferenceForComparison(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreDateDifference(left: Date, right: Date) {
  const differenceDays = Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
  if (differenceDays === 0) return 0.28;
  if (differenceDays <= 2) return 0.22;
  if (differenceDays <= 5) return 0.16;
  if (differenceDays <= 10) return 0.1;
  if (differenceDays <= 21) return 0.05;
  return 0;
}

function scoreBestDateDifference(left: Date, candidateDates: Date[]) {
  const bestScore = candidateDates.reduce((best, candidateDate) => {
    return Math.max(best, scoreDateDifference(left, candidateDate));
  }, 0);

  if (bestScore >= 0.28) {
    return { score: bestScore, reason: "same-day timing" };
  }
  if (bestScore >= 0.2) {
    return { score: bestScore, reason: "date is very close" };
  }
  if (bestScore > 0) {
    return { score: bestScore, reason: "date is within the review window" };
  }
  return { score: 0, reason: null };
}

function scoreAmountDifference(left: number, right: number) {
  if (left === right) return 0.42;
  const difference = Math.abs(left - right);
  const tightTolerance = Math.max(100, Math.round(left * 0.005));
  const standardTolerance = Math.max(100, Math.round(left * 0.02));
  const wideTolerance = Math.max(250, Math.round(left * 0.05));

  if (difference <= tightTolerance) return 0.32;
  if (difference <= standardTolerance) return 0.22;
  if (difference <= wideTolerance) return 0.1;
  return 0;
}

function scoreNarrationAlignment(left: string, right: string) {
  const normalizedLeft = normalizeString(left);
  const normalizedRight = normalizeString(right);
  if (!normalizedLeft || !normalizedRight) {
    return { score: 0, reason: null };
  }

  const similarity = textSimilarity(normalizedLeft, normalizedRight);
  const compactLeft = normalizedLeft.toLowerCase().replace(/[^a-z0-9]/g, "");
  const compactRight = normalizedRight.toLowerCase().replace(/[^a-z0-9]/g, "");

  let score = 0;
  let reason: string | null = null;

  if (similarity >= 0.75) {
    score = 0.16;
    reason = "narration strongly matches";
  } else if (similarity >= 0.45) {
    score = 0.11;
    reason = "narration matches";
  } else if (similarity >= 0.25) {
    score = 0.06;
    reason = "narration partly matches";
  }

  if (
    compactLeft &&
    compactRight &&
    Math.min(compactLeft.length, compactRight.length) >= 8 &&
    (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))
  ) {
    score = Math.min(0.18, score + (score > 0 ? 0.03 : 0.08));
    reason = reason ?? "narration text is contained in the candidate";
  }

  return { score, reason };
}

function scoreReferenceAlignment(left: string, right: string) {
  const normalizedLeft = normalizeReferenceForComparison(left);
  const normalizedRight = normalizeReferenceForComparison(right);
  if (!normalizedLeft || !normalizedRight) {
    return { score: 0, reason: null };
  }

  if (normalizedLeft === normalizedRight && normalizedLeft.length >= 6) {
    return { score: 0.2, reason: "reference exactly matches" };
  }

  if (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 6 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return { score: 0.14, reason: "reference closely matches" };
  }

  const leftTokens = new Set([
    ...extractReferenceLikeTokens(left),
    ...(normalizedLeft.length >= 8 ? [normalizedLeft] : []),
  ]);
  const rightTokens = new Set([
    ...extractReferenceLikeTokens(right),
    ...(normalizedRight.length >= 8 ? [normalizedRight] : []),
  ]);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return { score: 0, reason: null };
  }

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  if (overlap === 0) {
    return { score: 0, reason: null };
  }

  const ratio = overlap / Math.max(leftTokens.size, rightTokens.size);
  if (ratio >= 0.6) {
    return { score: 0.13, reason: "reference tokens align" };
  }
  return { score: 0.08, reason: "reference partially aligns" };
}

function scoreCounterpartyAlignment(counterparty: string | null | undefined, candidateText: string) {
  const normalizedCounterparty = normalizeString(counterparty);
  if (!normalizedCounterparty) {
    return { score: 0, reason: null };
  }

  const similarity = textSimilarity(normalizedCounterparty, candidateText);
  if (similarity >= 0.7) {
    return { score: 0.12, reason: "counterparty aligns" };
  }
  if (similarity >= 0.4) {
    return { score: 0.08, reason: "counterparty partly aligns" };
  }
  if (similarity > 0) {
    return { score: 0.04, reason: "counterparty hint aligns" };
  }
  return { score: 0, reason: null };
}

function scoreDirectionMatch(
  bankType: BankTransactionType,
  direction: LedgerDirection | "INVOICE_CREDIT"
) {
  if (direction === "INVOICE_CREDIT") {
    return bankType === "CREDIT" ? 0.06 : 0;
  }
  if (bankType === "CREDIT" && direction === "MONEY_IN") return 0.06;
  if (bankType === "DEBIT" && direction === "MONEY_OUT") return 0.06;
  return 0;
}

function buildScoreResult(input: {
  amountMinor: number;
  candidateAmountMinor: number;
  transactionDate: Date;
  candidateDates: Date[];
  descriptionText: string;
  candidateText: string;
  referenceText: string;
  candidateReferenceText: string;
  counterpartyText?: string | null;
  bankType: BankTransactionType;
  direction: LedgerDirection | "INVOICE_CREDIT";
  statusBoost?: {
    score: number;
    reason: string;
  };
}) {
  const reasons: string[] = [];
  let score = 0;

  const amountScore = scoreAmountDifference(input.amountMinor, input.candidateAmountMinor);
  if (amountScore > 0) {
    score += amountScore;
    reasons.push(amountScore >= 0.4 ? "exact amount match" : "amount is within tolerance");
  }

  const dateScore = scoreBestDateDifference(input.transactionDate, input.candidateDates);
  if (dateScore.score > 0 && dateScore.reason) {
    score += dateScore.score;
    reasons.push(dateScore.reason);
  }

  const narrationScore = scoreNarrationAlignment(input.descriptionText, input.candidateText);
  if (narrationScore.score > 0 && narrationScore.reason) {
    score += narrationScore.score;
    reasons.push(narrationScore.reason);
  }

  const referenceScore = scoreReferenceAlignment(
    input.referenceText,
    input.candidateReferenceText
  );
  if (referenceScore.score > 0 && referenceScore.reason) {
    score += referenceScore.score;
    reasons.push(referenceScore.reason);
  }

  const counterpartyScore = scoreCounterpartyAlignment(
    input.counterpartyText,
    input.candidateText
  );
  if (counterpartyScore.score > 0 && counterpartyScore.reason) {
    score += counterpartyScore.score;
    reasons.push(counterpartyScore.reason);
  }

  const directionScore = scoreDirectionMatch(input.bankType, input.direction);
  if (directionScore > 0) {
    score += directionScore;
    reasons.push("direction aligns");
  }

  if (input.statusBoost) {
    score += input.statusBoost.score;
    reasons.push(input.statusBoost.reason);
  }

  return {
    score: Math.min(0.99, Number(score.toFixed(4))),
    rationale: reasons.slice(0, 5).join("; "),
  };
}

async function buildMatchCandidates(
  tx: PrismaExecutor,
  workspaceId: number,
  transaction: {
    id: number;
    clientBusinessId: number | null;
    transactionDate: Date;
    description: string;
    reference: string | null;
    suggestedCounterparty: string | null;
    amount: number;
    type: BankTransactionType;
  }
) {
  const windowStart = addDays(transaction.transactionDate, -21);
  const windowEnd = addDays(transaction.transactionDate, 21);
  const descriptionText = transaction.description;
  const referenceText = transaction.reference ?? "";
  const amountTolerance = Math.max(250, Math.round(transaction.amount * 0.05));
  const amountLowerBound = Math.max(1, transaction.amount - amountTolerance);
  const amountUpperBound = transaction.amount + amountTolerance;
  const expectedDirection = transaction.type === "CREDIT" ? "MONEY_IN" : "MONEY_OUT";

  const [ledgerTransactions, drafts, invoices] = await Promise.all([
    tx.ledgerTransaction.findMany({
      where: {
        clientBusiness: {
          workspaceId,
        },
        clientBusinessId: transaction.clientBusinessId ?? undefined,
        bankTransactionId: null,
        amountMinor: {
          gte: amountLowerBound,
          lte: amountUpperBound,
        },
        direction: expectedDirection,
        transactionDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      take: 8,
      orderBy: [{ reviewStatus: "asc" }, { transactionDate: "desc" }],
      select: {
        id: true,
        description: true,
        reference: true,
        amountMinor: true,
        transactionDate: true,
        direction: true,
        reviewStatus: true,
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
        clientBusiness: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    tx.bookkeepingDraft.findMany({
      where: {
        upload: {
          clientBusiness: {
            workspaceId,
          },
          clientBusinessId: transaction.clientBusinessId ?? undefined,
        },
        amountMinor: {
          gte: amountLowerBound,
          lte: amountUpperBound,
        },
        direction: expectedDirection,
        reviewStatus: {
          in: ["PENDING", "NEEDS_INFO"] satisfies DraftReviewStatus[],
        },
      },
      take: 8,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        description: true,
        reference: true,
        amountMinor: true,
        direction: true,
        reviewStatus: true,
        vendorName: true,
        suggestedCategoryName: true,
        proposedDate: true,
        createdAt: true,
        upload: {
          select: {
            clientBusiness: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    transaction.type === "CREDIT"
      ? tx.invoice.findMany({
          where: {
            workspaceId,
            status: {
              in: ["SENT", "OVERDUE"],
            },
            totalAmount: {
              gte: amountLowerBound,
              lte: amountUpperBound,
            },
          },
          take: 8,
          orderBy: [{ status: "asc" }, { issueDate: "desc" }],
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            taxAmount: true,
            status: true,
            issueDate: true,
            dueDate: true,
            paidAt: true,
            paymentReference: true,
            client: {
              select: {
                name: true,
                companyName: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const candidates: MatchCandidate[] = [];

  ledgerTransactions.forEach((candidate) => {
    const scored = buildScoreResult({
      amountMinor: transaction.amount,
      candidateAmountMinor: candidate.amountMinor,
      transactionDate: transaction.transactionDate,
      candidateDates: [candidate.transactionDate],
      descriptionText,
      candidateText: [
        candidate.description,
        candidate.reference ?? "",
        candidate.vendor?.name ?? "",
        candidate.category?.name ?? "",
        candidate.clientBusiness.name,
      ]
        .filter(Boolean)
        .join(" "),
      referenceText,
      candidateReferenceText: candidate.reference ?? "",
      counterpartyText: transaction.suggestedCounterparty,
      bankType: transaction.type,
      direction: candidate.direction,
      statusBoost:
        candidate.reviewStatus === "POSTED"
          ? {
              score: 0.05,
              reason: "ledger entry is already posted",
            }
          : undefined,
    });

    if (scored.score >= 0.5) {
      candidates.push({
        matchType: "LEDGER_TRANSACTION",
        score: scored.score,
        matchedAmountMinor: candidate.amountMinor,
        rationale: scored.rationale,
        ledgerTransactionId: candidate.id,
      });
    }
  });

  drafts.forEach((candidate) => {
    const scored = buildScoreResult({
      amountMinor: transaction.amount,
      candidateAmountMinor: candidate.amountMinor ?? 0,
      transactionDate: transaction.transactionDate,
      candidateDates: [candidate.proposedDate ?? candidate.createdAt],
      descriptionText,
      candidateText: `${candidate.description ?? ""} ${candidate.vendorName ?? ""} ${
        candidate.suggestedCategoryName ?? ""
      } ${candidate.upload.clientBusiness.name}`,
      referenceText,
      candidateReferenceText: candidate.reference ?? "",
      counterpartyText: transaction.suggestedCounterparty,
      bankType: transaction.type,
      direction: candidate.direction,
      statusBoost:
        candidate.reviewStatus === "PENDING"
          ? {
              score: 0.04,
              reason: "draft is still awaiting review",
            }
          : undefined,
    });

    if (scored.score >= 0.48) {
      candidates.push({
        matchType: "BOOKKEEPING_DRAFT",
        score: scored.score,
        matchedAmountMinor: candidate.amountMinor ?? null,
        rationale: scored.rationale,
        bookkeepingDraftId: candidate.id,
      });
    }
  });

  invoices.forEach((candidate) => {
    const invoiceText = [
      candidate.invoiceNumber,
      candidate.client.name,
      candidate.client.companyName,
      candidate.paymentReference,
    ]
      .filter(Boolean)
      .join(" ");
    const scored = buildScoreResult({
      amountMinor: transaction.amount,
      candidateAmountMinor: candidate.totalAmount,
      transactionDate: transaction.transactionDate,
      candidateDates: [candidate.paidAt, candidate.dueDate, candidate.issueDate].filter(
        (value): value is Date => Boolean(value)
      ),
      descriptionText,
      candidateText: invoiceText,
      referenceText,
      candidateReferenceText: candidate.paymentReference ?? candidate.invoiceNumber,
      counterpartyText: transaction.suggestedCounterparty,
      bankType: transaction.type,
      direction: "INVOICE_CREDIT",
      statusBoost:
        candidate.status === "SENT" || candidate.status === "OVERDUE"
          ? {
              score: 0.06,
              reason: "invoice is still open",
            }
          : undefined,
    });

    if (scored.score >= 0.52) {
      candidates.push({
        matchType: "INVOICE",
        score: scored.score,
        matchedAmountMinor: candidate.totalAmount,
        rationale: scored.rationale,
        invoiceId: candidate.id,
      });
    }
  });

  return candidates.sort((left, right) => right.score - left.score).slice(0, 5);
}

function deriveSuggestedTransactionStatus(candidates: MatchCandidate[]): BankTransactionStatus {
  if (candidates.length === 0) {
    return "UNMATCHED";
  }

  const top = candidates[0];
  const runnerUp = candidates[1] ?? null;
  const gap = top.score - (runnerUp?.score ?? 0);

  if (top.score >= 0.86) {
    return "SUGGESTED";
  }
  if (top.score >= 0.74 && gap >= 0.08) {
    return "SUGGESTED";
  }
  return "REVIEW_REQUIRED";
}

async function refreshReconciliationSuggestions(
  tx: PrismaExecutor,
  workspaceId: number,
  bankTransactionId: number
) {
  const transaction = await tx.bankTransaction.findFirst({
    where: {
      id: bankTransactionId,
      workspaceId,
    },
    select: {
      id: true,
      clientBusinessId: true,
      transactionDate: true,
      description: true,
      reference: true,
      suggestedCounterparty: true,
      amount: true,
      type: true,
      status: true,
    },
  });

  if (!transaction) {
    throw new Error("Bank transaction not found");
  }

  if (transaction.status === "MATCHED" || transaction.status === "IGNORED" || transaction.status === "SPLIT") {
    return;
  }

  await tx.reconciliationMatch.deleteMany({
    where: {
      bankTransactionId: transaction.id,
      status: {
        in: ["SUGGESTED", "REJECTED"] satisfies ReconciliationMatchStatus[],
      },
    },
  });

  const candidates = await buildMatchCandidates(tx, workspaceId, transaction);
  for (const candidate of candidates) {
    await tx.reconciliationMatch.create({
      data: {
        workspaceId,
        bankTransactionId: transaction.id,
        matchType: candidate.matchType,
        status: "SUGGESTED",
        score: candidate.score,
        matchedAmountMinor: candidate.matchedAmountMinor ?? null,
        rationale: candidate.rationale,
        invoiceId: candidate.invoiceId,
        ledgerTransactionId: candidate.ledgerTransactionId,
        bookkeepingDraftId: candidate.bookkeepingDraftId,
        taxRecordId: candidate.taxRecordId,
      },
    });
  }

  await tx.bankTransaction.update({
    where: { id: transaction.id },
    data: {
      status:
        candidates.length > 0
          ? deriveSuggestedTransactionStatus(candidates)
          : transaction.status === "REVIEW_REQUIRED"
            ? "REVIEW_REQUIRED"
            : "UNMATCHED",
    },
  });
}

async function loadWorkspaceClientBusinessOptions(workspaceId: number) {
  await ensureDefaultTransactionCategoriesForWorkspace(prisma, workspaceId);

  const businesses = await prisma.clientBusiness.findMany({
    where: {
      workspaceId,
      archivedAt: null,
    },
    orderBy: [{ name: "asc" }],
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
  });

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    defaultCurrency: business.defaultCurrency,
    categories: business.categories,
  }));
}

function serializeMatch(
  match: BankTransactionRecord["matches"][number]
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

export function serializeBankTransaction(
  transaction: BankTransactionRecord
): SerializedBankTransaction {
  const taxSignals = buildBankTaxSignals({
    description: transaction.description,
    reference: transaction.reference,
    suggestedVatTreatment: transaction.suggestedVatTreatment,
    suggestedWhtTreatment: transaction.suggestedWhtTreatment,
  });
  const resolvedTax = resolveBankTransactionTax({
    amountMinor: transaction.amount,
    description: transaction.description,
    reference: transaction.reference,
    vatTreatment: transaction.vatTreatment,
    whtTreatment: transaction.whtTreatment,
    vatRate: transaction.vatRate,
    whtRate: transaction.whtRate,
    vatAmountMinor: transaction.vatAmountMinor,
    whtAmountMinor: transaction.whtAmountMinor,
    taxTreatmentSource: transaction.taxTreatmentSource,
    suggestedVatTreatment: transaction.suggestedVatTreatment,
    suggestedWhtTreatment: transaction.suggestedWhtTreatment,
  });

  const approvedMatch = transaction.matches.find((match) => match.status === "APPROVED") ?? null;
  const serializedApprovedMatch = approvedMatch ? serializeMatch(approvedMatch) : null;
  const suggestions = transaction.matches.filter((match) => match.status === "SUGGESTED");

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
    source: transaction.source,
    status: transaction.status,
    reviewStatus: transaction.reviewStatus,
    currency: transaction.currency,
    sourceRowNumber: transaction.sourceRowNumber ?? null,
    reviewNotes: transaction.reviewNotes,
    reviewedAt: transaction.reviewedAt?.toISOString() ?? null,
    reviewedBy: transaction.reviewedBy
      ? {
          id: transaction.reviewedBy.id,
          fullName: transaction.reviewedBy.fullName,
          email: transaction.reviewedBy.email,
        }
      : null,
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
    category: transaction.category
      ? {
          id: transaction.category.id,
          name: transaction.category.name,
          type: transaction.category.type,
        }
      : null,
    suggestedCategory: transaction.suggestedCategory
      ? {
          id: transaction.suggestedCategory.id,
          name: transaction.suggestedCategory.name,
          type: transaction.suggestedCategory.type,
        }
      : null,
    vatTreatment: resolvedTax.vatTreatment,
    whtTreatment: resolvedTax.whtTreatment,
    vatRate: resolvedTax.vatRate,
    whtRate: resolvedTax.whtRate,
    vatAmountMinor: resolvedTax.vatAmountMinor,
    whtAmountMinor: resolvedTax.whtAmountMinor,
    taxTreatmentSource: resolvedTax.taxTreatmentSource,
    usesSuggestedTaxFallback: resolvedTax.usesSuggestedFallback,
    suggestionConfidence: transaction.suggestionConfidence,
    suggestionReason: transaction.suggestionReason,
    normalizedDescription: transaction.normalizedDescription,
    normalizedMerchantName: transaction.normalizedMerchantName,
    autoBookkeepingConfidence: transaction.autoBookkeepingConfidence,
    autoBookkeepingReason: transaction.autoBookkeepingReason,
    autoBookkeepingProvider: transaction.autoBookkeepingProvider,
    autoBookkeepingProcessedAt: transaction.autoBookkeepingProcessedAt?.toISOString() ?? null,
    postingReadiness: transaction.postingReadiness,
    possibleDuplicateOf: transaction.possibleDuplicateOf
      ? {
          id: transaction.possibleDuplicateOf.id,
          transactionDate: transaction.possibleDuplicateOf.transactionDate.toISOString(),
          description: transaction.possibleDuplicateOf.description,
          reference: transaction.possibleDuplicateOf.reference,
          amountMinor: transaction.possibleDuplicateOf.amount,
        }
      : null,
    duplicateConfidence: transaction.duplicateConfidence,
    duplicateReason: transaction.duplicateReason,
    suspiciousPatternScore: transaction.suspiciousPatternScore,
    suspiciousPatternReason: transaction.suspiciousPatternReason,
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
      suggestedCategoryName:
        transaction.suggestedCategory?.name ?? transaction.suggestedCategoryName,
      suggestedVatTreatment: transaction.suggestedVatTreatment,
      suggestedWhtTreatment: transaction.suggestedWhtTreatment,
      narrationMeaning: transaction.suggestedNarrationMeaning,
      confidenceScore: transaction.confidenceScore,
      provider: transaction.categorizationProvider,
      vatRelevance: taxSignals.vatRelevance,
      whtRelevance: taxSignals.whtRelevance,
      vatRate: taxSignals.vatRate,
      whtRate: taxSignals.whtRate,
    },
    approvedMatch: serializedApprovedMatch,
    suggestions: suggestions.map((match) => serializeMatch(match)),
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

function buildEmptyBankingSummary() {
  return {
    total: 0,
    byStatus: BANK_TRANSACTION_STATUSES.reduce(
      (acc, status) => ({
        ...acc,
        [status]: 0,
      }),
      {} as Record<BankTransactionStatus, number>
    ),
  };
}

export function buildEmptyBankingDashboard(input?: {
  status?: BankingDashboardLoadStatus;
  error?: string | null;
}): SerializedBankingDashboard {
  return {
    status: input?.status ?? "ok",
    error: input?.error ?? null,
    accounts: [],
    clientBusinesses: [],
    imports: [],
    invoiceOptions: [],
    ledgerOptions: [],
    transactions: [],
    summary: buildEmptyBankingSummary(),
    aiConfigured: hasOpenAiServerConfig(),
  };
}

function buildWorkspaceBankTransactionWhere(input: {
  workspaceId: number;
  status?: BankTransactionStatus | null;
  bankAccountId?: number | null;
  clientBusinessId?: number | null;
  importId?: number | null;
  categoryId?: number | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}) {
  return {
    workspaceId: input.workspaceId,
    status: input.status ?? undefined,
    bankAccountId: input.bankAccountId ?? undefined,
    clientBusinessId: input.clientBusinessId ?? undefined,
    statementImportId: input.importId ?? undefined,
    categoryId: input.categoryId ?? undefined,
    transactionDate:
      input.dateFrom || input.dateTo
        ? {
            ...(input.dateFrom ? { gte: input.dateFrom } : {}),
            ...(input.dateTo ? { lte: input.dateTo } : {}),
          }
        : undefined,
  } satisfies Prisma.BankTransactionWhereInput;
}

function filterWorkspaceTransactionsByQuery(
  transactions: BankTransactionRecord[],
  query?: string | null
) {
  if (!normalizeString(query)) {
    return transactions;
  }

  const normalizedQuery = normalizeString(query).toLowerCase();

  return transactions.filter((transaction) => {
    const haystack = [
      transaction.description,
      transaction.reference ?? "",
      transaction.suggestedCounterparty ?? "",
      transaction.suggestedCategoryName ?? "",
      transaction.bankAccount.name,
      transaction.clientBusiness?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

async function loadWorkspaceBankingTransactions(input: {
  workspaceId: number;
  status?: BankTransactionStatus | null;
  bankAccountId?: number | null;
  clientBusinessId?: number | null;
  importId?: number | null;
  categoryId?: number | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  query?: string | null;
}) {
  if (!input.workspaceId || !Number.isInteger(input.workspaceId) || input.workspaceId <= 0) {
    return {
      status: "no_workspace" as const,
      error: null,
      transactions: [] as SerializedBankingDashboard["transactions"],
      summary: buildEmptyBankingSummary(),
    };
  }

  const where = buildWorkspaceBankTransactionWhere(input);

  try {
    const totalInWorkspaceScope = await prisma.bankTransaction.count({
      where,
    });

    if (totalInWorkspaceScope === 0) {
      return {
        status: "ok" as const,
        error: null,
        transactions: [] as SerializedBankingDashboard["transactions"],
        summary: buildEmptyBankingSummary(),
      };
    }

    const transactions = await prisma.bankTransaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: 120,
      include: bankTransactionInclude,
    });

    const filteredTransactions = filterWorkspaceTransactionsByQuery(
      transactions,
      input.query
    );
    const serializedTransactions = filteredTransactions.map((transaction) =>
      serializeBankTransaction(transaction)
    );
    const byStatus = BANK_TRANSACTION_STATUSES.reduce(
      (acc, status) => ({
        ...acc,
        [status]: 0,
      }),
      {} as Record<BankTransactionStatus, number>
    );

    filteredTransactions.forEach((transaction) => {
      byStatus[transaction.status] += 1;
    });

    return {
      status: "ok" as const,
      error: null,
      transactions: serializedTransactions,
      summary: {
        total: filteredTransactions.length,
        byStatus,
      },
    };
  } catch (error) {
    logError(
      "banking",
      "Workspace banking transactions query failed; returning an empty transaction list.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return {
      status: "error" as const,
      error: "Failed to load transactions.",
      transactions: [] as SerializedBankingDashboard["transactions"],
      summary: buildEmptyBankingSummary(),
    };
  }
}

async function markOnlyApprovedMatch(
  tx: PrismaExecutor,
  bankTransactionId: number,
  approvedMatchId: number
) {
  await tx.reconciliationMatch.updateMany({
    where: {
      bankTransactionId,
      id: {
        not: approvedMatchId,
      },
    },
    data: {
      status: "REJECTED",
      approvedAt: null,
      approvedByUserId: null,
    },
  });
}

async function createPostedLedgerTransaction(
  tx: PrismaExecutor,
  input: {
    workspaceId: number;
    actorUserId: number;
    bankTransaction: {
      id: number;
      amount: number;
      type: BankTransactionType;
      currency: string;
      description: string;
      reference: string | null;
      transactionDate: Date;
      vatTreatment: VatTreatment;
      whtTreatment: WhtTreatment;
      vatRate: number;
      whtRate: number;
      vatAmountMinor: number;
      whtAmountMinor: number;
      taxTreatmentSource: BankTransactionTaxTreatmentSource;
      suggestedType: BankTransactionBusinessType;
      suggestedCategoryName: string | null;
      suggestedVatTreatment: VatTreatment;
      suggestedWhtTreatment: WhtTreatment;
    };
    clientBusinessId: number;
    description?: string | null;
    reference?: string | null;
    vendorName?: string | null;
    categoryId?: number | null;
    categoryName?: string | null;
    suggestedType?: BankTransactionBusinessType | null;
    vatTreatment?: VatTreatment | null;
    whtTreatment?: WhtTreatment | null;
    vatAmountMinor?: number | null;
    whtAmountMinor?: number | null;
    notes?: string | null;
  }
) {
  const bankTransaction = input.bankTransaction;
  const suggestedType = input.suggestedType ?? bankTransaction.suggestedType;
  const direction = inferDirectionFromBusinessType(bankTransaction.type, suggestedType);
  const resolvedVendorId = await resolveVendorForDraft(
    tx,
    input.clientBusinessId,
    normalizeString(input.vendorName) || null
  );
  const resolvedCategoryId = await resolveCategoryForDraft(tx, {
    clientBusinessId: input.clientBusinessId,
    categoryId: input.categoryId ?? null,
    suggestedCategoryName:
      normalizeString(input.categoryName) ||
      bankTransaction.suggestedCategoryName ||
      (suggestedType === "INCOME" ? "Revenue" : "Operations"),
    direction,
  });

  const taxSignals = buildBankTaxSignals({
    description: bankTransaction.description,
    reference: bankTransaction.reference,
    suggestedVatTreatment: input.vatTreatment ?? bankTransaction.suggestedVatTreatment,
    suggestedWhtTreatment: input.whtTreatment ?? bankTransaction.suggestedWhtTreatment,
  });
  const resolvedTax = resolveBankTransactionTax({
    amountMinor: bankTransaction.amount,
    description: bankTransaction.description,
    reference: bankTransaction.reference,
    vatTreatment: bankTransaction.vatTreatment,
    whtTreatment: bankTransaction.whtTreatment,
    vatRate: bankTransaction.vatRate,
    whtRate: bankTransaction.whtRate,
    vatAmountMinor: bankTransaction.vatAmountMinor,
    whtAmountMinor: bankTransaction.whtAmountMinor,
    taxTreatmentSource: bankTransaction.taxTreatmentSource,
    suggestedVatTreatment: bankTransaction.suggestedVatTreatment,
    suggestedWhtTreatment: bankTransaction.suggestedWhtTreatment,
  });

  const effectiveVatTreatment = input.vatTreatment ?? resolvedTax.vatTreatment;
  const effectiveWhtTreatment = input.whtTreatment ?? resolvedTax.whtTreatment;
  const effectiveVatRate =
    effectiveVatTreatment === resolvedTax.vatTreatment
      ? resolvedTax.vatRate
      : effectiveVatTreatment !== "NONE" && effectiveVatTreatment !== "EXEMPT"
        ? taxSignals.vatRate || NIGERIA_TAX_CONFIG.vat.standardRate
        : 0;
  const effectiveWhtRate =
    effectiveWhtTreatment === resolvedTax.whtTreatment
      ? resolvedTax.whtRate
      : effectiveWhtTreatment !== "NONE"
        ? taxSignals.whtRate || NIGERIA_TAX_CONFIG.wht.heuristicDefaultRate
        : 0;
  const vatAmountMinor =
    input.vatAmountMinor ??
    (effectiveVatTreatment === resolvedTax.vatTreatment
      ? resolvedTax.vatAmountMinor
      : effectiveVatTreatment !== "NONE" && effectiveVatTreatment !== "EXEMPT"
        ? estimateInclusiveVat(bankTransaction.amount, effectiveVatRate)
      : 0);
  const whtAmountMinor =
    input.whtAmountMinor ??
    (effectiveWhtTreatment === resolvedTax.whtTreatment
      ? resolvedTax.whtAmountMinor
      : effectiveWhtTreatment !== "NONE"
        ? estimateWithholdingTax(bankTransaction.amount, effectiveWhtRate)
      : 0);

  const transaction = await tx.ledgerTransaction.create({
    data: {
      clientBusinessId: input.clientBusinessId,
      vendorId: resolvedVendorId,
      categoryId: resolvedCategoryId,
      bankTransactionId: bankTransaction.id,
      createdByUserId: input.actorUserId,
      transactionDate: bankTransaction.transactionDate,
      description:
        normalizeString(input.description) || bankTransaction.description || "Bank transaction",
      reference: normalizeString(input.reference) || bankTransaction.reference,
      direction,
      amountMinor: bankTransaction.amount,
      currency: bankTransaction.currency,
      vatAmountMinor,
      whtAmountMinor,
      vatTreatment: effectiveVatTreatment,
      whtTreatment: effectiveWhtTreatment,
      origin: "IMPORT",
      reviewStatus: "POSTED",
      notes: normalizeString(input.notes) || null,
    },
    select: {
      id: true,
      vatAmountMinor: true,
      whtAmountMinor: true,
      vatTreatment: true,
      whtTreatment: true,
      amountMinor: true,
      description: true,
    },
  });

  return transaction;
}

export async function createWorkspaceBankAccount(input: {
  workspaceId: number;
  clientBusinessId: number;
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency?: string | null;
}) {
  const business = await prisma.clientBusiness.findFirst({
    where: {
      id: input.clientBusinessId,
      workspaceId: input.workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    throw new Error("Client business not found for the selected workspace");
  }

  return prisma.bankAccount.create({
    data: {
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      name: normalizeString(input.accountName),
      bankName: normalizeString(input.bankName),
      accountNumber: normalizeString(input.accountNumber),
      currency: normalizeString(input.currency).toUpperCase() || "NGN",
    },
    include: {
      clientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function importBankStatementCsv(input: {
  workspaceId: number;
  uploadedByUserId: number;
  bankAccountId: number;
  clientBusinessId?: number | null;
  fileName: string;
  fileType?: string | null;
  uploadSizeBytes?: number | null;
  content: string;
  mapping: BankImportColumnMapping;
}) {
  const account = await prisma.bankAccount.findFirst({
    where: {
      id: input.bankAccountId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      clientBusinessId: true,
      currency: true,
    },
  });

  if (!account) {
    throw new Error("Bank account not found");
  }

  const clientBusinessId = input.clientBusinessId ?? account.clientBusinessId ?? null;
  if (!clientBusinessId) {
    throw new Error("Select a client business before importing a statement");
  }

  if (account.clientBusinessId && account.clientBusinessId !== clientBusinessId) {
    throw new Error("Select a bank account that belongs to the chosen client business.");
  }

  const business = await prisma.clientBusiness.findFirst({
    where: {
      id: clientBusinessId,
      workspaceId: input.workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    throw new Error("Client business not found");
  }

  await ensureDefaultTransactionCategoriesForWorkspace(prisma, input.workspaceId);

  const parsed = parseMappedBankRows(input.content, input.mapping);
  const totalRows = parsed.parsedRows.length + parsed.errors.length;
  if (parsed.parsedRows.length === 0) {
    return buildImportResult({
      importId: null,
      totalRows,
      importedRows: 0,
      duplicateRows: 0,
      invalidRows: parsed.errors.length,
      errors: parsed.errors,
      guidance: parsed.guidance,
      createdTransactionIds: [],
    });
  }

  let categorizationStatus: BankImportCategorizationStatus = "applied";
  let categorizationWarning: string | null = null;
  let categorizedRows: Array<ParsedBankImportRow & CategorizationResult>;

  try {
    categorizedRows = await categorizeParsedRows(parsed.parsedRows);
  } catch (error) {
    categorizationStatus = "error";
    categorizationWarning =
      "Category suggestions were partially unavailable, so TaxBook used safe heuristic defaults for this import.";
    logError(
      "banking",
      "Bank import categorization failed; falling back to heuristic-only suggestions.",
      error,
      {
        workspaceId: input.workspaceId,
        bankAccountId: input.bankAccountId,
      }
    );

    categorizedRows = parsed.parsedRows.map((row) => ({
      ...row,
      ...buildHeuristicCategorization({
        description: row.description,
        reference: row.reference,
        type: row.type,
      }),
    }));
  }

  const categorizationContext = {
    status: categorizationStatus,
    provider: categorizedRows.some(
      (row) => normalizeString(row.categorizationProvider).toLowerCase() === "openai"
    )
      ? "heuristic+openai"
      : "heuristic",
    usedOpenAi: categorizedRows.some(
      (row) => normalizeString(row.categorizationProvider).toLowerCase() === "openai"
    ),
    warning: categorizationWarning,
  } satisfies BankImportCategorizationContext;

  const categorizationProvider = categorizedRows.some(
    (row) => normalizeString(row.categorizationProvider).toLowerCase() === "openai"
  )
    ? "heuristic+openai"
    : "heuristic";

  const categoryOptions = await prisma.transactionCategory.findMany({
    where: {
      clientBusinessId,
    },
    select: {
      id: true,
      name: true,
    },
  });
  const categoryLookup = new Map(
    categoryOptions.map((category) => [normalizeCategoryLookupKey(category.name), category.id])
  );
  const existingTransactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId: input.workspaceId,
      bankAccountId: input.bankAccountId,
      transactionDate: {
        gte: addDays(
          categorizedRows.reduce(
            (earliest, row) =>
              row.transactionDate < earliest ? row.transactionDate : earliest,
            categorizedRows[0].transactionDate
          ),
          -7
        ),
        lte: addDays(
          categorizedRows.reduce(
            (latest, row) => (row.transactionDate > latest ? row.transactionDate : latest),
            categorizedRows[0].transactionDate
          ),
          7
        ),
      },
    },
    select: {
      id: true,
      fingerprintHash: true,
      bankAccountId: true,
      transactionDate: true,
      amount: true,
      type: true,
      description: true,
      reference: true,
      normalizedDescription: true,
      normalizedMerchantName: true,
    },
  });

  const knownFingerprints = new Set(
    existingTransactions.map((transaction) =>
      transaction.fingerprintHash ??
      buildTransactionFingerprint({
        bankAccountId: transaction.bankAccountId,
        transactionDate: transaction.transactionDate,
        amountMinor: transaction.amount,
        type: transaction.type,
        description: transaction.description,
        reference: transaction.reference,
      })
    )
  );

  const seenFingerprints = new Set<string>();
  const duplicateComparableCandidates = existingTransactions.map((transaction) =>
    toImportDuplicateComparableTransaction({
      id: transaction.id,
      bankAccountId: transaction.bankAccountId,
      transactionDate: transaction.transactionDate,
      amount: transaction.amount,
      type: transaction.type,
      description: transaction.description,
      reference: transaction.reference,
      normalizedDescription: transaction.normalizedDescription,
      normalizedMerchantName: transaction.normalizedMerchantName,
    })
  );

  const imported = await prisma.$transaction(async (tx) => {
    const processedAt = new Date();
    const statementImport = await tx.bankStatementImport.create({
      data: {
        workspaceId: input.workspaceId,
        clientBusinessId,
        bankAccountId: input.bankAccountId,
        uploadedByUserId: input.uploadedByUserId,
        fileName: input.fileName,
        fileType: input.fileType ?? null,
        uploadSizeBytes: input.uploadSizeBytes ?? null,
        mappingJson: JSON.stringify(input.mapping),
        rawHeaders: JSON.stringify(parsed.headers),
        rowCount: totalRows,
        status: "PENDING",
      },
      select: {
        id: true,
      },
    });

    let duplicateCount = 0;
    const failedCount = parsed.errors.length;
    let importedCount = 0;
    let suggestedCount = 0;
    let queuedForReviewCount = 0;
    let taxReviewCount = 0;
    const createdTransactionIds: number[] = [];
    const pipelineOutcomes: BankImportPipelineRowOutcome[] = [];

    for (const row of categorizedRows) {
      const fingerprint = buildTransactionFingerprint({
        bankAccountId: input.bankAccountId,
        transactionDate: row.transactionDate,
        amountMinor: row.amountMinor,
        type: row.type,
        description: row.description,
        reference: row.reference,
      });

      if (knownFingerprints.has(fingerprint) || seenFingerprints.has(fingerprint)) {
        duplicateCount += 1;
        continue;
      }

      seenFingerprints.add(fingerprint);
      const suggestedCategoryId =
        categoryLookup.get(normalizeCategoryLookupKey(row.suggestedCategoryName)) ?? null;
      const normalizedText = normalizeBankTransactionText({
        description: row.description,
        reference: row.reference,
        suggestedCounterparty: row.suggestedCounterparty,
      });
      const duplicateDetection = detectPotentialBankTransactionDuplicate({
        transaction: toImportDuplicateComparableTransaction({
          id: -row.rowNumber,
          bankAccountId: input.bankAccountId,
          transactionDate: row.transactionDate,
          amount: row.amountMinor,
          type: row.type,
          description: row.description,
          reference: row.reference,
          normalizedDescription: normalizedText.normalizedDescription,
          normalizedMerchantName: normalizedText.normalizedMerchantName,
        }),
        candidates: duplicateComparableCandidates,
      });
      const suggestionReason =
        normalizeString(row.suggestionReason) ||
        buildCategorizationSuggestionReason({
          suggestedCategoryName: row.suggestedCategoryName,
          suggestedCounterparty: row.suggestedCounterparty,
          suggestedNarrationMeaning: row.suggestedNarrationMeaning,
          confidenceScore: row.confidenceScore,
        });
      const taxUpdate = shouldPersistSuggestedTaxValues({
        suggestedVatTreatment: row.suggestedVatTreatment,
        suggestedWhtTreatment: row.suggestedWhtTreatment,
      })
        ? buildSuggestedBankTransactionTaxUpdate({
            amountMinor: row.amountMinor,
            description: row.description,
            reference: row.reference,
            suggestedVatTreatment: row.suggestedVatTreatment,
            suggestedWhtTreatment: row.suggestedWhtTreatment,
          })
        : null;
      const taxReviewRequired = Boolean(taxUpdate);
      const postingReadiness = buildImportPostingReadiness({
        suggestedCategoryId,
        confidenceScore: row.confidenceScore,
        duplicateConfidence: duplicateDetection.confidence,
        taxReviewRequired,
      });
      const autoBookkeepingConfidence = buildImportAutoBookkeepingConfidence({
        confidenceScore: row.confidenceScore,
        suggestedCategoryId,
        duplicateConfidence: duplicateDetection.confidence,
        taxReviewRequired,
      });
      const autoBookkeepingReason = buildImportAutoBookkeepingReason({
        suggestionReason,
        duplicateReason: duplicateDetection.reason,
        taxReviewRequired,
      });

      try {
        const created = await tx.bankTransaction.create({
          data: {
            workspaceId: input.workspaceId,
            clientBusinessId,
            bankAccountId: input.bankAccountId,
            statementImportId: statementImport.id,
            uploadedByUserId: input.uploadedByUserId,
            transactionDate: row.transactionDate,
            description: row.description,
            reference: row.reference,
            amount: row.amountMinor,
            debitAmountMinor: row.debitAmountMinor,
            creditAmountMinor: row.creditAmountMinor,
            balanceAmountMinor: row.balanceAmountMinor,
            type: row.type,
            source: "CSV_IMPORT",
            status: defaultStatusForCategorization(row),
            reviewStatus: "PENDING_REVIEW",
            fingerprintHash: fingerprint,
            sourceRowNumber: row.rowNumber,
            rawRowPayload: row.rawRowPayload,
            currency: account.currency,
            suggestedType: row.suggestedType,
            suggestedCounterparty: row.suggestedCounterparty,
            suggestedCategoryId,
            suggestedCategoryName: row.suggestedCategoryName,
            suggestedVatTreatment: row.suggestedVatTreatment,
            suggestedWhtTreatment: row.suggestedWhtTreatment,
            suggestedNarrationMeaning: row.suggestedNarrationMeaning,
            confidenceScore: row.confidenceScore,
            categorizationProvider: row.categorizationProvider,
            suggestionConfidence: row.confidenceScore,
            suggestionReason,
            vatTreatment: taxUpdate?.vatTreatment ?? undefined,
            whtTreatment: taxUpdate?.whtTreatment ?? undefined,
            vatRate: taxUpdate?.vatRate ?? undefined,
            whtRate: taxUpdate?.whtRate ?? undefined,
            vatAmountMinor: taxUpdate?.vatAmountMinor ?? undefined,
            whtAmountMinor: taxUpdate?.whtAmountMinor ?? undefined,
            taxTreatmentSource: taxUpdate?.taxTreatmentSource ?? undefined,
            normalizedDescription: normalizedText.normalizedDescription,
            normalizedMerchantName: normalizedText.normalizedMerchantName,
            autoBookkeepingConfidence,
            autoBookkeepingReason,
            autoBookkeepingProvider: "csv-import-pipeline-v1",
            autoBookkeepingProcessedAt: processedAt,
            postingReadiness,
            possibleDuplicateOfTransactionId:
              duplicateDetection.possibleDuplicateOfTransactionId,
            duplicateConfidence: duplicateDetection.confidence,
            duplicateReason: duplicateDetection.reason,
          },
          select: {
            id: true,
          },
        });

        createdTransactionIds.push(created.id);
        importedCount += 1;
        queuedForReviewCount += 1;

        if (suggestedCategoryId) {
          suggestedCount += 1;
        }
        if (taxReviewRequired) {
          taxReviewCount += 1;
        }

        pipelineOutcomes.push({
          reviewQueued: true,
          categorized: Boolean(suggestedCategoryId),
          taxReviewRequired,
          taxMode: taxUpdate ? "suggested_defaults" : "safe_defaults",
        });
        duplicateComparableCandidates.push(
          toImportDuplicateComparableTransaction({
            id: created.id,
            bankAccountId: input.bankAccountId,
            transactionDate: row.transactionDate,
            amount: row.amountMinor,
            type: row.type,
            description: row.description,
            reference: row.reference,
            normalizedDescription: normalizedText.normalizedDescription,
            normalizedMerchantName: normalizedText.normalizedMerchantName,
          })
        );
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          duplicateCount += 1;
          continue;
        }

        throw error;
      }
    }

    await tx.bankStatementImport.update({
      where: {
        id: statementImport.id,
      },
      data: {
        status:
          failedCount > 0 || duplicateCount > 0
            ? "COMPLETED_WITH_ERRORS"
            : "COMPLETED",
        importedCount,
        duplicateCount,
        failedCount,
        warningCount: duplicateCount,
        processedAt: new Date(),
      },
    });

    return {
      importId: statementImport.id,
      importedCount,
      duplicateCount,
      failedCount,
      queuedForReviewCount,
      suggestedCount,
      taxReviewCount,
      pipelineOutcomes,
      createdTransactionIds,
    };
  });

  let refreshWarning: string | null = null;
  let refreshFailureCount = 0;
  let firstRefreshError: unknown = null;

  for (const transactionId of imported.createdTransactionIds) {
    try {
      await refreshBankTransactionSuggestions(input.workspaceId, transactionId);
    } catch (error) {
      refreshFailureCount += 1;
      if (!firstRefreshError) {
        firstRefreshError = error;
      }
    }
  }

  if (refreshFailureCount > 0) {
    refreshWarning =
      "Imported rows were saved, but some reconciliation suggestions could not be refreshed yet.";
    logError(
      "banking",
      "Bank import completed but failed to refresh reconciliation suggestions for some rows.",
      firstRefreshError,
      {
        workspaceId: input.workspaceId,
        importId: imported.importId,
        refreshFailureCount,
      }
    );
  }

  const guidance = [
    ...parsed.guidance,
    ...(categorizationWarning ? [categorizationWarning] : []),
    ...(refreshWarning ? [refreshWarning] : []),
    ...(imported.importedCount === 0 &&
    imported.duplicateCount > 0 &&
    imported.failedCount === 0
      ? [
          "No new rows were imported because every parsed row already exists for this workspace and bank account.",
        ]
      : []),
  ];

  if (imported.importId) {
    await prisma.bankStatementImport.update({
      where: {
        id: imported.importId,
      },
      data: {
        status:
          imported.failedCount > 0 ||
          imported.duplicateCount > 0 ||
          guidance.length > 0
            ? "COMPLETED_WITH_ERRORS"
            : "COMPLETED",
        warningCount: guidance.length,
      },
    });
  }

  return buildImportResult({
    importId: imported.importId,
    totalRows,
    importedRows: imported.importedCount,
    duplicateRows: imported.duplicateCount,
    invalidRows: imported.failedCount,
    errors: parsed.errors,
    guidance,
    createdTransactionIds: imported.createdTransactionIds,
    categorization: {
      status:
        imported.importedCount > 0
          ? categorizationStatus
          : imported.duplicateCount > 0
            ? "skipped"
            : categorizationStatus,
      processedRows: categorizedRows.length,
      suggestedRows: imported.suggestedCount,
      uncategorizedRows: Math.max(0, imported.importedCount - imported.suggestedCount),
      provider: categorizationProvider,
      warning: categorizationWarning,
    },
    pipeline: {
      rowsReceived: totalRows,
      rowsImported: imported.importedCount,
      rowsSkippedAsDuplicates: imported.duplicateCount,
      rowsInvalid: imported.failedCount,
      rowsQueuedForReview: imported.queuedForReviewCount,
      rowsCategorized: imported.suggestedCount,
      rowsFlaggedForTaxReview: imported.taxReviewCount,
      warnings: guidance,
      errors: parsed.errors,
      categorizationMode: buildImportCategorizationMode(categorizationContext),
      taxMode: imported.pipelineOutcomes.some(
        (outcome) => outcome.taxMode === "suggested_defaults"
      )
        ? "suggested_defaults"
        : "safe_defaults",
    },
  });
}

export async function getWorkspaceBankingDashboard(input: {
  workspaceId: number;
  status?: BankTransactionStatus | null;
  bankAccountId?: number | null;
  clientBusinessId?: number | null;
  importId?: number | null;
  categoryId?: number | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  query?: string | null;
}) {
  if (!input.workspaceId || !Number.isInteger(input.workspaceId) || input.workspaceId <= 0) {
    return buildEmptyBankingDashboard({
      status: "no_workspace",
    });
  }

  try {
    const [
      accounts,
      clientBusinesses,
      imports,
      invoiceOptions,
      ledgerOptions,
      transactionLoad,
    ] = await Promise.all([
      prisma.bankAccount.findMany({
        where: {
          workspaceId: input.workspaceId,
        },
        orderBy: [{ createdAt: "desc" }],
        include: {
          clientBusiness: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      loadWorkspaceClientBusinessOptions(input.workspaceId),
      prisma.bankStatementImport.findMany({
        where: {
          workspaceId: input.workspaceId,
          clientBusinessId: input.clientBusinessId ?? undefined,
          bankAccountId: input.bankAccountId ?? undefined,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 15,
        include: {
          bankAccount: {
            select: {
              id: true,
              name: true,
            },
          },
          clientBusiness: {
            select: {
              id: true,
              name: true,
            },
          },
          uploadedBy: {
            select: {
              fullName: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: {
            in: ["SENT", "OVERDUE"],
          },
        },
        orderBy: [{ dueDate: "asc" }, { issueDate: "desc" }],
        take: 40,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          paymentReference: true,
          issueDate: true,
          dueDate: true,
          client: {
            select: {
              name: true,
              companyName: true,
            },
          },
        },
      }),
      prisma.ledgerTransaction.findMany({
        where: {
          clientBusiness: {
            workspaceId: input.workspaceId,
          },
          clientBusinessId: input.clientBusinessId ?? undefined,
          bankTransactionId: null,
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        take: 60,
        select: {
          id: true,
          description: true,
          reference: true,
          amountMinor: true,
          currency: true,
          direction: true,
          reviewStatus: true,
          transactionDate: true,
          clientBusiness: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      loadWorkspaceBankingTransactions(input),
    ]);

    return {
      status: transactionLoad.status,
      error: transactionLoad.error,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountName: account.name,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        currency: account.currency,
        clientBusinessId: account.clientBusinessId ?? null,
        clientBusinessName: account.clientBusiness?.name ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
      clientBusinesses,
      imports: imports.map((statementImport) => ({
        id: statementImport.id,
        fileName: statementImport.fileName,
        status: statementImport.status,
        createdAt: statementImport.createdAt.toISOString(),
        processedAt: statementImport.processedAt?.toISOString() ?? null,
        rowCount: statementImport.rowCount,
        importedCount: statementImport.importedCount,
        duplicateCount: statementImport.duplicateCount,
        failedCount: statementImport.failedCount,
        warningCount: statementImport.warningCount,
        bankAccount: {
          ...statementImport.bankAccount,
          accountName: statementImport.bankAccount.name,
        },
        clientBusiness: statementImport.clientBusiness,
        uploadedByName: statementImport.uploadedBy?.fullName ?? null,
      })),
      invoiceOptions: invoiceOptions.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.client.companyName ?? invoice.client.name,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        paymentReference: invoice.paymentReference ?? null,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
      })),
      ledgerOptions: ledgerOptions.map((entry) => ({
        id: entry.id,
        description: entry.description,
        reference: entry.reference ?? null,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        direction: entry.direction,
        reviewStatus: entry.reviewStatus,
        transactionDate: entry.transactionDate.toISOString(),
        clientBusinessId: entry.clientBusiness.id,
        clientBusinessName: entry.clientBusiness.name,
      })),
      transactions: transactionLoad.transactions,
      summary: transactionLoad.summary,
      aiConfigured: hasOpenAiServerConfig(),
    } satisfies SerializedBankingDashboard;
  } catch (error) {
    logError(
      "banking",
      "Workspace banking dashboard failed; returning a safe empty dashboard.",
      error,
      {
        workspaceId: input.workspaceId,
      }
    );

    return buildEmptyBankingDashboard({
      status: "error",
      error: "Failed to load transactions.",
    });
  }
}

export async function refreshBankTransactionSuggestions(
  workspaceId: number,
  transactionId: number
) {
  await prisma.$transaction(async (tx) => {
    await refreshReconciliationSuggestions(tx, workspaceId, transactionId);
  });
}

export async function updateBankTransactionClassification(input: {
  workspaceId: number;
  transactionId: number;
  clientBusinessId?: number | null;
  suggestedType?: BankTransactionBusinessType | null;
  counterpartyName?: string | null;
  categoryName?: string | null;
  vatTreatment?: VatTreatment | null;
  whtTreatment?: WhtTreatment | null;
  notes?: string | null;
}) {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        clientBusinessId: true,
        status: true,
      },
    });

    if (!transaction) {
      throw new Error("Bank transaction not found");
    }

    if (transaction.status === "MATCHED" || transaction.status === "SPLIT") {
      throw new Error("This bank transaction is already reconciled. Create a new import adjustment instead of reclassifying it.");
    }

    if (input.clientBusinessId) {
      const business = await tx.clientBusiness.findFirst({
        where: {
          id: input.clientBusinessId,
          workspaceId: input.workspaceId,
        },
        select: { id: true },
      });
      if (!business) {
        throw new Error("Client business not found");
      }
    }

    await tx.bankTransaction.update({
      where: {
        id: input.transactionId,
      },
      data: {
        clientBusinessId:
          input.clientBusinessId === undefined
            ? transaction.clientBusinessId
            : input.clientBusinessId,
        suggestedType: input.suggestedType ?? undefined,
        suggestedCounterparty:
          input.counterpartyName === undefined
            ? undefined
            : normalizeString(input.counterpartyName) || null,
        suggestedCategoryName:
          input.categoryName === undefined ? undefined : normalizeString(input.categoryName) || null,
        suggestedVatTreatment: input.vatTreatment ?? undefined,
        suggestedWhtTreatment: input.whtTreatment ?? undefined,
        reviewNotes: input.notes === undefined ? undefined : normalizeString(input.notes) || null,
        status: "UNMATCHED",
        matchedLedgerTransactionId: null,
        matchedInvoiceId: null,
        matchedAt: null,
        ignoredAt: null,
      },
    });

    await refreshReconciliationSuggestions(tx, input.workspaceId, input.transactionId);
  });

  return prisma.bankTransaction.findFirst({
    where: {
      id: input.transactionId,
      workspaceId: input.workspaceId,
    },
    include: bankTransactionInclude,
  });
}

export async function ignoreBankTransaction(input: {
  workspaceId: number;
  transactionId: number;
}) {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!transaction) {
      throw new Error("Bank transaction not found");
    }

    if (transaction.status === "MATCHED" || transaction.status === "SPLIT") {
      throw new Error("This bank transaction is already reconciled. It cannot be ignored without clearing the existing match.");
    }

    await tx.reconciliationMatch.updateMany({
      where: {
        bankTransactionId: transaction.id,
      },
      data: {
        status: "REJECTED",
        approvedAt: null,
        approvedByUserId: null,
      },
    });

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "IGNORED",
        matchedLedgerTransactionId: null,
        matchedInvoiceId: null,
        ignoredAt: new Date(),
        matchedAt: null,
      },
    });
  });

  return prisma.bankTransaction.findFirst({
    where: {
      id: input.transactionId,
      workspaceId: input.workspaceId,
    },
    include: bankTransactionInclude,
  });
}

export async function approveReconciliationMatch(input: {
  workspaceId: number;
  actorUserId: number;
  matchId: number;
}) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.reconciliationMatch.findFirst({
      where: {
        id: input.matchId,
        workspaceId: input.workspaceId,
      },
      include: {
        bankTransaction: true,
        ledgerTransaction: {
          include: {
            clientBusiness: true,
          },
        },
        bookkeepingDraft: {
          include: {
            upload: true,
            ledgerTransaction: true,
          },
        },
        invoice: true,
      },
    });

    if (!match) {
      throw new Error("Reconciliation match not found");
    }

    if (match.status === "APPROVED") {
      return;
    }

    assertTransactionCanCreateOrApproveMatch(match.bankTransaction, "approve this reconciliation match");

    const now = new Date();
    let createdLedgerTransactionId: number | null = null;

    if (match.matchType === "LEDGER_TRANSACTION") {
      if (!match.ledgerTransactionId) {
        throw new Error("Suggested ledger transaction is missing");
      }

      if (
        match.ledgerTransaction?.bankTransactionId &&
        match.ledgerTransaction.bankTransactionId !== match.bankTransactionId
      ) {
        throw new Error("This ledger transaction is already linked to another bank transaction.");
      }

      await tx.ledgerTransaction.update({
        where: {
          id: match.ledgerTransactionId,
        },
        data: {
          bankTransactionId: match.bankTransactionId,
          reviewStatus: "POSTED",
        },
      });

      createdLedgerTransactionId = match.ledgerTransactionId;

      if (!match.bankTransaction.clientBusinessId && match.ledgerTransaction?.clientBusinessId) {
        await tx.bankTransaction.update({
          where: {
            id: match.bankTransactionId,
          },
          data: {
            clientBusinessId: match.ledgerTransaction.clientBusinessId,
          },
        });
      }
    } else if (match.matchType === "BOOKKEEPING_DRAFT") {
      if (!match.bookkeepingDraftId || !match.bookkeepingDraft) {
        throw new Error("Suggested bookkeeping draft is missing");
      }

      if (match.bookkeepingDraft.ledgerTransaction?.id) {
        createdLedgerTransactionId = match.bookkeepingDraft.ledgerTransaction.id;
        if (
          match.bookkeepingDraft.ledgerTransaction.bankTransactionId &&
          match.bookkeepingDraft.ledgerTransaction.bankTransactionId !== match.bankTransactionId
        ) {
          throw new Error("This bookkeeping draft is already linked to another bank transaction.");
        }
        await tx.ledgerTransaction.update({
          where: { id: createdLedgerTransactionId },
          data: {
            bankTransactionId: match.bankTransactionId,
            reviewStatus: "POSTED",
          },
        });
      } else {
        const vendorId = await resolveVendorForDraft(
          tx,
          match.bookkeepingDraft.upload.clientBusinessId,
          match.bookkeepingDraft.vendorName ?? null
        );
        const categoryId = await resolveCategoryForDraft(tx, {
          clientBusinessId: match.bookkeepingDraft.upload.clientBusinessId,
          categoryId: match.bookkeepingDraft.categoryId,
          suggestedCategoryName: match.bookkeepingDraft.suggestedCategoryName,
          direction: match.bookkeepingDraft.direction,
        });

        const transaction = await tx.ledgerTransaction.create({
          data: {
            clientBusinessId: match.bookkeepingDraft.upload.clientBusinessId,
            vendorId,
            categoryId,
            bankTransactionId: match.bankTransactionId,
            sourceDraftId: match.bookkeepingDraft.id,
            createdByUserId: input.actorUserId,
            transactionDate:
              match.bookkeepingDraft.proposedDate ?? match.bankTransaction.transactionDate,
            description:
              match.bookkeepingDraft.description ?? match.bankTransaction.description,
            reference: match.bookkeepingDraft.reference ?? match.bankTransaction.reference,
            direction: match.bookkeepingDraft.direction,
            amountMinor: match.bookkeepingDraft.amountMinor ?? match.bankTransaction.amount,
            currency: match.bookkeepingDraft.currency,
            vatAmountMinor: match.bookkeepingDraft.vatAmountMinor,
            whtAmountMinor: match.bookkeepingDraft.whtAmountMinor,
            vatTreatment: match.bookkeepingDraft.vatTreatment,
            whtTreatment: match.bookkeepingDraft.whtTreatment,
            origin: "IMPORT",
            reviewStatus: "POSTED",
            notes: match.bookkeepingDraft.reviewerNote,
          },
          select: {
            id: true,
          },
        });

        createdLedgerTransactionId = transaction.id;
      }

      await tx.bookkeepingDraft.update({
        where: {
          id: match.bookkeepingDraft.id,
        },
        data: {
          reviewedByUserId: input.actorUserId,
          reviewStatus: "APPROVED",
          reviewedAt: now,
          approvedAt: now,
        },
      });
      await recalculateBookkeepingUploadStatus(tx, match.bookkeepingDraft.uploadId);

      await tx.bankTransaction.update({
        where: {
          id: match.bankTransactionId,
        },
        data: {
          clientBusinessId: match.bookkeepingDraft.upload.clientBusinessId,
        },
      });
    } else if (match.matchType === "INVOICE") {
      if (!match.invoiceId || !match.invoice) {
        throw new Error("Suggested invoice is missing");
      }

      const clientBusinessId = match.bankTransaction.clientBusinessId;
      if (!clientBusinessId) {
        throw new Error("Assign this bank transaction to a client business before approving the invoice match");
      }

      const updatedInvoice =
        match.invoice.status !== "PAID" || !match.invoice.paidAt || !match.invoice.clientBusinessId
          ? await tx.invoice.update({
              where: { id: match.invoice.id },
              data: {
                clientBusinessId,
                status: "PAID",
                paidAt: match.invoice.paidAt ?? match.bankTransaction.transactionDate,
              },
            })
          : match.invoice;

      await ensureInvoiceIncomeTaxRecord(tx, {
        invoice: updatedInvoice,
        actorUserId: input.actorUserId,
        occurredOn: updatedInvoice.paidAt ?? match.bankTransaction.transactionDate,
      });

      const ledgerResult = await createIncomeEntryFromInvoice(tx, {
        invoiceId: updatedInvoice.id,
        actorUserId: input.actorUserId,
        occurredOn: updatedInvoice.paidAt ?? match.bankTransaction.transactionDate,
        bankTransactionId: match.bankTransactionId,
        clientBusinessId,
      });

      if (!ledgerResult.entryId) {
        throw new Error(
          ledgerResult.skippedReason
            ? `Unable to link this invoice to the ledger (${ledgerResult.skippedReason}).`
            : "Unable to link this invoice to the ledger."
        );
      }

      createdLedgerTransactionId = ledgerResult.entryId;
    }

    const approved = await tx.reconciliationMatch.update({
      where: {
        id: match.id,
      },
      data: {
        status: "APPROVED",
        approvedAt: now,
        approvedByUserId: input.actorUserId,
        ledgerTransactionId: createdLedgerTransactionId ?? match.ledgerTransactionId,
      },
      select: {
        id: true,
      },
    });

    await markOnlyApprovedMatch(tx, match.bankTransactionId, approved.id);

    const matchedLedgerTransactionId = createdLedgerTransactionId ?? match.ledgerTransactionId ?? null;
    const matchedInvoiceId = match.invoiceId ?? null;

    await tx.bankTransaction.update({
      where: {
        id: match.bankTransactionId,
      },
      data: {
        status: "MATCHED",
        matchedLedgerTransactionId,
        matchedInvoiceId,
        matchedAt: now,
        ignoredAt: null,
      },
    });
  });

  return prisma.reconciliationMatch.findFirst({
    where: {
      id: input.matchId,
      workspaceId: input.workspaceId,
    },
    include: {
      bankTransaction: {
        include: bankTransactionInclude,
      },
    },
  });
}

export async function createManualLedgerMatch(input: {
  workspaceId: number;
  actorUserId: number;
  payload: CreateLedgerInput;
}) {
  const transaction = await prisma.$transaction(async (tx) => {
    const bankTransaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.payload.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        clientBusinessId: true,
        status: true,
        amount: true,
        type: true,
        currency: true,
        description: true,
        reference: true,
        transactionDate: true,
        vatTreatment: true,
        whtTreatment: true,
        vatRate: true,
        whtRate: true,
        vatAmountMinor: true,
        whtAmountMinor: true,
        taxTreatmentSource: true,
        suggestedType: true,
        suggestedCategoryName: true,
        suggestedVatTreatment: true,
        suggestedWhtTreatment: true,
      },
    });

    if (!bankTransaction) {
      throw new Error("Bank transaction not found");
    }

    assertTransactionCanCreateOrApproveMatch(
      bankTransaction,
      "create a ledger transaction for it"
    );

    const clientBusinessId = input.payload.clientBusinessId ?? bankTransaction.clientBusinessId;
    if (!clientBusinessId) {
      throw new Error("Select a client business before posting this transaction");
    }

    const ledgerTransaction = await createPostedLedgerTransaction(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      bankTransaction,
      clientBusinessId,
      description: input.payload.description,
      reference: input.payload.reference,
      vendorName: input.payload.vendorName,
      categoryId: input.payload.categoryId ?? null,
      categoryName: input.payload.categoryName,
      suggestedType: input.payload.suggestedType,
      vatTreatment: input.payload.vatTreatment,
      whtTreatment: input.payload.whtTreatment,
      vatAmountMinor: input.payload.vatAmountMinor,
      whtAmountMinor: input.payload.whtAmountMinor,
      notes: input.payload.notes,
    });

    const match = await tx.reconciliationMatch.create({
      data: {
        workspaceId: input.workspaceId,
        bankTransactionId: bankTransaction.id,
        ledgerTransactionId: ledgerTransaction.id,
        matchType: "MANUAL",
        status: "APPROVED",
        score: 1,
        matchedAmountMinor: bankTransaction.amount,
        rationale: "Posted from manual reconciliation review",
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    await markOnlyApprovedMatch(tx, bankTransaction.id, match.id);

    await tx.bankTransaction.update({
      where: {
        id: bankTransaction.id,
      },
      data: {
        clientBusinessId,
        status: "MATCHED",
        matchedLedgerTransactionId: ledgerTransaction.id,
        matchedInvoiceId: null,
        matchedAt: new Date(),
        ignoredAt: null,
      },
    });

    return bankTransaction.id;
  });

  return prisma.bankTransaction.findFirst({
    where: {
      id: transaction,
      workspaceId: input.workspaceId,
    },
    include: bankTransactionInclude,
  });
}

export async function linkBankTransactionToLedger(input: {
  workspaceId: number;
  actorUserId: number;
  payload: LinkLedgerInput;
}) {
  const matchId = await prisma.$transaction(async (tx) => {
    const bankTransaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.payload.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        type: true,
        amount: true,
        clientBusinessId: true,
        status: true,
      },
    });

    if (!bankTransaction) {
      throw new Error("Bank transaction not found");
    }

    assertTransactionCanCreateOrApproveMatch(
      bankTransaction,
      "link it to an existing ledger entry"
    );

    const ledgerTransaction = await tx.ledgerTransaction.findFirst({
      where: {
        id: input.payload.ledgerTransactionId,
        clientBusiness: {
          workspaceId: input.workspaceId,
        },
      },
      select: {
        id: true,
        clientBusinessId: true,
        bankTransactionId: true,
        amountMinor: true,
        direction: true,
      },
    });

    if (!ledgerTransaction) {
      throw new Error("Ledger transaction not found");
    }

    if (
      ledgerTransaction.bankTransactionId &&
      ledgerTransaction.bankTransactionId !== bankTransaction.id
    ) {
      throw new Error("This ledger transaction is already linked to another bank transaction.");
    }

    const expectedDirection = bankTransaction.type === "CREDIT" ? "MONEY_IN" : "MONEY_OUT";
    if (ledgerTransaction.direction !== expectedDirection) {
      throw new Error("Ledger transaction direction does not match this bank transaction.");
    }

    const amountTolerance = Math.max(250, Math.round(bankTransaction.amount * 0.05));
    if (Math.abs(ledgerTransaction.amountMinor - bankTransaction.amount) > amountTolerance) {
      throw new Error("Ledger transaction amount is outside the allowed reconciliation tolerance.");
    }

    const clientBusinessId =
      input.payload.clientBusinessId ??
      bankTransaction.clientBusinessId ??
      ledgerTransaction.clientBusinessId;

    if (!clientBusinessId) {
      throw new Error("Select a client business before linking the ledger entry");
    }

    if (ledgerTransaction.clientBusinessId !== clientBusinessId) {
      throw new Error("The selected ledger entry belongs to a different client business.");
    }

    await tx.bankTransaction.update({
      where: {
        id: bankTransaction.id,
      },
      data: {
        clientBusinessId,
        status: "UNMATCHED",
        matchedLedgerTransactionId: null,
        matchedInvoiceId: null,
        matchedAt: null,
        ignoredAt: null,
      },
    });

    const existingMatch = await tx.reconciliationMatch.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bankTransactionId: bankTransaction.id,
        ledgerTransactionId: ledgerTransaction.id,
      },
      select: {
        id: true,
      },
    });

    if (existingMatch) {
      await tx.reconciliationMatch.update({
        where: {
          id: existingMatch.id,
        },
        data: {
          status: "SUGGESTED",
          score: 1,
          matchedAmountMinor: bankTransaction.amount,
          rationale: "Ledger entry linked manually from reconciliation review",
          approvedAt: null,
          approvedByUserId: null,
        },
      });

      return existingMatch.id;
    }

    const createdMatch = await tx.reconciliationMatch.create({
      data: {
        workspaceId: input.workspaceId,
        bankTransactionId: bankTransaction.id,
        ledgerTransactionId: ledgerTransaction.id,
        matchType: "LEDGER_TRANSACTION",
        status: "SUGGESTED",
        score: 1,
        matchedAmountMinor: bankTransaction.amount,
        rationale: "Ledger entry linked manually from reconciliation review",
      },
      select: {
        id: true,
      },
    });

    return createdMatch.id;
  });

  const match = await approveReconciliationMatch({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    matchId,
  });

  return match?.bankTransaction ?? null;
}

export async function linkBankTransactionToInvoice(input: {
  workspaceId: number;
  actorUserId: number;
  payload: LinkInvoiceInput;
}) {
  const matchId = await prisma.$transaction(async (tx) => {
    const bankTransaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.payload.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        type: true,
        amount: true,
        clientBusinessId: true,
        status: true,
      },
    });

    if (!bankTransaction) {
      throw new Error("Bank transaction not found");
    }

    assertTransactionCanCreateOrApproveMatch(
      bankTransaction,
      "link it to an invoice"
    );

    if (bankTransaction.type !== "CREDIT") {
      throw new Error("Only credit transactions can be linked directly to an invoice");
    }

    const invoice = await tx.invoice.findFirst({
      where: {
        id: input.payload.invoiceId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
      },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const clientBusinessId = input.payload.clientBusinessId ?? bankTransaction.clientBusinessId;
    if (!clientBusinessId) {
      throw new Error("Select a client business before linking the invoice");
    }

    const business = await tx.clientBusiness.findFirst({
      where: {
        id: clientBusinessId,
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!business) {
      throw new Error("Client business not found");
    }

    await tx.bankTransaction.update({
      where: {
        id: bankTransaction.id,
      },
      data: {
        clientBusinessId,
        status: "UNMATCHED",
        matchedLedgerTransactionId: null,
        matchedInvoiceId: null,
        matchedAt: null,
        ignoredAt: null,
      },
    });

    const existingMatch = await tx.reconciliationMatch.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bankTransactionId: bankTransaction.id,
        invoiceId: invoice.id,
      },
      select: {
        id: true,
      },
    });

    if (existingMatch) {
      await tx.reconciliationMatch.update({
        where: {
          id: existingMatch.id,
        },
        data: {
          status: "SUGGESTED",
          score: 1,
          matchedAmountMinor: bankTransaction.amount,
          rationale: "Invoice linked manually from reconciliation review",
          approvedAt: null,
          approvedByUserId: null,
        },
      });

      return existingMatch.id;
    }

    const createdMatch = await tx.reconciliationMatch.create({
      data: {
        workspaceId: input.workspaceId,
        bankTransactionId: bankTransaction.id,
        invoiceId: invoice.id,
        matchType: "INVOICE",
        status: "SUGGESTED",
        score: 1,
        matchedAmountMinor: bankTransaction.amount,
        rationale: "Invoice linked manually from reconciliation review",
      },
      select: {
        id: true,
      },
    });

    return createdMatch.id;
  });

  const match = await approveReconciliationMatch({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    matchId,
  });

  return match?.bankTransaction ?? null;
}

export async function splitBankTransaction(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
  clientBusinessId?: number | null;
  lines: SplitLineInput[];
}) {
  const totalMinor = input.lines.reduce((sum, line) => sum + line.amountMinor, 0);

  const transactionId = await prisma.$transaction(async (tx) => {
    const bankTransaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        clientBusinessId: true,
        amount: true,
        type: true,
        currency: true,
        description: true,
        reference: true,
        transactionDate: true,
        status: true,
      },
    });

    if (!bankTransaction) {
      throw new Error("Bank transaction not found");
    }

    assertTransactionCanCreateOrApproveMatch(
      bankTransaction,
      "split it into ledger lines"
    );

    if (totalMinor !== bankTransaction.amount) {
      throw new Error("Split lines must total the full bank transaction amount");
    }

    const clientBusinessId = input.clientBusinessId ?? bankTransaction.clientBusinessId;
    if (!clientBusinessId) {
      throw new Error("Select a client business before splitting the transaction");
    }

    await tx.bankTransactionSplitLine.deleteMany({
      where: {
        bankTransactionId: bankTransaction.id,
      },
    });

    const splitMatch = await tx.reconciliationMatch.create({
      data: {
        workspaceId: input.workspaceId,
        bankTransactionId: bankTransaction.id,
        matchType: "SPLIT",
        status: "APPROVED",
        score: 1,
        matchedAmountMinor: bankTransaction.amount,
        rationale: "Split into multiple accounting lines",
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    await markOnlyApprovedMatch(tx, bankTransaction.id, splitMatch.id);

    for (const line of input.lines) {
      const suggestedType = line.suggestedType ?? (bankTransaction.type === "CREDIT" ? "INCOME" : "EXPENSE");
      const direction = inferDirectionFromBusinessType(bankTransaction.type, suggestedType);
      const vendorId = await resolveVendorForDraft(
        tx,
        clientBusinessId,
        normalizeString(line.vendorName) || null
      );
      const categoryId = await resolveCategoryForDraft(tx, {
        clientBusinessId,
        categoryId: line.categoryId ?? null,
        suggestedCategoryName:
          normalizeString(line.categoryName) || (suggestedType === "INCOME" ? "Revenue" : "Operations"),
        direction,
      });

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          clientBusinessId,
          vendorId,
          categoryId,
          bankTransactionId: bankTransaction.id,
          createdByUserId: input.actorUserId,
          transactionDate: bankTransaction.transactionDate,
          description: normalizeString(line.description) || bankTransaction.description,
          reference: normalizeString(line.reference) || bankTransaction.reference,
          direction,
          amountMinor: line.amountMinor,
          currency: bankTransaction.currency,
          vatAmountMinor: line.vatAmountMinor ?? 0,
          whtAmountMinor: line.whtAmountMinor ?? 0,
          vatTreatment: line.vatTreatment ?? "NONE",
          whtTreatment: line.whtTreatment ?? "NONE",
          origin: "IMPORT",
          reviewStatus: "POSTED",
          notes: normalizeString(line.notes) || null,
        },
        select: {
          id: true,
        },
      });

      await tx.bankTransactionSplitLine.create({
        data: {
          bankTransactionId: bankTransaction.id,
          clientBusinessId,
          vendorId,
          categoryId,
          ledgerTransactionId: ledgerTransaction.id,
          createdByUserId: input.actorUserId,
          description: normalizeString(line.description) || bankTransaction.description,
          reference: normalizeString(line.reference) || bankTransaction.reference,
          amountMinor: line.amountMinor,
          direction,
          currency: bankTransaction.currency,
          vatAmountMinor: line.vatAmountMinor ?? 0,
          whtAmountMinor: line.whtAmountMinor ?? 0,
          vatTreatment: line.vatTreatment ?? "NONE",
          whtTreatment: line.whtTreatment ?? "NONE",
          notes: normalizeString(line.notes) || null,
        },
      });
    }

    await tx.bankTransaction.update({
      where: {
        id: bankTransaction.id,
      },
      data: {
        clientBusinessId,
        status: "SPLIT",
        matchedLedgerTransactionId: null,
        matchedInvoiceId: null,
        matchedAt: new Date(),
        ignoredAt: null,
      },
    });

    return bankTransaction.id;
  });

  return prisma.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId: input.workspaceId,
    },
    include: bankTransactionInclude,
  });
}
