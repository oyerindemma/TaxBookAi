import type { BankTransactionType } from "@prisma/client";
import type { JournalEntryLineInput } from "@/lib/accounting-types";

export type PostingTaxLineInput = {
  accountId: number;
  amountMinor: number;
  description: string;
};

export type BankTransactionPostingJournalLineInput = {
  transactionId: number;
  amountMinor: number;
  type: BankTransactionType;
  categoryName: string;
  bankAccountId: number;
  categoryAccountId: number;
  taxLines?: PostingTaxLineInput[];
};

export function calculatePrimaryPostingLineAmount(input: {
  amountMinor: number;
  type: BankTransactionType;
  taxLines?: PostingTaxLineInput[];
}) {
  const totalTaxCredits = (input.taxLines ?? []).reduce(
    (sum, line) => sum + line.amountMinor,
    0
  );

  return input.type === "CREDIT"
    ? input.amountMinor - totalTaxCredits
    : input.amountMinor + totalTaxCredits;
}

export function buildBankTransactionPostingJournalLines(
  input: BankTransactionPostingJournalLineInput
): JournalEntryLineInput[] {
  const taxLines = input.taxLines ?? [];
  const primaryLineAmount = calculatePrimaryPostingLineAmount({
    amountMinor: input.amountMinor,
    type: input.type,
    taxLines,
  });

  if (!Number.isInteger(primaryLineAmount) || primaryLineAmount <= 0) {
    throw new Error("Primary posting line amount must be a positive integer.");
  }

  if (input.type === "CREDIT") {
    return [
      {
        accountId: input.bankAccountId,
        debit: input.amountMinor,
        description: "Bank",
        sourceTransactionId: input.transactionId,
      },
      {
        accountId: input.categoryAccountId,
        credit: primaryLineAmount,
        description: input.categoryName,
        sourceTransactionId: input.transactionId,
      },
      ...taxLines.map((line) => ({
        accountId: line.accountId,
        credit: line.amountMinor,
        description: line.description,
        sourceTransactionId: input.transactionId,
      })),
    ];
  }

  return [
    {
      accountId: input.categoryAccountId,
      debit: primaryLineAmount,
      description: input.categoryName,
      sourceTransactionId: input.transactionId,
    },
    ...taxLines.map((line) => ({
      accountId: line.accountId,
      credit: line.amountMinor,
      description: line.description,
      sourceTransactionId: input.transactionId,
    })),
    {
      accountId: input.bankAccountId,
      credit: input.amountMinor,
      description: "Bank",
      sourceTransactionId: input.transactionId,
    },
  ];
}
