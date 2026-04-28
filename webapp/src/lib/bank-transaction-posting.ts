import "server-only";

import { Prisma, type BankTransactionStatus, type PrismaClient } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  getWorkspacePostingChartAccounts,
  resolveWorkspaceBankTransactionPostingAccounts,
  resolveWorkspaceBankTransactionPostingAccountsFromChartAccounts,
  type PostingCategoryAccount,
} from "@/lib/bank-transaction-account-mapping";
import {
  isBankTransactionReadyToPost,
  resolveBankTransactionAccountingPostingStatus,
} from "@/lib/bank-transaction-posting-status";
import {
  buildBankTransactionPostingJournalLines,
  calculatePrimaryPostingLineAmount,
} from "@/lib/bank-transaction-posting-lines";
import {
  bankTransactionInclude,
  serializeBankTransaction,
  type SerializedBankTransaction,
} from "@/lib/banking";
import { postBankTransactionToFinancialEngineWithExecutor } from "@/lib/accounting/postTransaction";
import type { JournalBalanceSummary } from "@/lib/accounting-types";
import { createJournalEntryWithExecutor } from "@/lib/journal-entries";
import { prisma } from "@/lib/prisma";
import { resolveBankTransactionTax } from "@/lib/transaction-tax";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

const bankTransactionPostingSelect = {
  id: true,
  workspaceId: true,
  clientBusinessId: true,
  bankAccountId: true,
  categoryId: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  type: true,
  status: true,
  reviewStatus: true,
  postingReadiness: true,
  accountingPostingStatus: true,
  currency: true,
  reviewedAt: true,
  reviewedByUserId: true,
  matchedLedgerTransactionId: true,
  matchedInvoiceId: true,
  vatTreatment: true,
  whtTreatment: true,
  vatRate: true,
  whtRate: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  taxTreatmentSource: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      code: true,
    },
  },
  postedJournalEntry: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type PostingTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof bankTransactionPostingSelect;
}>;

const bankTransactionWorkflowSummarySelect = {
  id: true,
  status: true,
  reviewStatus: true,
  postingReadiness: true,
  vatTreatment: true,
  whtTreatment: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      code: true,
    },
  },
  postedJournalEntry: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type WorkflowSummaryTransactionRecord = Prisma.BankTransactionGetPayload<{
  select: typeof bankTransactionWorkflowSummarySelect;
}>;

export type BankTransactionWorkflowStatus =
  | "empty"
  | "NOT_STARTED"
  | "IN_REVIEW"
  | "READY_TO_POST"
  | "BLOCKED"
  | "REPORTS_READY";

export type WorkspaceBankTransactionWorkflowSummary = {
  workspaceId: number;
  total: number;
  byStatus: Record<BankTransactionStatus, number>;
  pendingReview: number;
  matched: number;
  unmatched: number;
  suggested: number;
  ignored: number;
  requiresSetup: boolean;
  totalTransactions: number;
  unpostedCount: number;
  readyToPostCount: number;
  postedCount: number;
  blockedByAccountMappingCount: number;
  latestPostedAt: string | null;
  status: BankTransactionWorkflowStatus;
  headline: string;
  detail: string;
};

export type BankTransactionPostingFailureCode =
  | "ALREADY_POSTED"
  | "NOT_READY_TO_POST"
  | "RECONCILIATION_LOCKED"
  | "CATEGORY_REQUIRED"
  | "UNSUPPORTED_CATEGORY_TYPE"
  | "CATEGORY_DIRECTION_CONFLICT"
  | "CATEGORY_ACCOUNT_MISSING"
  | "BANK_ACCOUNT_MISSING"
  | "TAX_ACCOUNT_MISSING"
  | "INVALID_AMOUNT"
  | "INVALID_TAX_CONFIGURATION"
  | "TRANSACTION_NOT_FOUND";

export type BankTransactionPostingResult =
  | {
      ok: true;
      status: "POSTED";
      transactionId: number;
      journalEntryId: number;
      accountingPostingStatus: "POSTED";
      balance: JournalBalanceSummary;
      transaction: SerializedBankTransaction;
    }
  | {
      ok: false;
      status: "REVIEW_NEEDED" | "SKIPPED";
      code: BankTransactionPostingFailureCode;
      reason: string;
      transactionId: number;
      accountingPostingStatus: "UNPOSTED" | "READY_TO_POST" | "POSTED";
      transaction: SerializedBankTransaction | null;
    };

export class BankTransactionPostingNotFoundError extends Error {
  constructor(message = "Transaction not found.") {
    super(message);
    this.name = "BankTransactionPostingNotFoundError";
  }
}

function buildWorkflowMappingCacheKey(transaction: WorkflowSummaryTransactionRecord) {
  return [
    transaction.category?.id ?? "no-category",
    transaction.vatTreatment === "OUTPUT" || transaction.suggestedVatTreatment === "OUTPUT"
      ? "vat"
      : "no-vat",
    transaction.whtTreatment === "PAYABLE" || transaction.suggestedWhtTreatment === "PAYABLE"
      ? "wht"
      : "no-wht",
  ].join(":");
}

function buildEmptyWorkflowStatusCounts(): Record<BankTransactionStatus, number> {
  return {
    UNMATCHED: 0,
    SUGGESTED: 0,
    MATCHED: 0,
    IGNORED: 0,
    SPLIT: 0,
    REVIEW_REQUIRED: 0,
  };
}

function resolveWorkflowStatus(input: {
  totalTransactions: number;
  postedCount: number;
  readyToPostCount: number;
  blockedByAccountMappingCount: number;
}) {
  if (input.totalTransactions === 0) {
    return "empty" satisfies BankTransactionWorkflowStatus;
  }

  if (input.blockedByAccountMappingCount > 0) {
    return "BLOCKED" satisfies BankTransactionWorkflowStatus;
  }

  if (input.readyToPostCount > 0) {
    return "READY_TO_POST" satisfies BankTransactionWorkflowStatus;
  }

  if (input.postedCount > 0) {
    return "REPORTS_READY" satisfies BankTransactionWorkflowStatus;
  }

  return "IN_REVIEW" satisfies BankTransactionWorkflowStatus;
}

function buildWorkflowNarrative(input: {
  totalTransactions: number;
  postedCount: number;
  readyToPostCount: number;
  blockedByAccountMappingCount: number;
}) {
  if (input.totalTransactions === 0) {
    return {
      headline: "Ready to start",
      detail: "Import a bank statement to begin review, posting, and reporting in this workspace.",
    };
  }

  if (input.blockedByAccountMappingCount > 0) {
    return {
      headline: "Mapping needs attention",
      detail: `${input.blockedByAccountMappingCount} transaction${
        input.blockedByAccountMappingCount === 1 ? "" : "s"
      } can be reviewed but still need ledger account mapping before posting.`,
    };
  }

  if (input.readyToPostCount > 0) {
    return {
      headline: "Ledger is ready",
      detail: `${input.readyToPostCount} reviewed transaction${
        input.readyToPostCount === 1 ? "" : "s"
      } can move into the ledger and refresh reports immediately after posting.`,
    };
  }

  if (input.postedCount > 0) {
    return {
      headline: "Reports are live",
      detail: `${input.postedCount} transaction${
        input.postedCount === 1 ? "" : "s"
      } already sit in the workspace ledger and are available in financial reports.`,
    };
  }

  return {
    headline: "Review in progress",
    detail: "Keep categorizing and reviewing transactions so the next posting batch can land in reports.",
  };
}

export function buildEmptyWorkspaceBankTransactionWorkflowSummary(input: {
  workspaceId: number;
  requiresSetup?: boolean;
  latestPostedAt?: string | null;
}): WorkspaceBankTransactionWorkflowSummary {
  return {
    workspaceId: input.workspaceId,
    total: 0,
    byStatus: buildEmptyWorkflowStatusCounts(),
    pendingReview: 0,
    matched: 0,
    unmatched: 0,
    suggested: 0,
    ignored: 0,
    requiresSetup: input.requiresSetup ?? true,
    totalTransactions: 0,
    unpostedCount: 0,
    readyToPostCount: 0,
    postedCount: 0,
    blockedByAccountMappingCount: 0,
    latestPostedAt: input.latestPostedAt ?? null,
    status: "empty",
    headline: "No transactions are waiting for review or posting yet.",
    detail:
      "Import a bank statement or add a manual transaction to start the review-to-report flow for this workspace.",
  };
}

function isKnownPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

function buildPostingMemo(transaction: PostingTransactionRecord) {
  const reference = transaction.reference?.trim();
  if (reference) {
    return `${transaction.description} (${reference})`;
  }
  return transaction.description;
}

function buildJournalReference(transaction: PostingTransactionRecord) {
  return transaction.reference?.trim() || `BANK:${transaction.id}`;
}

async function getPostingTransactionOrThrow(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId,
    },
    select: bankTransactionPostingSelect,
  });

  if (!transaction) {
    throw new BankTransactionPostingNotFoundError();
  }

  return transaction;
}

async function prepareTransactionForPosting(
  db: PrismaExecutor,
  transaction: PostingTransactionRecord
) {
  let clientBusinessId = transaction.clientBusinessId;

  if (!clientBusinessId) {
    const defaultBusiness = await db.clientBusiness.findFirst({
      where: {
        workspaceId: transaction.workspaceId,
        archivedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
      },
    });

    if (defaultBusiness) {
      clientBusinessId = defaultBusiness.id;
    }
  }

  if (!clientBusinessId) {
    return transaction;
  }

  const postingReadiness = "READY_TO_POST" as const;
  const accountingPostingStatus = resolveBankTransactionAccountingPostingStatus({
    reviewStatus: transaction.reviewStatus,
    postingReadiness,
    hasPostedJournalEntry: Boolean(transaction.postedJournalEntry),
  });
  const data: Prisma.BankTransactionUncheckedUpdateInput = {};

  if (transaction.clientBusinessId !== clientBusinessId) {
    data.clientBusinessId = clientBusinessId;
  }

  if (transaction.postingReadiness !== postingReadiness) {
    data.postingReadiness = postingReadiness;
  }

  if (transaction.accountingPostingStatus !== accountingPostingStatus) {
    data.accountingPostingStatus = accountingPostingStatus;
  }

  if (Object.keys(data).length === 0) {
    return transaction;
  }

  return db.bankTransaction.update({
    where: {
      id: transaction.id,
    },
    data,
    select: bankTransactionPostingSelect,
  });
}

async function getSerializedBankTransactionOrNull(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId,
    },
    include: bankTransactionInclude,
  });

  return transaction ? serializeBankTransaction(transaction) : null;
}

function buildFailureResult(input: {
  transaction: PostingTransactionRecord;
  code: Exclude<BankTransactionPostingFailureCode, "TRANSACTION_NOT_FOUND">;
  reason: string;
  transactionPayload: SerializedBankTransaction | null;
}) {
  const accountingPostingStatus = resolveBankTransactionAccountingPostingStatus({
    reviewStatus: input.transaction.reviewStatus,
    postingReadiness: input.transaction.postingReadiness,
    hasPostedJournalEntry: Boolean(input.transaction.postedJournalEntry),
  });

  return {
    ok: false as const,
    status:
      input.code === "ALREADY_POSTED" || input.code === "RECONCILIATION_LOCKED"
        ? ("SKIPPED" as const)
        : ("REVIEW_NEEDED" as const),
    code: input.code,
    reason: input.reason,
    transactionId: input.transaction.id,
    accountingPostingStatus,
    transaction: input.transactionPayload,
  };
}

function resolveTaxLiabilityLines(input: {
  transaction: PostingTransactionRecord;
  vatPayableAccountId: number | null;
  whtPayableAccountId: number | null;
}) {
  const resolvedTax = resolveBankTransactionTax({
    amountMinor: input.transaction.amount,
    description: input.transaction.description,
    reference: input.transaction.reference,
    vatTreatment: input.transaction.vatTreatment,
    whtTreatment: input.transaction.whtTreatment,
    vatRate: input.transaction.vatRate,
    whtRate: input.transaction.whtRate,
    vatAmountMinor: input.transaction.vatAmountMinor,
    whtAmountMinor: input.transaction.whtAmountMinor,
    taxTreatmentSource: input.transaction.taxTreatmentSource,
    suggestedVatTreatment: input.transaction.suggestedVatTreatment,
    suggestedWhtTreatment: input.transaction.suggestedWhtTreatment,
  });

  const taxLines: Array<{
    accountId: number;
    amountMinor: number;
    description: string;
  }> = [];

  if (resolvedTax.vatTreatment === "OUTPUT" && resolvedTax.vatAmountMinor > 0) {
    if (!input.vatPayableAccountId) {
      return {
        ok: false as const,
        code: "TAX_ACCOUNT_MISSING" as const,
        reason: "VAT metadata exists, but no VAT payable account is mapped.",
      };
    }

    taxLines.push({
      accountId: input.vatPayableAccountId,
      amountMinor: resolvedTax.vatAmountMinor,
      description: "VAT payable",
    });
  }

  if (resolvedTax.whtTreatment === "PAYABLE" && resolvedTax.whtAmountMinor > 0) {
    if (!input.whtPayableAccountId) {
      return {
        ok: false as const,
        code: "TAX_ACCOUNT_MISSING" as const,
        reason: "WHT metadata exists, but no WHT payable account is mapped.",
      };
    }

    taxLines.push({
      accountId: input.whtPayableAccountId,
      amountMinor: resolvedTax.whtAmountMinor,
      description: "WHT payable",
    });
  }

  return {
    ok: true as const,
    taxLines,
  };
}

async function postWorkspaceBankTransactionWithExecutor(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    actorUserId: number;
    transactionId: number;
  }
): Promise<BankTransactionPostingResult> {
  let transaction = await getPostingTransactionOrThrow(
    db,
    input.workspaceId,
    input.transactionId
  );
  transaction = await prepareTransactionForPosting(db, transaction);

  const transactionPayload = await getSerializedBankTransactionOrNull(
    db,
    input.workspaceId,
    input.transactionId
  );

  const accountingPostingStatus = resolveBankTransactionAccountingPostingStatus({
    reviewStatus: transaction.reviewStatus,
    postingReadiness: transaction.postingReadiness,
    hasPostedJournalEntry: Boolean(transaction.postedJournalEntry),
  });

  if (accountingPostingStatus === "POSTED" || transaction.postedJournalEntry) {
    return buildFailureResult({
      transaction,
      code: "ALREADY_POSTED",
      reason: "This bank transaction has already been posted to the ledger.",
      transactionPayload,
    });
  }

  if (
    transaction.status === "MATCHED" ||
    transaction.status === "SPLIT" ||
    transaction.status === "IGNORED" ||
    transaction.matchedLedgerTransactionId ||
    transaction.matchedInvoiceId
  ) {
    return buildFailureResult({
      transaction,
      code: "RECONCILIATION_LOCKED",
      reason: "Reconciled or ignored bank transactions must be reviewed before ledger posting.",
      transactionPayload,
    });
  }

  if (!Number.isInteger(transaction.amount) || transaction.amount <= 0) {
    return buildFailureResult({
      transaction,
      code: "INVALID_AMOUNT",
      reason: "This bank transaction amount is invalid for posting.",
      transactionPayload,
    });
  }

  if (!transaction.category) {
    return buildFailureResult({
      transaction,
      code: "CATEGORY_REQUIRED",
      reason: "Assign a reviewed category before posting this transaction.",
      transactionPayload,
    });
  }

  if (transaction.type === "CREDIT" && transaction.category.type === "EXPENSE") {
    return buildFailureResult({
      transaction,
      code: "CATEGORY_DIRECTION_CONFLICT",
      reason: "Expense categories need review before posting a money-in transaction.",
      transactionPayload,
    });
  }

  if (transaction.type === "DEBIT" && transaction.category.type === "INCOME") {
    return buildFailureResult({
      transaction,
      code: "CATEGORY_DIRECTION_CONFLICT",
      reason: "Income categories need review before posting a money-out transaction.",
      transactionPayload,
    });
  }

  const needsVatPayableAccount =
    transaction.vatTreatment === "OUTPUT" ||
    transaction.suggestedVatTreatment === "OUTPUT";
  const needsWhtPayableAccount =
    transaction.whtTreatment === "PAYABLE" ||
    transaction.suggestedWhtTreatment === "PAYABLE";
  const accountMapping = await resolveWorkspaceBankTransactionPostingAccounts(db, {
    workspaceId: input.workspaceId,
    category: transaction.category as PostingCategoryAccount,
    needsVatPayableAccount,
    needsWhtPayableAccount,
  });

  if (!accountMapping.ok) {
    return buildFailureResult({
      transaction,
      code: accountMapping.code,
      reason: accountMapping.reason,
      transactionPayload,
    });
  }

  const taxLines = resolveTaxLiabilityLines({
    transaction,
    vatPayableAccountId: accountMapping.vatPayableAccount?.id ?? null,
    whtPayableAccountId: accountMapping.whtPayableAccount?.id ?? null,
  });

  if (!taxLines.ok) {
    return buildFailureResult({
      transaction,
      code: taxLines.code,
      reason: taxLines.reason,
      transactionPayload,
    });
  }

  const primaryLineAmount = calculatePrimaryPostingLineAmount({
    amountMinor: transaction.amount,
    type: transaction.type,
    taxLines: taxLines.taxLines,
  });

  if (!Number.isInteger(primaryLineAmount) || primaryLineAmount <= 0) {
    return buildFailureResult({
      transaction,
      code: "INVALID_TAX_CONFIGURATION",
      reason:
        "The configured tax amounts consume the transaction value. Review the tax metadata before posting.",
      transactionPayload,
    });
  }

  const journalLines = buildBankTransactionPostingJournalLines({
    transactionId: transaction.id,
    amountMinor: transaction.amount,
    type: transaction.type,
    categoryName: transaction.category.name,
    bankAccountId: accountMapping.bankAccount.id,
    categoryAccountId: accountMapping.categoryAccount.id,
    taxLines: taxLines.taxLines,
  });

  try {
    const created = await createJournalEntryWithExecutor(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      sourceBankTransactionId: transaction.id,
      entryDate: transaction.transactionDate,
      reference: buildJournalReference(transaction),
      memo: buildPostingMemo(transaction),
      source: "IMPORT",
      status: "POSTED",
      lines: journalLines,
    });

    const postedAt = new Date();
    await db.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "MATCHED",
        reviewStatus: "POSTED",
        accountingPostingStatus: "POSTED",
        reviewedAt: transaction.reviewedAt ?? postedAt,
        reviewedByUserId: transaction.reviewedByUserId ?? input.actorUserId,
      },
    });

    await postBankTransactionToFinancialEngineWithExecutor(db, {
      id: transaction.id,
      workspaceId: input.workspaceId,
      amount: transaction.amount,
      type: transaction.type,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      reference: transaction.reference,
    });

    await writeAuditLog(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_POSTED_TO_LEDGER",
      metadata: {
        transactionId: transaction.id,
        journalEntryId: created.entry.id,
        accountIds: created.entry.lines.map((line) => line.accountId),
        totalDebit: created.balance.totalDebit,
        totalCredit: created.balance.totalCredit,
      },
    });

    const postedTransaction = await getSerializedBankTransactionOrNull(
      db,
      input.workspaceId,
      transaction.id
    );

    if (!postedTransaction) {
      throw new BankTransactionPostingNotFoundError();
    }

    return {
      ok: true,
      status: "POSTED",
      transactionId: transaction.id,
      journalEntryId: created.entry.id,
      accountingPostingStatus: "POSTED",
      balance: created.balance,
      transaction: postedTransaction,
    };
  } catch (error) {
    if (isKnownPrismaError(error) && error.code === "P2002") {
      const latestTransaction = await getSerializedBankTransactionOrNull(
        db,
        input.workspaceId,
        transaction.id
      );

      return buildFailureResult({
        transaction: {
          ...transaction,
          reviewStatus: "POSTED",
          postedJournalEntry: transaction.postedJournalEntry ?? { id: -1 },
        },
        code: "ALREADY_POSTED",
        reason: "This bank transaction has already been posted to the ledger.",
        transactionPayload: latestTransaction,
      });
    }

    throw error;
  }
}

export async function postWorkspaceBankTransaction(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction((tx) => postWorkspaceBankTransactionWithExecutor(tx, input));
}

export async function getWorkspaceBankTransactionWorkflowSummary(
  workspaceId: number
): Promise<WorkspaceBankTransactionWorkflowSummary> {
  const fallbackSummary = buildEmptyWorkspaceBankTransactionWorkflowSummary({
    workspaceId,
  });
  const [totalTransactions, bankAccountCount] = await Promise.all([
    prisma.bankTransaction.count({
      where: {
        workspaceId,
      },
    }),
    prisma.bankAccount.count({
      where: {
        workspaceId,
      },
    }),
  ]);

  if (totalTransactions === 0) {
    return buildEmptyWorkspaceBankTransactionWorkflowSummary({
      workspaceId,
      requiresSetup: bankAccountCount === 0 || totalTransactions === 0,
    });
  }

  const [transactions, latestPostedEntry] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        workspaceId,
      },
      select: bankTransactionWorkflowSummarySelect,
    }),
    prisma.journalEntry.findFirst({
      where: {
        workspaceId,
        status: "POSTED",
        sourceBankTransactionId: {
          not: null,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
      },
    }),
  ]);

  const latestPostedAt = latestPostedEntry?.createdAt.toISOString() ?? null;

  if (!transactions || transactions.length === 0) {
    return {
      ...fallbackSummary,
      requiresSetup: bankAccountCount === 0 || totalTransactions === 0,
      latestPostedAt,
    };
  }

  const chartAccounts = await getWorkspacePostingChartAccounts(prisma, workspaceId);

  let pendingReview = 0;
  const byStatus = buildEmptyWorkflowStatusCounts();
  let postedCount = 0;
  let unpostedCount = 0;
  let readyToPostCount = 0;
  let blockedByAccountMappingCount = 0;
  const mappingReadinessCache = new Map<string, boolean>();

  for (const transaction of transactions) {
    if (transaction.reviewStatus === "PENDING_REVIEW") {
      pendingReview += 1;
    }

    byStatus[transaction.status] += 1;

    const hasPostedJournalEntry = Boolean(transaction.postedJournalEntry);
    const accountingPostingStatus = resolveBankTransactionAccountingPostingStatus({
      reviewStatus: transaction.reviewStatus,
      postingReadiness: transaction.postingReadiness,
      hasPostedJournalEntry,
    });

    if (accountingPostingStatus === "POSTED") {
      postedCount += 1;
      continue;
    }

    unpostedCount += 1;

    if (
      !isBankTransactionReadyToPost({
        reviewStatus: transaction.reviewStatus,
        postingReadiness: transaction.postingReadiness,
        hasPostedJournalEntry,
      })
    ) {
      continue;
    }

    readyToPostCount += 1;

    const mappingCacheKey = buildWorkflowMappingCacheKey(transaction);
    const cachedMappingReady = mappingReadinessCache.get(mappingCacheKey);
    if (cachedMappingReady === false) {
      blockedByAccountMappingCount += 1;
      continue;
    }
    if (cachedMappingReady === true) {
      continue;
    }

    const mappingResult = resolveWorkspaceBankTransactionPostingAccountsFromChartAccounts(
      chartAccounts,
      {
        category: transaction.category as PostingCategoryAccount | null,
        needsVatPayableAccount:
          transaction.vatTreatment === "OUTPUT" ||
          transaction.suggestedVatTreatment === "OUTPUT",
        needsWhtPayableAccount:
          transaction.whtTreatment === "PAYABLE" ||
          transaction.suggestedWhtTreatment === "PAYABLE",
      }
    );
    const isBlockedByMapping =
      !mappingResult.ok &&
      (mappingResult.code === "BANK_ACCOUNT_MISSING" ||
        mappingResult.code === "CATEGORY_ACCOUNT_MISSING" ||
        mappingResult.code === "TAX_ACCOUNT_MISSING");

    mappingReadinessCache.set(mappingCacheKey, !isBlockedByMapping);

    if (isBlockedByMapping) {
      blockedByAccountMappingCount += 1;
    }
  }

  const status = resolveWorkflowStatus({
    totalTransactions: transactions.length,
    postedCount,
    readyToPostCount,
    blockedByAccountMappingCount,
  });
  const narrative = buildWorkflowNarrative({
    totalTransactions: transactions.length,
    postedCount,
    readyToPostCount,
    blockedByAccountMappingCount,
  });

  return {
    workspaceId,
    total: transactions.length,
    byStatus,
    pendingReview,
    matched: byStatus.MATCHED,
    unmatched: byStatus.UNMATCHED,
    suggested: byStatus.SUGGESTED,
    ignored: byStatus.IGNORED,
    requiresSetup: false,
    totalTransactions: transactions.length,
    unpostedCount,
    readyToPostCount,
    postedCount,
    blockedByAccountMappingCount,
    latestPostedAt,
    status,
    headline: narrative.headline,
    detail: narrative.detail,
  };
}

export async function bulkPostWorkspaceBankTransactions(input: {
  workspaceId: number;
  actorUserId: number;
  transactionIds: number[];
}) {
  const results: BankTransactionPostingResult[] = [];

  for (const transactionId of input.transactionIds) {
    try {
      const result = await postWorkspaceBankTransaction({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        transactionId,
      });
      results.push(result);
    } catch (error) {
      if (error instanceof BankTransactionPostingNotFoundError) {
        results.push({
          ok: false,
          status: "SKIPPED",
          code: "TRANSACTION_NOT_FOUND",
          reason: error.message,
          transactionId,
          accountingPostingStatus: "UNPOSTED",
          transaction: null,
        });
        continue;
      }

      throw error;
    }
  }

  return {
    results,
    processedCount: results.length,
    postedCount: results.filter((result) => result.ok).length,
    reviewNeededCount: results.filter(
      (result) => !result.ok && result.status === "REVIEW_NEEDED"
    ).length,
    skippedCount: results.filter((result) => !result.ok && result.status === "SKIPPED").length,
  };
}
