export type BankTransactionCategorizationAction =
  | "suggest"
  | "approve"
  | "reject";

export type BankTransactionCategorizationFieldErrors = Partial<
  Record<"action" | "transactionId" | "transactionIds" | "categoryId" | "limit", string>
>;

function parsePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseAction(value: unknown): BankTransactionCategorizationAction | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "suggest" ||
    normalized === "approve" ||
    normalized === "reject"
    ? normalized
    : null;
}

export function validateBankTransactionCategorizationActionPayload(
  body: Record<string, unknown>
) {
  const action = parseAction(body.action);
  const transactionId = parsePositiveInt(body.transactionId);
  const fieldErrors: BankTransactionCategorizationFieldErrors = {};

  if (!action) {
    fieldErrors.action = "Choose a valid categorization action.";
  }

  if (!transactionId) {
    fieldErrors.transactionId = "Choose a valid transaction.";
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
      action,
      transactionId: transactionId as number,
    },
  };
}

export function validateBulkBankTransactionCategorizationPayload(
  body: Record<string, unknown>
) {
  const rawIds = Array.isArray(body.transactionIds) ? body.transactionIds : [];
  const transactionIds = Array.from(
    new Set(
      rawIds
        .map((value) => parsePositiveInt(value))
        .filter((value): value is number => value !== null)
    )
  );
  const limit = parsePositiveInt(body.limit) ?? 100;
  const fieldErrors: BankTransactionCategorizationFieldErrors = {};

  if (rawIds.length > 0 && transactionIds.length === 0) {
    fieldErrors.transactionIds = "Choose at least one valid transaction.";
  } else if (transactionIds.length > 200) {
    fieldErrors.transactionIds = "Bulk categorization is limited to 200 transactions.";
  }

  if (limit > 200) {
    fieldErrors.limit = "Bulk categorization is limited to 200 transactions.";
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
      limit,
    },
  };
}
