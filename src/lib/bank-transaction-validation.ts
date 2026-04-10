import type { BankTransactionStatus } from "@prisma/client";

export type BankTransactionDirection = "INCOME" | "EXPENSE";

export type ManualBankTransactionBody = {
  bankAccountId?: unknown;
  clientBusinessId?: unknown;
  date?: unknown;
  description?: unknown;
  reference?: unknown;
  amount?: unknown;
  currency?: unknown;
  direction?: unknown;
  status?: unknown;
  categoryId?: unknown;
  notes?: unknown;
};

export type ManualBankTransactionFieldErrors = Partial<
  Record<
    | "bankAccountId"
    | "clientBusinessId"
    | "date"
    | "description"
    | "reference"
    | "amount"
    | "currency"
    | "direction"
    | "status"
    | "categoryId"
    | "notes",
    string
  >
>;

type ValidatedManualBankTransactionData = {
  bankAccountId: number;
  clientBusinessId: number;
  categoryId: number | null;
  transactionDate: Date;
  description: string;
  reference: string | null;
  amountMinor: number;
  currency: string;
  direction: BankTransactionDirection;
  status: BankTransactionStatus;
  notes: string | null;
};

export const MANUAL_BANK_TRANSACTION_STATUSES = [
  "UNMATCHED",
  "REVIEW_REQUIRED",
  "IGNORED",
] as const satisfies readonly BankTransactionStatus[];

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseAmountToMinor(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}

function parseTransactionDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;

  const exactDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (exactDate) {
    const parsed = new Date(
      Date.UTC(Number(exactDate[1]), Number(exactDate[2]) - 1, Number(exactDate[3]), 12)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDirection(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  if (normalized === "INCOME" || normalized === "EXPENSE") {
    return normalized as BankTransactionDirection;
  }
  return null;
}

function parseStatus(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return MANUAL_BANK_TRANSACTION_STATUSES.includes(
    normalized as (typeof MANUAL_BANK_TRANSACTION_STATUSES)[number]
  )
    ? (normalized as (typeof MANUAL_BANK_TRANSACTION_STATUSES)[number])
    : null;
}

export function validateManualBankTransactionPayload(
  body: ManualBankTransactionBody
) {
  const bankAccountId = parseOptionalPositiveInt(body.bankAccountId);
  const clientBusinessId = parseOptionalPositiveInt(body.clientBusinessId);
  const categoryId = parseOptionalPositiveInt(body.categoryId);
  const transactionDate = parseTransactionDate(body.date);
  const description = normalizeString(body.description);
  const reference = normalizeString(body.reference) || null;
  const amountMinor = parseAmountToMinor(body.amount);
  const currency = normalizeString(body.currency).toUpperCase() || "NGN";
  const direction = parseDirection(body.direction);
  const status = parseStatus(body.status) ?? "UNMATCHED";
  const notes = normalizeString(body.notes) || null;
  const fieldErrors: ManualBankTransactionFieldErrors = {};

  if (!bankAccountId) {
    fieldErrors.bankAccountId = "Select a bank account.";
  }

  if (!clientBusinessId) {
    fieldErrors.clientBusinessId = "Select a client business.";
  }

  if (!transactionDate) {
    fieldErrors.date = "Enter a valid transaction date.";
  }

  if (!description) {
    fieldErrors.description = "Enter a transaction description.";
  } else if (description.length > 160) {
    fieldErrors.description = "Description must be 160 characters or fewer.";
  }

  if (reference && reference.length > 120) {
    fieldErrors.reference = "Reference must be 120 characters or fewer.";
  }

  if (!amountMinor || amountMinor <= 0) {
    fieldErrors.amount = "Enter an amount greater than 0.";
  }

  if (!direction) {
    fieldErrors.direction = "Choose whether this is income or expense.";
  }

  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    fieldErrors.currency = "Use a 3-letter currency code like NGN or USD.";
  }

  if (!status) {
    fieldErrors.status = "Choose a valid transaction status.";
  }

  if (notes && notes.length > 500) {
    fieldErrors.notes = "Notes must be 500 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false as const,
      fieldErrors,
    };
  }

  const data: ValidatedManualBankTransactionData = {
    bankAccountId: bankAccountId as number,
    clientBusinessId: clientBusinessId as number,
    categoryId,
    transactionDate: transactionDate as Date,
    description,
    reference,
    amountMinor: amountMinor as number,
    currency,
    direction: direction as BankTransactionDirection,
    status,
    notes,
  };

  return {
    ok: true as const,
    data,
  };
}
