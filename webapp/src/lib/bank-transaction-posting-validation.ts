import "server-only";

type PostingValidationSuccess<T> = {
  ok: true;
  data: T;
};

type PostingValidationFailure = {
  ok: false;
  error: string;
  fieldErrors: Record<string, string>;
};

function parsePositiveInt(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function validateBankTransactionPostingPayload(
  body: Record<string, unknown>
): PostingValidationSuccess<{ transactionId: number }> | PostingValidationFailure {
  const transactionId = parsePositiveInt(body.transactionId);
  if (!transactionId) {
    return {
      ok: false,
      error: "Choose a valid bank transaction to post.",
      fieldErrors: {
        transactionId: "Choose a valid bank transaction to post.",
      },
    };
  }

  return {
    ok: true,
    data: {
      transactionId,
    },
  };
}

export function validateBulkBankTransactionPostingPayload(
  body: Record<string, unknown>
): PostingValidationSuccess<{ transactionIds: number[] }> | PostingValidationFailure {
  const rawTransactionIds = body.transactionIds;
  if (!Array.isArray(rawTransactionIds) || rawTransactionIds.length === 0) {
    return {
      ok: false,
      error: "Choose at least one bank transaction to post.",
      fieldErrors: {
        transactionIds: "Choose at least one bank transaction to post.",
      },
    };
  }

  const parsed = rawTransactionIds.map((value) => parsePositiveInt(value));
  if (parsed.some((value) => !value)) {
    return {
      ok: false,
      error: "One or more transaction ids are invalid.",
      fieldErrors: {
        transactionIds: "One or more transaction ids are invalid.",
      },
    };
  }

  return {
    ok: true,
    data: {
      transactionIds: [...new Set(parsed)] as number[],
    },
  };
}
