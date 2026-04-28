import "server-only";

import type {
  BankTransactionType,
  LedgerCategoryType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTransactionCategoriesForWorkspace } from "@/lib/transaction-categories";
import { findLearnedCategoryMapping } from "@/lib/ai/learnMapping";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

export const AUTO_BOOKKEEPING_CATEGORY_PROVIDER = "rule-based-auto-bookkeeping-v1";
export const AUTO_BOOKKEEPING_REVIEW_CONFIDENCE_THRESHOLD = 0.8;

export const autoCategorizationTransactionSelect = {
  id: true,
  workspaceId: true,
  clientBusinessId: true,
  categoryId: true,
  suggestedCategoryId: true,
  description: true,
  reference: true,
  amount: true,
  type: true,
  status: true,
  reviewStatus: true,
  postingReadiness: true,
  accountingPostingStatus: true,
  bankAccount: {
    select: {
      clientBusinessId: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

export type AutoCategorizationTransaction = Prisma.BankTransactionGetPayload<{
  select: typeof autoCategorizationTransactionSelect;
}>;

type CategoryCandidate = {
  id: number;
  clientBusinessId: number;
  name: string;
  type: LedgerCategoryType;
};

type CategoryRule = {
  pattern: RegExp;
  preferredCategoryNames: string[];
  expectedTypes: LedgerCategoryType[];
  confidence: number;
  reason: string;
  requiresType?: BankTransactionType;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    pattern: /\b(fuel|uber|bolt|taxi|transport|logistics|delivery|flight|hotel)\b/i,
    preferredCategoryNames: ["Travel and logistics"],
    expectedTypes: ["EXPENSE"],
    confidence: 0.88,
    reason: "Transport, fuel, or logistics language appeared in the narration.",
    requiresType: "DEBIT",
  },
  {
    pattern: /\brent\b/i,
    preferredCategoryNames: ["Rent and utilities"],
    expectedTypes: ["EXPENSE"],
    confidence: 0.9,
    reason: "Rent language appeared in the narration.",
    requiresType: "DEBIT",
  },
  {
    pattern: /\b(salary|payroll|staff|wages?)\b/i,
    preferredCategoryNames: ["Payroll"],
    expectedTypes: ["EXPENSE"],
    confidence: 0.92,
    reason: "Salary or payroll language appeared in the narration.",
    requiresType: "DEBIT",
  },
  {
    pattern: /\b(electricity|power|utility|utilities|water|internet)\b/i,
    preferredCategoryNames: ["Rent and utilities"],
    expectedTypes: ["EXPENSE"],
    confidence: 0.88,
    reason: "Utility language appeared in the narration.",
    requiresType: "DEBIT",
  },
  {
    pattern: /\b(client|invoice|sales?|revenue)\b/i,
    preferredCategoryNames: ["Revenue"],
    expectedTypes: ["INCOME"],
    confidence: 0.9,
    reason: "Client, invoice, or sales language appeared in a money-in narration.",
    requiresType: "CREDIT",
  },
  {
    pattern: /\bpayment\b/i,
    preferredCategoryNames: ["Revenue"],
    expectedTypes: ["INCOME"],
    confidence: 0.82,
    reason: "Payment language appeared in a money-in narration.",
    requiresType: "CREDIT",
  },
];

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function buildTransactionText(transaction: AutoCategorizationTransaction) {
  return [transaction.description, transaction.reference ?? ""]
    .filter(Boolean)
    .join(" ");
}

function getResolvedClientBusinessId(transaction: AutoCategorizationTransaction) {
  return transaction.clientBusinessId ?? transaction.bankAccount.clientBusinessId ?? null;
}

function getExpectedTypeForTransaction(
  transaction: AutoCategorizationTransaction
): LedgerCategoryType {
  return transaction.type === "CREDIT" ? "INCOME" : "EXPENSE";
}

function findCategoryByNames(
  categories: CategoryCandidate[],
  names: string[],
  expectedTypes: LedgerCategoryType[]
) {
  const normalizedNames = names.map((name) => normalizeText(name));

  return (
    categories.find(
      (category) =>
        normalizedNames.includes(normalizeText(category.name)) &&
        expectedTypes.includes(category.type)
    ) ??
    categories.find(
      (category) =>
        normalizedNames.some((name) => normalizeText(category.name).includes(name)) &&
        expectedTypes.includes(category.type)
    ) ??
    null
  );
}

function findFallbackCategory(
  categories: CategoryCandidate[],
  expectedType: LedgerCategoryType
) {
  const fallbackNames =
    expectedType === "INCOME" ? ["Revenue"] : ["Operations", "Operating Expense"];

  return (
    findCategoryByNames(categories, fallbackNames, [expectedType]) ??
    categories.find((category) => category.type === expectedType) ??
    null
  );
}

async function getCandidateCategories(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    clientBusinessId: number | null;
  }
) {
  const categories = await db.transactionCategory.findMany({
    where: {
      clientBusiness: {
        workspaceId: input.workspaceId,
        archivedAt: null,
      },
    },
    select: {
      id: true,
      clientBusinessId: true,
      name: true,
      type: true,
    },
    orderBy: [{ clientBusinessId: "asc" }, { name: "asc" }],
  });

  if (!input.clientBusinessId) {
    return categories;
  }

  const narrowed = categories.filter(
    (category) => category.clientBusinessId === input.clientBusinessId
  );

  return narrowed.length > 0 ? narrowed : categories;
}

async function getAutoCategorizationTransactionOrThrow(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    transactionId: number;
  }
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: input.transactionId,
      workspaceId: input.workspaceId,
    },
    select: autoCategorizationTransactionSelect,
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  return transaction;
}

function buildResult(input: {
  transaction: AutoCategorizationTransaction;
  category: CategoryCandidate | null;
  confidence: number | null;
  reason: string;
  provider?: string;
  learnedPattern?: string | null;
}) {
  const confidence = input.confidence === null ? null : Number(input.confidence.toFixed(2));

  return {
    transactionId: input.transaction.id,
    categoryId: input.category?.id ?? null,
    categoryName: input.category?.name ?? null,
    categoryType: input.category?.type ?? null,
    confidence,
    needsReview:
      confidence === null ||
      confidence < AUTO_BOOKKEEPING_REVIEW_CONFIDENCE_THRESHOLD,
    reason: input.reason,
    provider: input.provider ?? AUTO_BOOKKEEPING_CATEGORY_PROVIDER,
    learnedPattern: input.learnedPattern ?? null,
  };
}

export async function categorizeTransactionWithExecutor(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    transaction?: AutoCategorizationTransaction;
    transactionId?: number;
    ensureDefaults?: boolean;
  }
) {
  const transaction =
    input.transaction ??
    (input.transactionId
      ? await getAutoCategorizationTransactionOrThrow(db, {
          workspaceId: input.workspaceId,
          transactionId: input.transactionId,
        })
      : null);

  if (!transaction) {
    throw new Error("transactionId is required.");
  }

  if (transaction.categoryId) {
    return buildResult({
      transaction,
      category: null,
      confidence: 1,
      reason: "Manual category already exists; AI did not overwrite it.",
    });
  }

  if (input.ensureDefaults ?? true) {
    await ensureDefaultTransactionCategoriesForWorkspace(db, input.workspaceId);
  }

  const clientBusinessId = getResolvedClientBusinessId(transaction);
  const categories = await getCandidateCategories(db, {
    workspaceId: input.workspaceId,
    clientBusinessId,
  });

  if (categories.length === 0) {
    return buildResult({
      transaction,
      category: null,
      confidence: null,
      reason: "No transaction categories are configured for this workspace.",
    });
  }

  const expectedType = getExpectedTypeForTransaction(transaction);
  const learned = await findLearnedCategoryMapping(db, {
    workspaceId: input.workspaceId,
    description: transaction.description,
    clientBusinessId,
  });

  if (learned && learned.categoryType === expectedType) {
    const category =
      categories.find((candidate) => candidate.id === learned.categoryId) ?? null;
    if (category) {
      return buildResult({
        transaction,
        category,
        confidence: learned.confidence,
        reason: learned.reason,
        provider: "human-learning-loop",
        learnedPattern: learned.pattern,
      });
    }
  }

  const text = buildTransactionText(transaction);
  for (const rule of CATEGORY_RULES) {
    if (rule.requiresType && rule.requiresType !== transaction.type) continue;
    if (!rule.pattern.test(text)) continue;

    const category = findCategoryByNames(
      categories,
      rule.preferredCategoryNames,
      rule.expectedTypes
    );
    if (!category) continue;

    return buildResult({
      transaction,
      category,
      confidence: rule.confidence,
      reason: rule.reason,
    });
  }

  const fallbackCategory = findFallbackCategory(categories, expectedType);
  return buildResult({
    transaction,
    category: fallbackCategory,
    confidence: expectedType === "INCOME" ? 0.7 : 0.62,
    reason:
      expectedType === "INCOME"
        ? "Money-in transaction; suggested revenue for human review."
        : "Money-out transaction; suggested operations expense for human review.",
  });
}

export async function categorizeTransaction(input: {
  workspaceId: number;
  transactionId: number;
}) {
  return prisma.$transaction((tx) =>
    categorizeTransactionWithExecutor(tx, {
      workspaceId: input.workspaceId,
      transactionId: input.transactionId,
    })
  );
}
