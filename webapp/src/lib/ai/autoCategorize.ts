import "server-only";

import { writeAuditLog } from "@/lib/audit";
import {
  AUTO_BOOKKEEPING_REVIEW_CONFIDENCE_THRESHOLD,
  autoCategorizationTransactionSelect,
  categorizeTransactionWithExecutor,
} from "@/lib/ai/categorizeTransaction";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTransactionCategoriesForWorkspace } from "@/lib/transaction-categories";

export type AutoCategorizeWorkspaceTransactionsInput = {
  workspaceId: number;
  actorUserId: number;
  transactionIds?: number[];
  limit?: number;
};

export async function autoCategorizeWorkspaceTransactions(
  input: AutoCategorizeWorkspaceTransactionsInput
) {
  return prisma.$transaction(async (tx) => {
    await ensureDefaultTransactionCategoriesForWorkspace(tx, input.workspaceId);

    const transactions = await tx.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: input.transactionIds?.length
          ? {
              in: input.transactionIds,
            }
          : undefined,
        categoryId: null,
        status: "UNMATCHED",
        accountingPostingStatus: "UNPOSTED",
      },
      select: autoCategorizationTransactionSelect,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: input.limit ?? 100,
    });

    const results: Array<{
      transactionId: number;
      categoryId: number | null;
      categoryName: string | null;
      confidence: number | null;
      status: "SUGGESTED" | "NEEDS_REVIEW" | "SKIPPED";
      reason: string;
    }> = [];

    for (const transaction of transactions) {
      if (transaction.categoryId) {
        results.push({
          transactionId: transaction.id,
          categoryId: null,
          categoryName: null,
          confidence: 1,
          status: "SKIPPED",
          reason: "Manual category already exists; AI did not overwrite it.",
        });
        continue;
      }

      const suggestion = await categorizeTransactionWithExecutor(tx, {
        workspaceId: input.workspaceId,
        transaction,
        ensureDefaults: false,
      });

      if (!suggestion.categoryId) {
        results.push({
          transactionId: transaction.id,
          categoryId: null,
          categoryName: null,
          confidence: suggestion.confidence,
          status: "SKIPPED",
          reason: suggestion.reason,
        });
        continue;
      }

      const needsReview =
        suggestion.confidence === null ||
        suggestion.confidence < AUTO_BOOKKEEPING_REVIEW_CONFIDENCE_THRESHOLD;

      await tx.bankTransaction.update({
        where: {
          id: transaction.id,
        },
        data: {
          suggestedCategoryId: suggestion.categoryId,
          suggestedCategoryName: suggestion.categoryName,
          suggestionConfidence: suggestion.confidence,
          confidenceScore: suggestion.confidence,
          suggestionReason: suggestion.reason,
          categorizationProvider: suggestion.provider,
          status: "SUGGESTED",
          reviewStatus: "PENDING_REVIEW",
          postingReadiness: needsReview ? "REVIEW_REQUIRED" : "NOT_READY",
          reviewNotes: needsReview ? "Needs Review: AI confidence is below the auto-post threshold." : null,
        },
      });

      results.push({
        transactionId: transaction.id,
        categoryId: suggestion.categoryId,
        categoryName: suggestion.categoryName,
        confidence: suggestion.confidence,
        status: needsReview ? "NEEDS_REVIEW" : "SUGGESTED",
        reason: suggestion.reason,
      });
    }

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "AI_BANK_TRANSACTION_AUTO_CATEGORIZED",
      metadata: {
        transactionIds: transactions.map((transaction) => transaction.id),
        processedCount: transactions.length,
        suggestedCount: results.filter((result) => result.status === "SUGGESTED").length,
        needsReviewCount: results.filter((result) => result.status === "NEEDS_REVIEW").length,
      },
    });

    return {
      processedCount: transactions.length,
      updatedCount: results.filter(
        (result) => result.status === "SUGGESTED" || result.status === "NEEDS_REVIEW"
      ).length,
      needsReviewCount: results.filter((result) => result.status === "NEEDS_REVIEW").length,
      skippedCount: results.filter((result) => result.status === "SKIPPED").length,
      results,
    };
  });
}
