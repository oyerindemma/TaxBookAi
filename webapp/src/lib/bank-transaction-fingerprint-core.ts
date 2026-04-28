import crypto from "crypto";
import type { BankTransactionType } from "@prisma/client";

function normalizeFingerprintText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFingerprintDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export type BankTransactionFingerprintInput = {
  bankAccountId: number;
  transactionDate: Date;
  amountMinor: number;
  type: BankTransactionType;
  description: string;
  reference: string | null;
};

export function buildBankTransactionFingerprintValue(
  input: BankTransactionFingerprintInput
) {
  return [
    input.bankAccountId,
    normalizeFingerprintDate(input.transactionDate),
    input.amountMinor,
    input.type,
    normalizeFingerprintText(input.description),
    normalizeFingerprintText(input.reference),
  ].join("|");
}

export function createBankTransactionFingerprintHash(
  input: BankTransactionFingerprintInput
) {
  return crypto
    .createHash("sha256")
    .update(buildBankTransactionFingerprintValue(input))
    .digest("hex");
}
