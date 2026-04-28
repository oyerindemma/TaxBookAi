import "server-only";

import type {
  BankTransactionReviewStatus,
  BankTransactionStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { refreshBankTransactionSuggestions } from "@/lib/banking";
import { prisma } from "@/lib/prisma";
import { enqueueRecalcForTransactionDates } from "@/lib/tax-snapshot-service";
import type { BankTransactionDirection } from "@/lib/bank-transaction-validation";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

function mapDirectionToBankType(direction: BankTransactionDirection) {
  return direction === "INCOME" ? "CREDIT" : "DEBIT";
}

function mapDirectionToSuggestedType(direction: BankTransactionDirection) {
  return direction === "INCOME" ? "INCOME" : "EXPENSE";
}

async function assertValidWorkspaceAccount(
  db: PrismaExecutor,
  workspaceId: number,
  bankAccountId: number
) {
  const account = await db.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      workspaceId,
    },
    select: {
      id: true,
      clientBusinessId: true,
      currency: true,
      name: true,
    },
  });

  if (!account) {
    throw new Error("The selected bank account does not belong to this workspace.");
  }

  return account;
}

async function assertValidWorkspaceBusiness(
  db: PrismaExecutor,
  workspaceId: number,
  clientBusinessId: number
) {
  const business = await db.clientBusiness.findFirst({
    where: {
      id: clientBusinessId,
      workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      defaultCurrency: true,
    },
  });

  if (!business) {
    throw new Error("The selected client business does not belong to this workspace.");
  }

  return business;
}

function canCreateWithStatus(status: BankTransactionStatus) {
  return status === "UNMATCHED" || status === "REVIEW_REQUIRED" || status === "IGNORED";
}

function getInitialReviewStatus(status: BankTransactionStatus): BankTransactionReviewStatus {
  if (status === "IGNORED") {
    return "REVIEWED";
  }

  return "PENDING_REVIEW";
}

export async function createManualBankTransaction(input: {
  workspaceId: number;
  actorUserId: number;
  bankAccountId: number;
  clientBusinessId: number;
  categoryId?: number | null;
  transactionDate: Date;
  description: string;
  reference?: string | null;
  amountMinor: number;
  currency: string;
  direction: BankTransactionDirection;
  status: BankTransactionStatus;
  notes?: string | null;
}) {
  if (!canCreateWithStatus(input.status)) {
    throw new Error("Manual transactions can only start as unmatched, review required, or ignored.");
  }

  const createdTransactionId = await prisma.$transaction(async (tx) => {
    const account = await assertValidWorkspaceAccount(tx, input.workspaceId, input.bankAccountId);
    const business = await assertValidWorkspaceBusiness(
      tx,
      input.workspaceId,
      input.clientBusinessId
    );

    if (
      account.clientBusinessId &&
      account.clientBusinessId !== input.clientBusinessId
    ) {
      throw new Error("Select a bank account that belongs to the chosen client business.");
    }

    const direction = mapDirectionToSuggestedType(input.direction);
    const category = input.categoryId
      ? await tx.transactionCategory.findFirst({
          where: {
            id: input.categoryId,
            clientBusinessId: business.id,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

    if (input.categoryId && !category) {
      throw new Error("The selected category does not belong to the chosen client business.");
    }

    const created = await tx.bankTransaction.create({
      data: {
        workspaceId: input.workspaceId,
        clientBusinessId: business.id,
        bankAccountId: account.id,
        uploadedByUserId: input.actorUserId,
        categoryId: category?.id ?? null,
        transactionDate: input.transactionDate,
        description: input.description,
        reference: input.reference ?? null,
        amount: input.amountMinor,
        debitAmountMinor: input.direction === "EXPENSE" ? input.amountMinor : null,
        creditAmountMinor: input.direction === "INCOME" ? input.amountMinor : null,
        type: mapDirectionToBankType(input.direction),
        source: "MANUAL",
        status: input.status,
        reviewStatus: getInitialReviewStatus(input.status),
        currency: input.currency || account.currency || business.defaultCurrency,
        suggestedType: direction,
        suggestedCategoryName: category?.name ?? null,
        categorizationProvider: "manual-entry",
        reviewNotes: input.notes ?? null,
        rawRowPayload: JSON.stringify({
          source: "manual-entry",
          bankAccountId: account.id,
          clientBusinessId: business.id,
          direction: input.direction,
        }),
      },
      select: {
        id: true,
      },
    });

    await enqueueRecalcForTransactionDates(tx, {
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      transactionDates: [input.transactionDate],
      reason: "transaction_changed",
    });

    return created.id;
  });

  if (input.status !== "IGNORED") {
    await refreshBankTransactionSuggestions(input.workspaceId, createdTransactionId);
  }

  return createdTransactionId;
}
