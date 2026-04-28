import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { postWorkspaceBankTransaction } from "@/lib/bank-transaction-posting";
import { prisma } from "@/lib/prisma";

export const AUTO_POST_MIN_CONFIDENCE = 0.8;

export type AutoPostWorkspaceTransactionsInput = {
  workspaceId: number;
  actorUserId: number;
  transactionIds?: number[];
  limit?: number;
};

export async function autoPostWorkspaceTransactions(
  input: AutoPostWorkspaceTransactionsInput
) {
  const candidates = await prisma.bankTransaction.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: input.transactionIds?.length
        ? {
            in: input.transactionIds,
          }
        : undefined,
      categoryId: null,
      suggestedCategoryId: {
        not: null,
      },
      suggestionConfidence: {
        gt: AUTO_POST_MIN_CONFIDENCE,
      },
      status: "SUGGESTED",
      accountingPostingStatus: "UNPOSTED",
    },
    select: {
      id: true,
      clientBusinessId: true,
      suggestedCategoryId: true,
      suggestionConfidence: true,
      suggestedCategory: {
        select: {
          id: true,
          clientBusinessId: true,
          name: true,
        },
      },
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    take: input.limit ?? 100,
  });

  const results: Array<{
    transactionId: number;
    status: "POSTED" | "NEEDS_REVIEW" | "SKIPPED";
    confidence: number | null;
    categoryId: number | null;
    journalEntryId?: number;
    reason: string;
  }> = [];

  for (const transaction of candidates) {
    const confidence = transaction.suggestionConfidence ?? 0;
    const suggestedCategory = transaction.suggestedCategory;

    if (!suggestedCategory || !transaction.suggestedCategoryId) {
      results.push({
        transactionId: transaction.id,
        status: "SKIPPED",
        confidence,
        categoryId: null,
        reason: "No suggested category is available.",
      });
      continue;
    }

    if (confidence <= AUTO_POST_MIN_CONFIDENCE) {
      results.push({
        transactionId: transaction.id,
        status: "SKIPPED",
        confidence,
        categoryId: suggestedCategory.id,
        reason: "Confidence is below the auto-post threshold.",
      });
      continue;
    }

    if (
      transaction.clientBusinessId &&
      transaction.clientBusinessId !== suggestedCategory.clientBusinessId
    ) {
      await prisma.bankTransaction.update({
        where: {
          id: transaction.id,
        },
        data: {
          status: "REVIEW_REQUIRED",
          reviewStatus: "PENDING_REVIEW",
          postingReadiness: "REVIEW_REQUIRED",
          reviewNotes: "Needs Review: suggested category belongs to a different client business.",
        },
      });

      results.push({
        transactionId: transaction.id,
        status: "NEEDS_REVIEW",
        confidence,
        categoryId: suggestedCategory.id,
        reason: "Suggested category belongs to a different client business.",
      });
      continue;
    }

    await prisma.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        categoryId: suggestedCategory.id,
        clientBusinessId: transaction.clientBusinessId ?? suggestedCategory.clientBusinessId,
        suggestedCategoryId: null,
        suggestionConfidence: null,
        suggestionReason: null,
        confidenceScore: confidence,
        reviewStatus: "REVIEWED",
        postingReadiness: "READY_TO_POST",
        accountingPostingStatus: "READY_TO_POST",
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId,
        reviewNotes: null,
      },
    });

    const posted = await postWorkspaceBankTransaction({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      transactionId: transaction.id,
    });

    if (posted.ok) {
      await prisma.bankTransaction.update({
        where: {
          id: transaction.id,
        },
        data: {
          status: "MATCHED",
        },
      });

      results.push({
        transactionId: transaction.id,
        status: "POSTED",
        confidence,
        categoryId: suggestedCategory.id,
        journalEntryId: posted.journalEntryId,
        reason: "High-confidence suggestion posted to the ledger.",
      });
      continue;
    }

    await prisma.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "REVIEW_REQUIRED",
        reviewStatus: "PENDING_REVIEW",
        postingReadiness: "REVIEW_REQUIRED",
        accountingPostingStatus: "UNPOSTED",
        reviewNotes: `Needs Review: ${posted.reason}`,
      },
    });

    results.push({
      transactionId: transaction.id,
      status: "NEEDS_REVIEW",
      confidence,
      categoryId: suggestedCategory.id,
      reason: posted.reason,
    });
  }

  await prisma.$transaction((tx) =>
    writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "AI_BANK_TRANSACTION_AUTO_POSTED",
      metadata: {
        transactionIds: candidates.map((transaction) => transaction.id),
        processedCount: candidates.length,
        postedCount: results.filter((result) => result.status === "POSTED").length,
        needsReviewCount: results.filter((result) => result.status === "NEEDS_REVIEW").length,
      },
    })
  );

  return {
    processedCount: candidates.length,
    postedCount: results.filter((result) => result.status === "POSTED").length,
    reviewNeededCount: results.filter((result) => result.status === "NEEDS_REVIEW").length,
    skippedCount: results.filter((result) => result.status === "SKIPPED").length,
    results,
  };
}
