import "server-only";

import type {
  BankTransactionType,
  LedgerDirection,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { db } from "@/lib/db";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

type FinancialSourceInput = {
  id: number;
  workspaceId: number;
  amount: number;
  transactionDate: Date;
  description?: string | null;
  reference?: string | null;
};

type BankTransactionPostingInput = FinancialSourceInput & {
  type: BankTransactionType;
};

type LedgerTransactionPostingInput = FinancialSourceInput & {
  direction: LedgerDirection;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toMajorUnits(amountMinor: number) {
  return Math.abs(amountMinor) / 100;
}

function normalizeFinancialAmount(amount: number) {
  if (!Number.isFinite(amount)) return null;
  const absoluteAmount = Math.abs(amount);
  return absoluteAmount > 0 ? absoluteAmount : null;
}

function buildReference(prefix: string, id: number, reference?: string | null) {
  return normalizeText(reference) ?? `${prefix}:${id}`;
}

async function ensureAccount(
  executor: PrismaExecutor,
  input: {
    workspaceId: number;
    name: string;
    type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  }
) {
  return executor.account.upsert({
    where: {
      workspaceId_name: {
        workspaceId: input.workspaceId,
        name: input.name,
      },
    },
    update: {
      type: input.type,
    },
    create: {
      workspaceId: input.workspaceId,
      name: input.name,
      type: input.type,
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });
}

async function ensureCoreAccounts(executor: PrismaExecutor, workspaceId: number) {
  const [cashAccount, revenueAccount, expenseAccount] = await Promise.all([
    ensureAccount(executor, {
      workspaceId,
      name: "Cash",
      type: "ASSET",
    }),
    ensureAccount(executor, {
      workspaceId,
      name: "Sales Revenue",
      type: "REVENUE",
    }),
    ensureAccount(executor, {
      workspaceId,
      name: "Operating Expense",
      type: "EXPENSE",
    }),
  ]);

  return {
    cashAccount,
    revenueAccount,
    expenseAccount,
  };
}

export async function postTransactionWithExecutor(
  executor: PrismaExecutor,
  transactionId: number
) {
  const financialTransaction = await executor.transaction.findUnique({
    where: {
      id: transactionId,
    },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      status: true,
      workspaceId: true,
    },
  });

  if (!financialTransaction || financialTransaction.status === "POSTED") return;

  const amount = normalizeFinancialAmount(financialTransaction.amount);
  if (!amount) return;

  const { cashAccount, expenseAccount, revenueAccount } = await ensureCoreAccounts(
    executor,
    financialTransaction.workspaceId
  );
  const postedAt = new Date();
  const isRevenueTransaction = financialTransaction.amount < 0;
  const memo = normalizeText(financialTransaction.description);
  const reference = `TX:${financialTransaction.id}`;

  const journalRows = isRevenueTransaction
    ? [
        {
          transactionId: financialTransaction.id,
          accountId: cashAccount.id,
          debit: amount,
          credit: 0,
        },
        {
          transactionId: financialTransaction.id,
          accountId: revenueAccount.id,
          debit: 0,
          credit: amount,
        },
      ]
    : [
        {
          transactionId: financialTransaction.id,
          accountId: expenseAccount.id,
          debit: amount,
          credit: 0,
        },
        {
          transactionId: financialTransaction.id,
          accountId: cashAccount.id,
          debit: 0,
          credit: amount,
        },
      ];

  await executor.journalEntry.deleteMany({
    where: {
      transactionId: financialTransaction.id,
    },
  });

  await executor.journalEntry.createMany({
    data: journalRows.map((row) => ({
      workspaceId: financialTransaction.workspaceId,
      transactionId: row.transactionId,
      accountId: row.accountId,
      entryDate: financialTransaction.date,
      reference,
      memo,
      debit: row.debit,
      credit: row.credit,
      source: "SYSTEM",
      status: "POSTED",
      postedAt,
    })),
  });

  await executor.transaction.update({
    where: {
      id: financialTransaction.id,
    },
    data: {
      status: "POSTED",
    },
  });
}

export async function postTransaction(transactionId: number) {
  return db.$transaction((executor) =>
    postTransactionWithExecutor(executor, transactionId)
  );
}

export async function postBankTransactionToFinancialEngineWithExecutor(
  executor: PrismaExecutor,
  input: BankTransactionPostingInput
) {
  if (!Number.isInteger(input.id) || input.id <= 0) return null;

  const amount = toMajorUnits(input.amount);
  if (amount <= 0) return null;

  const financialTransaction = await executor.transaction.upsert({
    where: {
      sourceBankTransactionId: input.id,
    },
    update: {
      workspaceId: input.workspaceId,
      description: normalizeText(input.description),
      amount: input.type === "CREDIT" ? -amount : amount,
      date: input.transactionDate,
    },
    create: {
      workspaceId: input.workspaceId,
      sourceBankTransactionId: input.id,
      description: normalizeText(input.description),
      amount: input.type === "CREDIT" ? -amount : amount,
      date: input.transactionDate,
      status: "PENDING",
    },
    select: {
      id: true,
    },
  });

  await postTransactionWithExecutor(executor, financialTransaction.id);
  return financialTransaction.id;
}

export async function postLedgerTransactionToFinancialEngineWithExecutor(
  executor: PrismaExecutor,
  input: LedgerTransactionPostingInput
) {
  if (!Number.isInteger(input.id) || input.id <= 0) return null;
  if (input.direction === "JOURNAL") return null;

  const amount = toMajorUnits(input.amount);
  if (amount <= 0) return null;

  const financialTransaction = await executor.transaction.upsert({
    where: {
      sourceLedgerTransactionId: input.id,
    },
    update: {
      workspaceId: input.workspaceId,
      description: normalizeText(input.description),
      amount: input.direction === "MONEY_IN" ? -amount : amount,
      date: input.transactionDate,
    },
    create: {
      workspaceId: input.workspaceId,
      sourceLedgerTransactionId: input.id,
      description: normalizeText(input.description),
      amount: input.direction === "MONEY_IN" ? -amount : amount,
      date: input.transactionDate,
      status: "PENDING",
    },
    select: {
      id: true,
    },
  });

  await postTransactionWithExecutor(executor, financialTransaction.id);
  return financialTransaction.id;
}

export function buildFinancialTransactionReference(input: FinancialSourceInput) {
  return buildReference("TX", input.id, input.reference);
}
