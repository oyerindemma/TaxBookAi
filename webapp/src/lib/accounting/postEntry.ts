import "server-only";

import type { JournalEntrySource, JournalEntryStatus } from "@prisma/client";
import { createJournalEntry } from "@/lib/journal-entries";

export type PostJournalEntryLineInput = {
  accountId: number;
  debit?: number | null;
  credit?: number | null;
};

export type PostJournalEntryInput = {
  workspaceId: number;
  entries: PostJournalEntryLineInput[];
  description?: string | null;
  reference?: string | null;
  entryDate?: Date;
  actorUserId?: number | null;
  source?: JournalEntrySource;
  status?: JournalEntryStatus;
  sourceBankTransactionId?: number | null;
};

function normalizeMinorAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("Journal entry amounts must be non-negative integer minor units.");
  }

  return value;
}

export async function postJournalEntry(input: PostJournalEntryInput) {
  if (!Number.isInteger(input.workspaceId) || input.workspaceId <= 0) {
    throw new Error("Journal entries require a valid workspace id.");
  }

  if (!Array.isArray(input.entries) || input.entries.length < 2) {
    throw new Error("Journal entries must contain at least two lines.");
  }

  const lines = input.entries.map((entry) => ({
    accountId: entry.accountId,
    debit: normalizeMinorAmount(entry.debit),
    credit: normalizeMinorAmount(entry.credit),
    description: input.description ?? null,
  }));
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  if (totalDebit !== totalCredit) {
    throw new Error("Journal entry is out of balance. Total debits must equal total credits.");
  }

  return createJournalEntry({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    sourceBankTransactionId: input.sourceBankTransactionId ?? null,
    entryDate: input.entryDate ?? new Date(),
    reference: input.reference ?? null,
    memo: input.description ?? null,
    source: input.source ?? "MANUAL",
    status: input.status ?? "POSTED",
    lines,
  });
}
