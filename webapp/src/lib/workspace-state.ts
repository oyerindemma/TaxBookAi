import "server-only";

import { prisma } from "@/lib/prisma";

export type WorkspaceState = {
  transactionCount: number;
  hasTransactions: boolean;
  hasReviewed: boolean;
  hasCategorized: boolean;
  hasTaxSnapshot: boolean;
};

type WorkspaceStateInput = {
  userId: number;
  workspaceId?: number | null;
};

export async function getWorkspaceState(input: WorkspaceStateInput): Promise<WorkspaceState> {
  if (!Number.isInteger(input.userId) || input.userId <= 0 || !input.workspaceId) {
    const emptyState: WorkspaceState = {
      transactionCount: 0,
      hasTransactions: false,
      hasReviewed: false,
      hasCategorized: false,
      hasTaxSnapshot: false,
    };
    console.log("Workspace State:", emptyState);
    return emptyState;
  }

  const transactionCount = await prisma.bankTransaction.count({
    where: {
      workspaceId: input.workspaceId,
    },
  });

  const reviewedTransactionCount = await prisma.bankTransaction.count({
    where: {
      workspaceId: input.workspaceId,
      reviewStatus: {
        in: ["REVIEWED", "POSTED"],
      },
    },
  });

  const categorizedTransactionCount = await prisma.bankTransaction.count({
    where: {
      workspaceId: input.workspaceId,
      categoryId: {
        not: null,
      },
    },
  });

  const taxSnapshotCount = await prisma.taxSnapshot.count({
    where: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      status: "completed",
    },
  });

  const state: WorkspaceState = {
    transactionCount,
    hasTransactions: transactionCount > 0,
    hasReviewed: transactionCount > 0 && reviewedTransactionCount >= transactionCount,
    hasCategorized: transactionCount > 0 && categorizedTransactionCount >= transactionCount,
    hasTaxSnapshot: taxSnapshotCount > 0,
  };

  console.log("Workspace State:", state);
  return state;
}
