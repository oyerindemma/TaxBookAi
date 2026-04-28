import type { BankTransactionReviewStatus, VatTreatment, WhtTreatment } from "@prisma/client";
import { BANK_TRANSACTION_REVIEW_STATUSES } from "@/lib/banking";

const VAT_TREATMENTS = ["NONE", "INPUT", "OUTPUT", "EXEMPT"] as const satisfies readonly VatTreatment[];
const WHT_TREATMENTS = ["NONE", "PAYABLE", "RECEIVABLE"] as const satisfies readonly WhtTreatment[];

export type BankTransactionReviewUpdateBody = {
  reviewStatus?: unknown;
  reviewNotes?: unknown;
  description?: unknown;
  reference?: unknown;
  transactionDate?: unknown;
  categoryId?: unknown;
  vatTreatment?: unknown;
  whtTreatment?: unknown;
  vatRate?: unknown;
  whtRate?: unknown;
};

export type BankTransactionReviewFieldErrors = Partial<
  Record<
    | "reviewStatus"
    | "reviewNotes"
    | "description"
    | "reference"
    | "transactionDate"
    | "categoryId"
    | "vatTreatment"
    | "whtTreatment"
    | "vatRate"
    | "whtRate"
    | "transactionIds",
    string
  >
>;

type BankTransactionReviewUpdateData = {
  reviewStatus?: BankTransactionReviewStatus;
  reviewNotes?: string | null;
  description?: string;
  reference?: string | null;
  transactionDate?: Date;
  categoryId?: number | null;
  vatTreatment?: VatTreatment;
  whtTreatment?: WhtTreatment;
  vatRate?: number;
  whtRate?: number;
};

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

function parseVatTreatment(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return VAT_TREATMENTS.includes(normalized as VatTreatment)
    ? (normalized as VatTreatment)
    : null;
}

function parseWhtTreatment(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return WHT_TREATMENTS.includes(normalized as WhtTreatment)
    ? (normalized as WhtTreatment)
    : null;
}

function parseOptionalRate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100) / 100;
    }
  }

  return null;
}

export function parseBankTransactionReviewStatus(
  value: unknown
): BankTransactionReviewStatus | null {
  const normalized = normalizeString(value).toUpperCase();
  return BANK_TRANSACTION_REVIEW_STATUSES.includes(
    normalized as (typeof BANK_TRANSACTION_REVIEW_STATUSES)[number]
  )
    ? (normalized as (typeof BANK_TRANSACTION_REVIEW_STATUSES)[number])
    : null;
}

export function validateBankTransactionReviewUpdatePayload(
  body: BankTransactionReviewUpdateBody
) {
  const hasReviewStatus = body.reviewStatus !== undefined;
  const hasReviewNotes = body.reviewNotes !== undefined;
  const hasDescription = body.description !== undefined;
  const hasReference = body.reference !== undefined;
  const hasTransactionDate = body.transactionDate !== undefined;
  const hasCategoryId = body.categoryId !== undefined;
  const hasVatTreatment = body.vatTreatment !== undefined;
  const hasWhtTreatment = body.whtTreatment !== undefined;
  const hasVatRate = body.vatRate !== undefined;
  const hasWhtRate = body.whtRate !== undefined;

  const reviewStatus = hasReviewStatus
    ? parseBankTransactionReviewStatus(body.reviewStatus)
    : undefined;
  const reviewNotes = hasReviewNotes ? normalizeString(body.reviewNotes) || null : undefined;
  const description = hasDescription ? normalizeString(body.description) : undefined;
  const reference = hasReference ? normalizeString(body.reference) || null : undefined;
  const transactionDate = hasTransactionDate
    ? parseTransactionDate(body.transactionDate)
    : undefined;
  const categoryId = hasCategoryId ? parseOptionalPositiveInt(body.categoryId) : undefined;
  const vatTreatment = hasVatTreatment ? parseVatTreatment(body.vatTreatment) : undefined;
  const whtTreatment = hasWhtTreatment ? parseWhtTreatment(body.whtTreatment) : undefined;
  const vatRate = hasVatRate ? parseOptionalRate(body.vatRate) : undefined;
  const whtRate = hasWhtRate ? parseOptionalRate(body.whtRate) : undefined;
  const fieldErrors: BankTransactionReviewFieldErrors = {};

  if (
    !hasReviewStatus &&
    !hasReviewNotes &&
    !hasDescription &&
    !hasReference &&
    !hasTransactionDate &&
    !hasCategoryId &&
    !hasVatTreatment &&
    !hasWhtTreatment &&
    !hasVatRate &&
    !hasWhtRate
  ) {
    return {
      ok: false as const,
      error: "No review changes were provided.",
      fieldErrors,
    };
  }

  if (hasReviewStatus && !reviewStatus) {
    fieldErrors.reviewStatus = "Choose a valid review status.";
  }

  if (hasReviewNotes && reviewNotes && reviewNotes.length > 1000) {
    fieldErrors.reviewNotes = "Review notes must be 1000 characters or fewer.";
  }

  if (hasDescription && !description) {
    fieldErrors.description = "Enter a transaction description.";
  } else if (description && description.length > 160) {
    fieldErrors.description = "Description must be 160 characters or fewer.";
  }

  if (reference && reference.length > 120) {
    fieldErrors.reference = "Reference must be 120 characters or fewer.";
  }

  if (hasTransactionDate && !transactionDate) {
    fieldErrors.transactionDate = "Enter a valid transaction date.";
  }

  if (
    hasCategoryId &&
    body.categoryId !== null &&
    body.categoryId !== "" &&
    categoryId === null
  ) {
    fieldErrors.categoryId = "Choose a valid category.";
  }

  if (hasVatTreatment && !vatTreatment) {
    fieldErrors.vatTreatment = "Choose a valid VAT treatment.";
  }

  if (hasWhtTreatment && !whtTreatment) {
    fieldErrors.whtTreatment = "Choose a valid WHT treatment.";
  }

  if (hasVatRate && vatRate === null) {
    fieldErrors.vatRate = "Enter a valid VAT rate.";
  } else if (typeof vatRate === "number" && (vatRate < 0 || vatRate > 100)) {
    fieldErrors.vatRate = "VAT rate must be between 0 and 100.";
  }

  if (hasWhtRate && whtRate === null) {
    fieldErrors.whtRate = "Enter a valid WHT rate.";
  } else if (typeof whtRate === "number" && (whtRate < 0 || whtRate > 100)) {
    fieldErrors.whtRate = "WHT rate must be between 0 and 100.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false as const,
      error: "Please correct the highlighted fields.",
      fieldErrors,
    };
  }

  const data: BankTransactionReviewUpdateData = {};

  if (hasReviewStatus) {
    data.reviewStatus = reviewStatus ?? undefined;
  }

  if (hasReviewNotes) {
    data.reviewNotes = reviewNotes;
  }

  if (hasDescription) {
    data.description = description;
  }

  if (hasReference) {
    data.reference = reference;
  }

  if (hasTransactionDate) {
    data.transactionDate = transactionDate ?? undefined;
  }

  if (hasCategoryId) {
    data.categoryId = categoryId;
  }

  if (hasVatTreatment) {
    data.vatTreatment = vatTreatment ?? undefined;
  }

  if (hasWhtTreatment) {
    data.whtTreatment = whtTreatment ?? undefined;
  }

  if (hasVatRate) {
    data.vatRate = vatRate ?? undefined;
  }

  if (hasWhtRate) {
    data.whtRate = whtRate ?? undefined;
  }

  return {
    ok: true as const,
    data,
  };
}

export function validateBankTransactionReviewBulkPayload(
  body: Record<string, unknown>
) {
  const rawIds = Array.isArray(body.transactionIds) ? body.transactionIds : [];
  const transactionIds = Array.from(
    new Set(
      rawIds
        .map((value) => parseOptionalPositiveInt(value))
        .filter((value): value is number => value !== null)
    )
  );
  const reviewStatus = parseBankTransactionReviewStatus(body.reviewStatus);
  const fieldErrors: BankTransactionReviewFieldErrors = {};

  if (transactionIds.length === 0) {
    fieldErrors.transactionIds = "Select at least one transaction.";
  } else if (transactionIds.length > 200) {
    fieldErrors.transactionIds = "Bulk updates are limited to 200 transactions at a time.";
  }

  if (!reviewStatus) {
    fieldErrors.reviewStatus = "Choose a valid review status.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false as const,
      error: "Please correct the highlighted fields.",
      fieldErrors,
    };
  }

  return {
    ok: true as const,
    data: {
      transactionIds,
      reviewStatus: reviewStatus as BankTransactionReviewStatus,
    },
  };
}
