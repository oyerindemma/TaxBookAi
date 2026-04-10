import "server-only";

import type {
  BankTransactionCategorizationFeedbackDecision,
  LedgerCategoryType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  bankTransactionInclude,
  serializeBankTransaction,
} from "@/lib/banking";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTransactionCategoriesForWorkspace } from "@/lib/transaction-categories";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

type CategorizationContext = {
  categories: Array<{
    id: number;
    clientBusinessId: number;
    name: string;
    type: LedgerCategoryType;
  }>;
  history: Array<{
    transactionId: number | null;
    clientBusinessId: number | null;
    categoryId: number;
    categoryName: string;
    text: string;
    source: "transaction" | "feedback";
  }>;
};

export type BankTransactionCategorySuggestion = {
  transactionId: number;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  suggestionConfidence: number | null;
  suggestionReason: string | null;
  provider: string;
};

export type BankTransactionCategorizationFeedbackInput = {
  workspaceId: number;
  transactionId: number;
  actorUserId: number;
  decision: BankTransactionCategorizationFeedbackDecision;
  suggestedCategoryId?: number | null;
  selectedCategoryId?: number | null;
  suggestionConfidence?: number | null;
  suggestionReason?: string | null;
  provider?: string | null;
  note?: string | null;
};

export const categorizationTransactionSelect = {
  id: true,
  workspaceId: true,
  clientBusinessId: true,
  categoryId: true,
  suggestedCategoryId: true,
  suggestionConfidence: true,
  suggestionReason: true,
  description: true,
  reference: true,
  type: true,
  suggestedType: true,
  suggestedCounterparty: true,
  suggestedCategoryName: true,
  suggestedNarrationMeaning: true,
  categorizationProvider: true,
  bankAccount: {
    select: {
      clientBusinessId: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

export type CategorizationTransaction = Prisma.BankTransactionGetPayload<{
  select: typeof categorizationTransactionSelect;
}>;

function normalizeString(value: string | null | undefined) {
  return value?.trim() ?? "";
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

function buildTransactionText(transaction: CategorizationTransaction) {
  return [
    transaction.description,
    transaction.reference ?? "",
    transaction.suggestedCounterparty ?? "",
    transaction.suggestedNarrationMeaning ?? "",
    transaction.suggestedCategoryName ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getResolvedClientBusinessId(transaction: CategorizationTransaction) {
  return transaction.clientBusinessId ?? transaction.bankAccount.clientBusinessId ?? null;
}

function getExpectedCategoryTypes(transaction: CategorizationTransaction): LedgerCategoryType[] {
  if (transaction.suggestedType === "INCOME") return ["INCOME"];
  if (transaction.suggestedType === "EXPENSE") return ["EXPENSE"];
  if (transaction.suggestedType === "TRANSFER") return ["OTHER", "ASSET"];
  if (transaction.suggestedType === "OWNER_DRAW") return ["EQUITY", "OTHER"];
  return transaction.type === "CREDIT" ? ["INCOME"] : ["EXPENSE", "OTHER", "EQUITY"];
}

function buildHintCategories(transaction: CategorizationTransaction) {
  const narration = buildTransactionText(transaction).toLowerCase();
  const hints = new Map<string, string>();

  const addHint = (name: string | null | undefined, reason: string) => {
    const normalized = normalizeString(name);
    if (!normalized) return;
    if (!hints.has(normalized)) {
      hints.set(normalized, reason);
    }
  };

  addHint(
    transaction.suggestedCategoryName,
    "existing categorization metadata already points toward this category"
  );

  if (transaction.suggestedType === "INCOME" || transaction.type === "CREDIT") {
    addHint("Revenue", "money-in activity usually maps to revenue first");
  }
  if (transaction.suggestedType === "TRANSFER") {
    addHint("Transfers", "the narration looks like an internal transfer");
  }
  if (transaction.suggestedType === "OWNER_DRAW") {
    addHint("Owner drawings", "the narration looks like an owner draw");
  }
  if (/(salary|payroll|staff)/.test(narration)) {
    addHint("Payroll", "payroll language appears in the narration");
  }
  if (/(rent|electricity|power|water|internet|utility|diesel)/.test(narration)) {
    addHint("Rent and utilities", "utility or occupancy costs appear in the narration");
  }
  if (/(tax|vat|wht|firs|levy|compliance)/.test(narration)) {
    addHint("Tax and compliance", "tax or compliance language appears in the narration");
  }
  if (/(travel|transport|uber|bolt|flight|hotel|logistics|delivery|fuel)/.test(narration)) {
    addHint("Travel and logistics", "travel or transport language appears in the narration");
  }
  if (/(bank charge|sms alert|charge|commission|maintenance fee)/.test(narration)) {
    addHint("Bank charges", "the narration looks like a bank fee");
  }
  if (/(audit|consult|consulting|legal|lawyer|professional)/.test(narration)) {
    addHint("Professional fees", "professional services language appears in the narration");
  }
  if (/(office|stationery|paper|printer|subscription|software|hosting|domain|supplies)/.test(
    narration
  )) {
    addHint("Operations", "operations or software spend appears in the narration");
  }
  if (/(inventory|stock|purchase|cost of sales|raw material)/.test(narration)) {
    addHint("Cost of sales", "the narration looks tied to direct delivery or resale costs");
  }

  return hints;
}

function getCandidateCategories(
  transaction: CategorizationTransaction,
  categories: CategorizationContext["categories"]
) {
  const clientBusinessId = getResolvedClientBusinessId(transaction);

  if (!clientBusinessId) {
    return categories;
  }

  const narrowed = categories.filter((category) => category.clientBusinessId === clientBusinessId);
  return narrowed.length > 0 ? narrowed : categories;
}

function scoreCategoryCandidate(input: {
  transaction: CategorizationTransaction;
  category: CategorizationContext["categories"][number];
  history: CategorizationContext["history"];
}) {
  const queryText = buildTransactionText(input.transaction);
  const hints = buildHintCategories(input.transaction);
  const expectedTypes = getExpectedCategoryTypes(input.transaction);
  const reasons: string[] = [];
  let score = 0;

  if (expectedTypes.includes(input.category.type)) {
    score += 0.08;
    reasons.push("category type matches the transaction direction");
  }

  for (const [hintName, hintReason] of hints.entries()) {
    const similarity = textSimilarity(hintName, input.category.name);
    if (similarity >= 0.95) {
      score += 0.46;
      reasons.push(hintReason);
      break;
    }
    if (similarity >= 0.6) {
      score += 0.28;
      reasons.push(hintReason);
      break;
    }
  }

  const categoryNameSimilarity = textSimilarity(queryText, input.category.name);
  if (categoryNameSimilarity >= 0.75) {
    score += 0.28;
    reasons.push("the narration strongly overlaps the category name");
  } else if (categoryNameSimilarity >= 0.45) {
    score += 0.18;
    reasons.push("the narration overlaps the category name");
  } else if (categoryNameSimilarity >= 0.2) {
    score += 0.1;
    reasons.push("the narration partly overlaps the category name");
  }

  const historyMatches = input.history.filter((example) => {
    if (example.categoryId !== input.category.id) {
      return false;
    }

    const transactionBusinessId = getResolvedClientBusinessId(input.transaction);
    if (transactionBusinessId && example.clientBusinessId) {
      return example.clientBusinessId === transactionBusinessId;
    }

    return true;
  });

  let bestHistorySimilarity = 0;
  for (const example of historyMatches) {
    if (example.transactionId === input.transaction.id) continue;
    bestHistorySimilarity = Math.max(
      bestHistorySimilarity,
      textSimilarity(queryText, example.text)
    );
  }

  if (bestHistorySimilarity >= 0.78) {
    score += 0.34;
    reasons.push("similar transactions were previously approved into this category");
  } else if (bestHistorySimilarity >= 0.52) {
    score += 0.22;
    reasons.push("recent category history supports this suggestion");
  } else if (bestHistorySimilarity >= 0.3) {
    score += 0.1;
    reasons.push("some category history aligns with this transaction");
  }

  return {
    score: Number(Math.min(0.99, score).toFixed(4)),
    reasons,
  };
}

function buildSuggestionConfidence(topScore: number, gap: number) {
  const confidence = topScore + Math.min(0.12, Math.max(0, gap));
  return Number(Math.max(0.32, Math.min(0.98, confidence)).toFixed(4));
}

class HeuristicBankTransactionCategorizationService {
  readonly provider = "heuristic-fallback";

  constructor(private readonly context: CategorizationContext) {}

  async suggestTransactions(
    transactions: CategorizationTransaction[]
  ): Promise<BankTransactionCategorySuggestion[]> {
    return transactions.map((transaction) => {
      const candidates = getCandidateCategories(transaction, this.context.categories)
        .map((category) => ({
          category,
          ...scoreCategoryCandidate({
            transaction,
            category,
            history: this.context.history,
          }),
        }))
        .sort((left, right) => right.score - left.score);

      const top = candidates[0];
      const runnerUp = candidates[1] ?? null;
      const gap = top ? top.score - (runnerUp?.score ?? 0) : 0;

      if (!top || top.score < 0.32 || (top.score < 0.45 && gap < 0.05)) {
        return {
          transactionId: transaction.id,
          suggestedCategoryId: null,
          suggestedCategoryName: null,
          suggestionConfidence: null,
          suggestionReason: null,
          provider: this.provider,
        };
      }

      return {
        transactionId: transaction.id,
        suggestedCategoryId: top.category.id,
        suggestedCategoryName: top.category.name,
        suggestionConfidence: buildSuggestionConfidence(top.score, gap),
        suggestionReason: top.reasons.slice(0, 3).join("; ") || null,
        provider: this.provider,
      };
    });
  }
}

async function buildCategorizationContext(
  db: PrismaExecutor,
  workspaceId: number
): Promise<CategorizationContext> {
  await ensureDefaultTransactionCategoriesForWorkspace(db, workspaceId);

  const [categories, categorizedTransactions, feedbackHistory] = await Promise.all([
    db.transactionCategory.findMany({
      where: {
        clientBusiness: {
          workspaceId,
          archivedAt: null,
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: {
        id: true,
        clientBusinessId: true,
        name: true,
        type: true,
      },
    }),
    db.bankTransaction.findMany({
      where: {
        workspaceId,
        categoryId: {
          not: null,
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 250,
      select: {
        id: true,
        clientBusinessId: true,
        description: true,
        reference: true,
        suggestedCounterparty: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    db.bankTransactionCategorizationFeedback.findMany({
      where: {
        workspaceId,
        selectedCategoryId: {
          not: null,
        },
        decision: {
          in: ["APPROVED", "MANUAL_OVERRIDE"] satisfies BankTransactionCategorizationFeedbackDecision[],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 250,
      select: {
        transactionId: true,
        selectedCategoryId: true,
        selectedCategory: {
          select: {
            id: true,
            name: true,
          },
        },
        transaction: {
          select: {
            clientBusinessId: true,
            description: true,
            reference: true,
            suggestedCounterparty: true,
          },
        },
      },
    }),
  ]);

  return {
    categories,
    history: [
      ...categorizedTransactions.flatMap((transaction) =>
        transaction.categoryId && transaction.category
          ? [
              {
                transactionId: transaction.id,
                clientBusinessId: transaction.clientBusinessId,
                categoryId: transaction.categoryId,
                categoryName: transaction.category.name,
                text: [
                  transaction.description,
                  transaction.reference ?? "",
                  transaction.suggestedCounterparty ?? "",
                ]
                  .filter(Boolean)
                  .join(" "),
                source: "transaction" as const,
              },
            ]
          : []
      ),
      ...feedbackHistory.flatMap((item) =>
        item.selectedCategoryId && item.selectedCategory
          ? [
              {
                transactionId: item.transactionId,
                clientBusinessId: item.transaction.clientBusinessId,
                categoryId: item.selectedCategoryId,
                categoryName: item.selectedCategory.name,
                text: [
                  item.transaction.description,
                  item.transaction.reference ?? "",
                  item.transaction.suggestedCounterparty ?? "",
                ]
                  .filter(Boolean)
                  .join(" "),
                source: "feedback" as const,
              },
            ]
          : []
      ),
    ],
  };
}

export async function createBankTransactionCategorizationService(
  db: PrismaExecutor,
  workspaceId: number
) {
  const context = await buildCategorizationContext(db, workspaceId);
  return new HeuristicBankTransactionCategorizationService(context);
}

export async function suggestCategoriesForWorkspaceTransactions(
  db: PrismaExecutor,
  workspaceId: number,
  transactions: CategorizationTransaction[]
) {
  const service = await createBankTransactionCategorizationService(db, workspaceId);
  return service.suggestTransactions(transactions);
}

async function getCategorizationTransactionOrThrow(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId,
    },
    select: categorizationTransactionSelect,
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  return transaction;
}

async function getSerializedTransactionOrThrow(
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

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  return serializeBankTransaction(transaction);
}

function buildSuggestionUpdate(
  suggestion: BankTransactionCategorySuggestion
): Prisma.BankTransactionUncheckedUpdateInput {
  return {
    suggestedCategoryId: suggestion.suggestedCategoryId,
    suggestionConfidence: suggestion.suggestionConfidence,
    suggestionReason: suggestion.suggestionReason,
    categorizationProvider: suggestion.provider,
    suggestedCategoryName: suggestion.suggestedCategoryName,
  };
}

function buildClearSuggestionUpdate(): Prisma.BankTransactionUncheckedUpdateInput {
  return {
    suggestedCategoryId: null,
    suggestionConfidence: null,
    suggestionReason: null,
  };
}

async function resolveSuggestedOrSelectedCategory(
  db: PrismaExecutor,
  workspaceId: number,
  transaction: CategorizationTransaction,
  categoryId: number
) {
  const category = await db.transactionCategory.findFirst({
    where: {
      id: categoryId,
      clientBusiness: {
        workspaceId,
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

  const transactionBusinessId = getResolvedClientBusinessId(transaction);
  if (transactionBusinessId && transactionBusinessId !== category.clientBusinessId) {
    throw new Error(
      "The selected category belongs to a different client business than this transaction."
    );
  }

  return category;
}

export async function writeBankTransactionCategorizationFeedback(
  db: PrismaExecutor,
  input: BankTransactionCategorizationFeedbackInput
) {
  await db.bankTransactionCategorizationFeedback.create({
    data: {
      workspaceId: input.workspaceId,
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      suggestedCategoryId: input.suggestedCategoryId ?? null,
      selectedCategoryId: input.selectedCategoryId ?? null,
      decision: input.decision,
      suggestionConfidence: input.suggestionConfidence ?? null,
      suggestionReason: normalizeString(input.suggestionReason) || null,
      provider: normalizeString(input.provider) || null,
      note: normalizeString(input.note) || null,
    },
  });
}

export async function suggestWorkspaceBankTransactionCategory(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await getCategorizationTransactionOrThrow(
      tx,
      input.workspaceId,
      input.transactionId
    );

    if (transaction.categoryId) {
      return {
        updated: false,
        transaction: await getSerializedTransactionOrThrow(
          tx,
          input.workspaceId,
          input.transactionId
        ),
      };
    }

    const service = await createBankTransactionCategorizationService(tx, input.workspaceId);
    const [suggestion] = await service.suggestTransactions([transaction]);

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: buildSuggestionUpdate(suggestion),
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_CATEGORY_SUGGESTED",
      metadata: {
        transactionId: transaction.id,
        suggestedCategoryId: suggestion.suggestedCategoryId,
        suggestionConfidence: suggestion.suggestionConfidence,
        provider: suggestion.provider,
      },
    });

    return {
      updated: Boolean(suggestion.suggestedCategoryId),
      transaction: await getSerializedTransactionOrThrow(tx, input.workspaceId, input.transactionId),
    };
  });
}

export async function bulkSuggestWorkspaceBankTransactionCategories(input: {
  workspaceId: number;
  actorUserId: number;
  transactionIds?: number[];
  limit?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transactions = await tx.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: input.transactionIds?.length
          ? {
              in: input.transactionIds,
            }
          : undefined,
        categoryId: null,
      },
      select: categorizationTransactionSelect,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: input.limit ?? 100,
    });

    const service = await createBankTransactionCategorizationService(tx, input.workspaceId);
    const suggestions = await service.suggestTransactions(transactions);

    let updatedCount = 0;
    for (const suggestion of suggestions) {
      const previous = transactions.find((transaction) => transaction.id === suggestion.transactionId);
      if (!previous) continue;

      const changed =
        previous.suggestedCategoryId !== suggestion.suggestedCategoryId ||
        previous.suggestionConfidence !== suggestion.suggestionConfidence ||
        normalizeString(previous.suggestionReason) !== normalizeString(suggestion.suggestionReason);

      if (!changed) continue;

      await tx.bankTransaction.update({
        where: {
          id: suggestion.transactionId,
        },
        data: buildSuggestionUpdate(suggestion),
      });
      updatedCount += 1;
    }

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_CATEGORY_BULK_SUGGESTED",
      metadata: {
        transactionIds: transactions.map((transaction) => transaction.id),
        updatedCount,
        processedCount: transactions.length,
      },
    });

    return {
      processedCount: transactions.length,
      updatedCount,
      skippedCount: Math.max(0, transactions.length - updatedCount),
    };
  });
}

export async function approveWorkspaceBankTransactionCategorySuggestion(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await getCategorizationTransactionOrThrow(
      tx,
      input.workspaceId,
      input.transactionId
    );

    if (!transaction.suggestedCategoryId) {
      throw new Error("This transaction does not have a pending category suggestion.");
    }

    const category = await resolveSuggestedOrSelectedCategory(
      tx,
      input.workspaceId,
      transaction,
      transaction.suggestedCategoryId
    );

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        categoryId: category.id,
        clientBusinessId: transaction.clientBusinessId ?? category.clientBusinessId,
        ...buildClearSuggestionUpdate(),
      },
    });

    await writeBankTransactionCategorizationFeedback(tx, {
      workspaceId: input.workspaceId,
      transactionId: transaction.id,
      actorUserId: input.actorUserId,
      decision: "APPROVED",
      suggestedCategoryId: category.id,
      selectedCategoryId: category.id,
      suggestionConfidence: transaction.suggestionConfidence ?? null,
      suggestionReason: transaction.suggestionReason ?? null,
      provider: transaction.categorizationProvider ?? null,
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_CATEGORY_APPROVED",
      metadata: {
        transactionId: transaction.id,
        categoryId: category.id,
      },
    });

    return getSerializedTransactionOrThrow(tx, input.workspaceId, input.transactionId);
  });
}

export async function rejectWorkspaceBankTransactionCategorySuggestion(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await getCategorizationTransactionOrThrow(
      tx,
      input.workspaceId,
      input.transactionId
    );

    if (!transaction.suggestedCategoryId) {
      throw new Error("This transaction does not have a pending category suggestion.");
    }

    await writeBankTransactionCategorizationFeedback(tx, {
      workspaceId: input.workspaceId,
      transactionId: transaction.id,
      actorUserId: input.actorUserId,
      decision: "REJECTED",
      suggestedCategoryId: transaction.suggestedCategoryId,
      selectedCategoryId: transaction.categoryId ?? null,
      suggestionConfidence: transaction.suggestionConfidence ?? null,
      suggestionReason: transaction.suggestionReason ?? null,
      provider: transaction.categorizationProvider ?? null,
    });

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: buildClearSuggestionUpdate(),
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_CATEGORY_REJECTED",
      metadata: {
        transactionId: transaction.id,
        suggestedCategoryId: transaction.suggestedCategoryId,
      },
    });

    return getSerializedTransactionOrThrow(tx, input.workspaceId, input.transactionId);
  });
}
