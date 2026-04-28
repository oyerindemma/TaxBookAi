import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBankTransactionFingerprintValue,
  createBankTransactionFingerprintHash,
} from "./bank-transaction-fingerprint-core";
import {
  detectPotentialBankTransactionDuplicate,
  type DuplicateComparableBankTransaction,
} from "./bank-transaction-duplicates-core";
import {
  buildBankTransactionPostingJournalLines,
  calculatePrimaryPostingLineAmount,
} from "./bank-transaction-posting-lines";

function comparable(
  overrides: Partial<DuplicateComparableBankTransaction> = {}
): DuplicateComparableBankTransaction {
  return {
    id: 1,
    bankAccountId: 10,
    transactionDate: new Date("2026-04-01T12:00:00.000Z"),
    amount: 125_000,
    type: "DEBIT",
    description: "POS purchase Jumia Lagos",
    reference: "TRF-ABC-123456",
    normalizedDescription: "pos purchase jumia lagos",
    normalizedMerchantName: "jumia",
    ...overrides,
  };
}

function totals(lines: Array<{ debit?: number | null; credit?: number | null }>) {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    debit += line.debit ?? 0;
    credit += line.credit ?? 0;
  }
  return { debit, credit };
}

test("bank transaction fingerprints normalize noisy CSV text but remain account-scoped", () => {
  const base = {
    bankAccountId: 10,
    transactionDate: new Date("2026-04-01T22:10:00.000Z"),
    amountMinor: 125_000,
    type: "DEBIT" as const,
    description: "  POS   Purchase JUMIA Lagos ",
    reference: " REF-100 ",
  };

  const normalized = {
    ...base,
    transactionDate: new Date("2026-04-01T06:00:00.000Z"),
    description: "pos purchase jumia lagos",
    reference: "ref-100",
  };

  assert.equal(
    buildBankTransactionFingerprintValue(base),
    "10|2026-04-01|125000|DEBIT|pos purchase jumia lagos|ref-100"
  );
  assert.equal(
    createBankTransactionFingerprintHash(base),
    createBankTransactionFingerprintHash(normalized)
  );
  assert.notEqual(
    createBankTransactionFingerprintHash(base),
    createBankTransactionFingerprintHash({ ...base, bankAccountId: 11 })
  );
});

test("duplicate detection flags same-account repeat imports and ignores opposite directions", () => {
  const transaction = comparable({ id: 2 });
  const candidates = [
    comparable({
      id: 1,
      description: "POS PURCHASE / JUMIA LAGOS",
      normalizedDescription: "pos purchase jumia lagos",
    }),
    comparable({
      id: 3,
      type: "CREDIT",
      description: "Refund Jumia Lagos",
      normalizedDescription: "refund jumia lagos",
    }),
  ];

  const result = detectPotentialBankTransactionDuplicate({
    transaction,
    candidates,
  });

  assert.equal(result.possibleDuplicateOfTransactionId, 1);
  assert.equal(result.candidateCount, 2);
  assert.ok((result.confidence ?? 0) >= 0.62);
  assert.match(result.reason ?? "", /same bank account|amount exactly matches/i);
});

test("duplicate detection leaves distinct transactions available for review", () => {
  const result = detectPotentialBankTransactionDuplicate({
    transaction: comparable({ id: 2 }),
    candidates: [
      comparable({
        id: 1,
        transactionDate: new Date("2026-03-01T12:00:00.000Z"),
        amount: 420_000,
        description: "Rent March",
        reference: "RENT-2026-03",
        normalizedDescription: "rent march",
        normalizedMerchantName: "landlord",
      }),
    ],
  });

  assert.equal(result.possibleDuplicateOfTransactionId, null);
  assert.equal(result.confidence, null);
});

test("posting lines balance money-in transactions with output VAT payable", () => {
  const lines = buildBankTransactionPostingJournalLines({
    transactionId: 99,
    amountMinor: 1_000_000,
    type: "CREDIT",
    categoryName: "Revenue",
    bankAccountId: 100,
    categoryAccountId: 200,
    taxLines: [{ accountId: 300, amountMinor: 75_000, description: "VAT payable" }],
  });

  assert.deepEqual(totals(lines), { debit: 1_000_000, credit: 1_000_000 });
  assert.equal(calculatePrimaryPostingLineAmount({
    amountMinor: 1_000_000,
    type: "CREDIT",
    taxLines: [{ accountId: 300, amountMinor: 75_000, description: "VAT payable" }],
  }), 925_000);
  assert.deepEqual(
    lines.map((line) => ({
      accountId: line.accountId,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      description: line.description,
    })),
    [
      { accountId: 100, debit: 1_000_000, credit: 0, description: "Bank" },
      { accountId: 200, debit: 0, credit: 925_000, description: "Revenue" },
      { accountId: 300, debit: 0, credit: 75_000, description: "VAT payable" },
    ]
  );
});

test("posting lines balance money-out transactions with withholding payable", () => {
  const lines = buildBankTransactionPostingJournalLines({
    transactionId: 100,
    amountMinor: 1_000_000,
    type: "DEBIT",
    categoryName: "Professional fees",
    bankAccountId: 100,
    categoryAccountId: 210,
    taxLines: [{ accountId: 310, amountMinor: 50_000, description: "WHT payable" }],
  });

  assert.deepEqual(totals(lines), { debit: 1_050_000, credit: 1_050_000 });
  assert.equal(calculatePrimaryPostingLineAmount({
    amountMinor: 1_000_000,
    type: "DEBIT",
    taxLines: [{ accountId: 310, amountMinor: 50_000, description: "WHT payable" }],
  }), 1_050_000);
  assert.equal(lines[0].description, "Professional fees");
  assert.equal(lines.at(-1)?.description, "Bank");
});
