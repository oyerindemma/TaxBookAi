import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

const LEARNED_PATTERN_PREFIX = "learned-pattern:";

function normalizeLearningText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenize(value: string) {
  return normalizeLearningText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !/^\d+$/.test(token));
}

function tokenOverlapScore(left: string, right: string) {
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

export function normalizeDescriptionPattern(description: string) {
  const tokens = tokenize(description);
  if (tokens.length === 0) return "";

  return tokens.slice(0, 8).join(" ");
}

function extractLearnedPattern(note: string | null | undefined) {
  const normalizedNote = note?.trim() ?? "";
  if (!normalizedNote.startsWith(LEARNED_PATTERN_PREFIX)) return null;

  return normalizeLearningText(normalizedNote.slice(LEARNED_PATTERN_PREFIX.length));
}

export async function findLearnedCategoryMapping(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    description: string;
    clientBusinessId?: number | null;
  }
) {
  const targetPattern = normalizeDescriptionPattern(input.description);
  if (!targetPattern) return null;

  const feedback = await db.bankTransactionCategorizationFeedback.findMany({
    where: {
      workspaceId: input.workspaceId,
      decision: {
        in: ["APPROVED", "MANUAL_OVERRIDE"],
      },
      selectedCategoryId: {
        not: null,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 150,
    select: {
      selectedCategoryId: true,
      note: true,
      transaction: {
        select: {
          description: true,
          clientBusinessId: true,
        },
      },
      selectedCategory: {
        select: {
          id: true,
          name: true,
          type: true,
          clientBusinessId: true,
        },
      },
    },
  });

  for (const item of feedback) {
    const category = item.selectedCategory;
    if (!category) continue;
    if (
      input.clientBusinessId &&
      category.clientBusinessId !== input.clientBusinessId &&
      item.transaction.clientBusinessId !== input.clientBusinessId
    ) {
      continue;
    }

    const storedPattern =
      extractLearnedPattern(item.note) ??
      normalizeDescriptionPattern(item.transaction.description);
    if (!storedPattern) continue;

    const score = tokenOverlapScore(targetPattern, storedPattern);
    if (
      score >= 0.7 ||
      targetPattern.includes(storedPattern) ||
      storedPattern.includes(targetPattern)
    ) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryType: category.type,
        confidence: 0.95,
        reason: "Matched a prior human-approved category mapping.",
        pattern: storedPattern,
      };
    }
  }

  return null;
}

export async function learnTransactionCategoryMapping(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
  selectedCategoryId: number;
  suggestedCategoryId?: number | null;
  note?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findFirst({
      where: {
        id: input.transactionId,
        workspaceId: input.workspaceId,
      },
      select: {
        id: true,
        description: true,
        clientBusinessId: true,
        suggestionConfidence: true,
        suggestionReason: true,
        categorizationProvider: true,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found.");
    }

    const category = await tx.transactionCategory.findFirst({
      where: {
        id: input.selectedCategoryId,
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

    if (
      transaction.clientBusinessId &&
      transaction.clientBusinessId !== category.clientBusinessId
    ) {
      throw new Error(
        "The selected category belongs to a different client business than this transaction."
      );
    }

    const pattern = normalizeDescriptionPattern(transaction.description);
    const note = [pattern ? `${LEARNED_PATTERN_PREFIX}${pattern}` : null, input.note]
      .filter(Boolean)
      .join(" | ");

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        categoryId: category.id,
        clientBusinessId: transaction.clientBusinessId ?? category.clientBusinessId,
        suggestedCategoryId: null,
        suggestionConfidence: null,
        suggestionReason: null,
        confidenceScore: 1,
        status: "SUGGESTED",
        reviewStatus: "PENDING_REVIEW",
        postingReadiness: "REVIEW_REQUIRED",
      },
    });

    await tx.bankTransactionCategorizationFeedback.create({
      data: {
        workspaceId: input.workspaceId,
        transactionId: transaction.id,
        actorUserId: input.actorUserId,
        suggestedCategoryId: input.suggestedCategoryId ?? null,
        selectedCategoryId: category.id,
        decision: "MANUAL_OVERRIDE",
        suggestionConfidence: transaction.suggestionConfidence,
        suggestionReason: transaction.suggestionReason,
        provider: transaction.categorizationProvider,
        note: note || null,
      },
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_CATEGORY_MAPPING_LEARNED",
      metadata: {
        transactionId: transaction.id,
        selectedCategoryId: category.id,
        pattern,
      },
    });

    return {
      transactionId: transaction.id,
      categoryId: category.id,
      categoryName: category.name,
      pattern,
    };
  });
}
