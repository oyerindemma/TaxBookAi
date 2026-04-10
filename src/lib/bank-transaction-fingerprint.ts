import "server-only";

import crypto from "crypto";
import type { BankTransactionType } from "@prisma/client";

function normalizeFingerprintText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFingerprintDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildBankTransactionFingerprintValue(input: {
  bankAccountId: number;
  transactionDate: Date;
  amountMinor: number;
  type: BankTransactionType;
  description: string;
  reference: string | null;
}) {
  return [
    input.bankAccountId,
    normalizeFingerprintDate(input.transactionDate),
    input.amountMinor,
    input.type,
    normalizeFingerprintText(input.description),
    normalizeFingerprintText(input.reference),
  ].join("|");
}

export function createBankTransactionFingerprintHash(input: {
  bankAccountId: number;
  transactionDate: Date;
  amountMinor: number;
  type: BankTransactionType;
  description: string;
  reference: string | null;
}) {
  return crypto
    .createHash("sha256")
    .update(buildBankTransactionFingerprintValue(input))
    .digest("hex");
}
