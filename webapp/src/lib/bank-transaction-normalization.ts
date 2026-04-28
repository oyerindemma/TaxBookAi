import "server-only";

import { buildFallbackTextSuggestion } from "@/lib/bookkeeping-ai";

export type NormalizedBankTransactionText = {
  normalizedDescription: string | null;
  normalizedMerchantName: string | null;
  merchantSource: "counterparty" | "fallback" | "description" | "unknown";
};

const BANK_NOISE_PATTERN =
  /\b(?:trf|transfer|nip|mb transfer|pos|atm|ussd|web|mobile app|session|ref|reference|txn|tx|rev|reversal|alert|bank|stmt|statement|from|to)\b/gi;

const LEGAL_SUFFIX_PATTERN =
  /\b(?:ltd|limited|plc|llc|inc|enterprise|services|service|ventures|stores|global|group|solutions|company)\b/gi;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePlainText(value: string | null | undefined) {
  return compactWhitespace((value ?? "").replace(/[^\p{L}\p{N}\s]/gu, " "));
}

function stripBankNoise(value: string) {
  return compactWhitespace(
    value
      .replace(BANK_NOISE_PATTERN, " ")
      .replace(/\b\d{4,}\b/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

function normalizeMerchantCandidate(value: string | null | undefined) {
  const cleaned = compactWhitespace(
    normalizePlainText(value)
      .replace(BANK_NOISE_PATTERN, " ")
      .replace(LEGAL_SUFFIX_PATTERN, " ")
      .replace(/\b\d{2,}\b/g, " ")
  );

  if (!cleaned) return null;

  const tokens = cleaned
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 5);

  return tokens.length > 0 ? tokens.join(" ") : null;
}

function buildDescriptionMerchantCandidate(normalizedDescription: string | null) {
  if (!normalizedDescription) return null;

  const tokens = normalizedDescription
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        ![
          "payment",
          "received",
          "withdrawal",
          "cash",
          "expense",
          "income",
          "invoice",
          "purchase",
          "charges",
          "charge",
        ].includes(token)
    )
    .slice(0, 4);

  return tokens.length > 0 ? tokens.join(" ") : null;
}

export function normalizeBankTransactionText(input: {
  description: string;
  reference?: string | null;
  suggestedCounterparty?: string | null;
}) {
  const baseText = compactWhitespace([input.description, input.reference ?? ""].join(" "));
  const normalizedDescription = stripBankNoise(baseText).toLowerCase() || null;
  const fallbackSuggestion = buildFallbackTextSuggestion(baseText);

  const counterpartyMerchant = normalizeMerchantCandidate(input.suggestedCounterparty);
  if (counterpartyMerchant) {
    return {
      normalizedDescription,
      normalizedMerchantName: counterpartyMerchant,
      merchantSource: "counterparty",
    } satisfies NormalizedBankTransactionText;
  }

  const fallbackMerchant = normalizeMerchantCandidate(fallbackSuggestion.vendorName);
  if (fallbackMerchant) {
    return {
      normalizedDescription,
      normalizedMerchantName: fallbackMerchant,
      merchantSource: "fallback",
    } satisfies NormalizedBankTransactionText;
  }

  const descriptionMerchant = buildDescriptionMerchantCandidate(normalizedDescription);
  if (descriptionMerchant) {
    return {
      normalizedDescription,
      normalizedMerchantName: descriptionMerchant,
      merchantSource: "description",
    } satisfies NormalizedBankTransactionText;
  }

  return {
    normalizedDescription,
    normalizedMerchantName: null,
    merchantSource: "unknown",
  } satisfies NormalizedBankTransactionText;
}
