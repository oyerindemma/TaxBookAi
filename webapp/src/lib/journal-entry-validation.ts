import "server-only";

import type {
  JournalBalanceValidationResult,
  JournalEntryLineInput,
  ValidatedJournalEntryLine,
} from "@/lib/accounting-types";

function parseMinorAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function parsePositiveInt(value: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeDescription(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function validateJournalEntryLines(
  lines: JournalEntryLineInput[]
): JournalBalanceValidationResult {
  if (!Array.isArray(lines) || lines.length < 2) {
    return {
      ok: false,
      error: "Journal entries must contain at least two lines.",
      summary: {
        totalDebit: 0,
        totalCredit: 0,
        lineCount: Array.isArray(lines) ? lines.length : 0,
      },
    };
  }

  const normalizedLines: ValidatedJournalEntryLine[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [index, line] of lines.entries()) {
    const accountId = parsePositiveInt(line.accountId);
    if (!accountId) {
      return {
        ok: false,
        error: `Line ${index + 1} must reference a valid account.`,
        summary: {
          totalDebit,
          totalCredit,
          lineCount: lines.length,
        },
      };
    }

    const debit = parseMinorAmount(line.debit);
    const credit = parseMinorAmount(line.credit);
    if (debit === null || credit === null) {
      return {
        ok: false,
        error: `Line ${index + 1} contains an invalid debit or credit amount.`,
        summary: {
          totalDebit,
          totalCredit,
          lineCount: lines.length,
        },
      };
    }

    if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      return {
        ok: false,
        error: `Line ${index + 1} must have either a debit or a credit.`,
        summary: {
          totalDebit,
          totalCredit,
          lineCount: lines.length,
        },
      };
    }

    const sourceTransactionId =
      line.sourceTransactionId === null || line.sourceTransactionId === undefined
        ? null
        : parsePositiveInt(line.sourceTransactionId);

    if (line.sourceTransactionId !== null && line.sourceTransactionId !== undefined && !sourceTransactionId) {
      return {
        ok: false,
        error: `Line ${index + 1} contains an invalid source transaction id.`,
        summary: {
          totalDebit,
          totalCredit,
          lineCount: lines.length,
        },
      };
    }

    totalDebit += debit;
    totalCredit += credit;
    normalizedLines.push({
      accountId,
      debit,
      credit,
      description: normalizeDescription(line.description),
      sourceTransactionId,
    });
  }

  if (totalDebit !== totalCredit) {
    return {
      ok: false,
      error: "Journal entry is out of balance. Total debits must equal total credits.",
      summary: {
        totalDebit,
        totalCredit,
        lineCount: lines.length,
      },
    };
  }

  return {
    ok: true,
    summary: {
      totalDebit,
      totalCredit,
      lineCount: lines.length,
    },
    lines: normalizedLines,
  };
}

export function assertBalancedJournalEntry(lines: JournalEntryLineInput[]) {
  const result = validateJournalEntryLines(lines);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}
