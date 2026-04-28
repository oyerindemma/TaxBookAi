import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateJournalEntryInput } from "@/lib/accounting-types";
import { ensureDefaultChartOfAccountsForWorkspace } from "@/lib/chart-of-accounts";
import { assertBalancedJournalEntry } from "@/lib/journal-entry-validation";
import { prisma } from "@/lib/prisma";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEntryDate(value: Date) {
  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    throw new Error("Journal entries require a valid entry date.");
  }
  return normalized;
}

function normalizeOptionalPositiveInt(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function assertWorkspaceAccountIds(
  db: PrismaExecutor,
  workspaceId: number,
  accountIds: number[]
) {
  const uniqueAccountIds = [...new Set(accountIds)];
  const accounts = await db.chartOfAccount.findMany({
    where: {
      workspaceId,
      isActive: true,
      id: {
        in: uniqueAccountIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (accounts.length !== uniqueAccountIds.length) {
    throw new Error("One or more journal lines reference an invalid or inactive workspace account.");
  }
}

async function assertSourceBankTransaction(
  db: PrismaExecutor,
  workspaceId: number,
  sourceBankTransactionId: number | null
) {
  if (!sourceBankTransactionId) return;

  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: sourceBankTransactionId,
      workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (!transaction) {
    throw new Error("The selected source bank transaction does not belong to this workspace.");
  }
}

export async function createJournalEntryWithExecutor(
  db: PrismaExecutor,
  input: CreateJournalEntryInput
) {
  if (!Number.isInteger(input.workspaceId) || input.workspaceId <= 0) {
    throw new Error("Journal entries require a valid workspace id.");
  }

  const sourceBankTransactionId = normalizeOptionalPositiveInt(input.sourceBankTransactionId);
  if (
    input.sourceBankTransactionId !== undefined &&
    input.sourceBankTransactionId !== null &&
    !sourceBankTransactionId
  ) {
    throw new Error("Journal entries require a valid source bank transaction id.");
  }

  await ensureDefaultChartOfAccountsForWorkspace(db, input.workspaceId);
  await assertSourceBankTransaction(db, input.workspaceId, sourceBankTransactionId);

  const validation = assertBalancedJournalEntry(input.lines);
  await assertWorkspaceAccountIds(
    db,
    input.workspaceId,
    validation.lines.map((line) => line.accountId)
  );

  const created = await db.journalEntry.create({
    data: {
      workspaceId: input.workspaceId,
      createdByUserId: input.actorUserId ?? null,
      sourceBankTransactionId,
      entryDate: normalizeEntryDate(input.entryDate),
      reference: normalizeText(input.reference),
      memo: normalizeText(input.memo),
      source: input.source ?? "MANUAL",
      status: input.status ?? "DRAFT",
      postedAt: (input.status ?? "DRAFT") === "POSTED" ? new Date() : null,
      lines: {
        create: validation.lines.map((line, index) => ({
          workspaceId: input.workspaceId,
          accountId: line.accountId,
          lineNumber: index + 1,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          sourceTransactionId: line.sourceTransactionId,
        })),
      },
    },
    include: {
      lines: {
        orderBy: {
          lineNumber: "asc",
        },
        include: {
          account: {
            select: {
              id: true,
              code: true,
              name: true,
              accountClass: true,
            },
          },
        },
      },
    },
  });

  return {
    entry: created,
    balance: validation.summary,
  };
}

export async function createJournalEntry(input: CreateJournalEntryInput) {
  return prisma.$transaction(async (tx) => createJournalEntryWithExecutor(tx, input));
}
