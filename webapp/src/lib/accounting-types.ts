import type {
  AccountingAccountClass,
  JournalEntrySource,
  JournalEntryStatus,
} from "@prisma/client";

export const ACCOUNTING_ACCOUNT_CLASSES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const satisfies readonly AccountingAccountClass[];

export const JOURNAL_ENTRY_SOURCES = [
  "MANUAL",
  "IMPORT",
  "SYSTEM",
] as const satisfies readonly JournalEntrySource[];

export const JOURNAL_ENTRY_STATUSES = [
  "DRAFT",
  "POSTED",
] as const satisfies readonly JournalEntryStatus[];

export type JournalEntryLineInput = {
  accountId: number;
  debit?: number | null;
  credit?: number | null;
  description?: string | null;
  sourceTransactionId?: number | null;
};

export type CreateJournalEntryInput = {
  workspaceId: number;
  actorUserId?: number | null;
  sourceBankTransactionId?: number | null;
  entryDate: Date;
  reference?: string | null;
  memo?: string | null;
  source?: JournalEntrySource;
  status?: JournalEntryStatus;
  lines: JournalEntryLineInput[];
};

export type ValidatedJournalEntryLine = {
  accountId: number;
  debit: number;
  credit: number;
  description: string | null;
  sourceTransactionId: number | null;
};

export type JournalBalanceSummary = {
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
};

export type JournalBalanceValidationResult =
  | {
      ok: true;
      summary: JournalBalanceSummary;
      lines: ValidatedJournalEntryLine[];
    }
  | {
      ok: false;
      error: string;
      summary: JournalBalanceSummary;
    };
