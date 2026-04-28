import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { ensureDefaultChartOfAccountsForWorkspace } from "@/lib/chart-of-accounts";
import { createJournalEntryWithExecutor } from "@/lib/journal-entries";
import { prisma } from "@/lib/prisma";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

type MoneyDirection = "CREDIT" | "DEBIT" | "MONEY_IN" | "MONEY_OUT";

type BankTransactionLike = {
  id?: number | null;
  workspaceId: number;
  amount: number;
  type: MoneyDirection;
  transactionDate?: Date | null;
  description?: string | null;
  reference?: string | null;
};

type TransactionToEntryInput =
  | {
      workspaceId: number;
      actorUserId?: number | null;
      transactionId: number;
    }
  | {
      workspaceId: number;
      actorUserId?: number | null;
      transaction: BankTransactionLike;
    };

function normalizeTransactionDirection(type: MoneyDirection) {
  if (type === "CREDIT" || type === "MONEY_IN") return "MONEY_IN";
  return "MONEY_OUT";
}

async function getAccountIdByName(
  db: PrismaExecutor,
  workspaceId: number,
  name: string
) {
  const account = await db.chartOfAccount.findFirst({
    where: {
      workspaceId,
      name,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!account) {
    throw new Error(`Default account "${name}" is unavailable for this workspace.`);
  }

  return account.id;
}

async function resolveDefaultPostingAccounts(db: PrismaExecutor, workspaceId: number) {
  await ensureDefaultChartOfAccountsForWorkspace(db, workspaceId);

  const [bankAccountId, revenueAccountId, expenseAccountId] = await Promise.all([
    getAccountIdByName(db, workspaceId, "Bank"),
    getAccountIdByName(db, workspaceId, "Sales Revenue"),
    getAccountIdByName(db, workspaceId, "Operating Expense"),
  ]);

  return {
    bankAccountId,
    revenueAccountId,
    expenseAccountId,
  };
}

function assertPositiveMinorAmount(amount: number) {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw new Error("Bank transaction journal entries require a positive integer minor amount.");
  }
}

export async function mapBankTransactionToJournalEntryLines(
  db: PrismaExecutor,
  transaction: BankTransactionLike
) {
  assertPositiveMinorAmount(transaction.amount);

  const accounts = await resolveDefaultPostingAccounts(db, transaction.workspaceId);
  const direction = normalizeTransactionDirection(transaction.type);

  if (direction === "MONEY_IN") {
    return [
      {
        accountId: accounts.bankAccountId,
        debit: transaction.amount,
        credit: 0,
        description: "Bank",
        sourceTransactionId: transaction.id ?? null,
      },
      {
        accountId: accounts.revenueAccountId,
        debit: 0,
        credit: transaction.amount,
        description: "Sales Revenue",
        sourceTransactionId: transaction.id ?? null,
      },
    ];
  }

  return [
    {
      accountId: accounts.expenseAccountId,
      debit: transaction.amount,
      credit: 0,
      description: "Operating Expense",
      sourceTransactionId: transaction.id ?? null,
    },
    {
      accountId: accounts.bankAccountId,
      debit: 0,
      credit: transaction.amount,
      description: "Bank",
      sourceTransactionId: transaction.id ?? null,
    },
  ];
}

async function resolveTransactionInput(db: PrismaExecutor, input: TransactionToEntryInput) {
  if ("transaction" in input) {
    if (input.transaction.workspaceId !== input.workspaceId) {
      throw new Error("Bank transaction workspace id does not match the requested workspace.");
    }

    return input.transaction;
  }

  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: input.transactionId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      amount: true,
      type: true,
      transactionDate: true,
      description: true,
      reference: true,
    },
  });

  if (!transaction) {
    throw new Error("Bank transaction not found for this workspace.");
  }

  return transaction;
}

export async function postBankTransactionJournalEntry(input: TransactionToEntryInput) {
  return prisma.$transaction(async (tx) => {
    const transaction = await resolveTransactionInput(tx, input);
    const lines = await mapBankTransactionToJournalEntryLines(tx, transaction);

    return createJournalEntryWithExecutor(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      sourceBankTransactionId: transaction.id ?? null,
      entryDate: transaction.transactionDate ?? new Date(),
      reference: transaction.reference ?? (transaction.id ? `BANK:${transaction.id}` : null),
      memo: transaction.description ?? null,
      source: "IMPORT",
      status: "POSTED",
      lines,
    });
  });
}
