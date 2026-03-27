import { NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";

export type BookkeepingClassification = "INCOME" | "EXPENSE";
export type BookkeepingRelevance = "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
export type BookkeepingConfidence = "HIGH" | "MEDIUM" | "LOW";
export type BookkeepingSourceType = "text" | "receipt-image";
export type BookkeepingProvider = "openai" | "heuristic-fallback" | "unavailable";

export type BookkeepingTaxSignal = {
  relevance: BookkeepingRelevance;
  suggestedRate: number;
  reason: string;
};

export type BookkeepingSuggestion = {
  classification: BookkeepingClassification;
  suggestedCategory: string | null;
  vendorName: string | null;
  amount: number | null;
  currency: string;
  transactionDate: string | null;
  description: string;
  vat: BookkeepingTaxSignal;
  wht: BookkeepingTaxSignal;
  confidence: BookkeepingConfidence;
  notes: string[];
};

export type BookkeepingSuggestionMetadata = {
  version: 1;
  provider: BookkeepingProvider;
  route: "tax-record-draft" | "receipt-scan";
  model: string | null;
  sourceType: BookkeepingSourceType;
  generatedAt: string;
  warnings: string[];
  fileName?: string | null;
};

export type LegacyTaxRecordDraft = {
  kind: BookkeepingClassification;
  type: BookkeepingClassification;
  amount: number;
  currency: string;
  date: string;
  description: string;
  category: string | null;
  vendorName: string | null;
  taxType: "VAT" | "WHT" | "NONE" | "CUSTOM";
  suggestedTaxRate: number;
  taxRate: number;
  vatRelevance: BookkeepingRelevance;
  whtRelevance: BookkeepingRelevance;
};

export const BOOKKEEPING_CATEGORY_GUIDANCE =
  "When a category fits, prefer one of these exact names: Office, Software, Utilities, Marketing, Transport, Rent, Miscellaneous.";

const EXPENSE_CATEGORY_HINTS: Array<[string[], string]> = [
  [["fuel", "transport", "uber", "bolt", "taxi", "bus", "flight", "travel"], "Transport"],
  [["office", "stationery", "printer", "paper", "desk", "chair", "supplies"], "Office"],
  [["rent", "lease", "tenancy", "landlord"], "Rent"],
  [["internet", "data", "airtime", "electricity", "power", "water", "utility"], "Utilities"],
  [["software", "saas", "subscription", "license", "hosting", "domain"], "Software"],
  [["ads", "advert", "campaign", "promotion", "facebook", "google"], "Marketing"],
];

const EXPENSE_HINTS = [
  "paid",
  "purchase",
  "bought",
  "expense",
  "debit",
  "withdrawal",
  "receipt",
  "vendor",
  "fuel",
  "rent",
];

const INCOME_HINTS = [
  "received",
  "deposit",
  "credit",
  "sale",
  "payment from",
  "customer",
  "invoice paid",
  "income",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeRelevance(value: unknown): BookkeepingRelevance {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "RELEVANT" || raw === "NOT_RELEVANT" || raw === "UNCERTAIN") {
    return raw;
  }
  return "UNCERTAIN";
}

function normalizeConfidence(value: unknown): BookkeepingConfidence {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "HIGH" || raw === "MEDIUM" || raw === "LOW") return raw;
  return "LOW";
}

function normalizeClassification(value: unknown): BookkeepingClassification {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "INCOME" || raw === "EXPENSE") return raw;
  return "EXPENSE";
}

function cleanCategory(value: unknown) {
  const raw = normalizeString(value);
  return raw || null;
}

function cleanVendor(value: unknown) {
  const raw = normalizeString(value);
  return raw || null;
}

function extractNotes(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeTaxSignal(value: unknown, fallbackReason: string): BookkeepingTaxSignal {
  if (!isRecord(value)) {
    return {
      relevance: "UNCERTAIN",
      suggestedRate: 0,
      reason: fallbackReason,
    };
  }

  return {
    relevance: normalizeRelevance(value.relevance),
    suggestedRate: Math.max(0, normalizeNumber(value.suggestedRate) ?? 0),
    reason: normalizeString(value.reason) || fallbackReason,
  };
}

function inferCategoryFromText(text: string) {
  const normalized = text.toLowerCase();
  for (const [keywords, category] of EXPENSE_CATEGORY_HINTS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }
  return null;
}

function inferClassificationFromText(text: string): BookkeepingClassification {
  const normalized = text.toLowerCase();
  const incomeScore = INCOME_HINTS.filter((hint) => normalized.includes(hint)).length;
  const expenseScore = EXPENSE_HINTS.filter((hint) => normalized.includes(hint)).length;
  return incomeScore > expenseScore ? "INCOME" : "EXPENSE";
}

function extractAmountFromText(text: string) {
  const candidates = Array.from(
    text.matchAll(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?/g)
  )
    .map((match) => {
      const raw = match[0];
      const value = Number(raw.replace(/,/g, ""));
      const index = match.index ?? 0;
      const prefix = text.slice(Math.max(0, index - 12), index).toLowerCase();
      const context = text
        .slice(Math.max(0, index - 20), Math.min(text.length, index + raw.length + 20))
        .toLowerCase();

      let score = 0;
      if (/(ngn|naira|₦|\$|usd|eur|gbp)\s*$/.test(prefix)) score += 5;
      if (/(amount|total|paid|payment|sum|cost|fee)/.test(context)) score += 4;
      if (raw.includes(",") || raw.includes(".")) score += 1;
      if (value >= 1000) score += 1;
      if (/^20\d{2}$/.test(raw) && /(date|issued|invoice)/.test(context)) score -= 6;

      return {
        value,
        score,
        index,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.value));

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.value !== left.value) return right.value - left.value;
    return left.index - right.index;
  });

  return candidates[0]?.value ?? null;
}

function extractCurrencyFromText(text: string) {
  const normalized = text.toUpperCase();
  if (normalized.includes("USD") || normalized.includes("$")) return "USD";
  if (normalized.includes("EUR") || normalized.includes("€")) return "EUR";
  if (normalized.includes("GBP") || normalized.includes("£")) return "GBP";
  return "NGN";
}

function extractDateFromText(text: string) {
  const patterns = [
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(\d{2})\/(\d{2})\/(\d{4})\b/,
    /\b(\d{2})-(\d{2})-(\d{4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (pattern === patterns[0]) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function extractVendorFromText(text: string) {
  const labeledMatch = text.match(
    /\b(?:vendor|merchant|from|payee|supplier)\s*[:\-]\s*([^\n,]+)/i
  );
  if (labeledMatch?.[1]) {
    return labeledMatch[1].trim();
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  if (firstLine.length > 60) return null;
  if (/[0-9]/.test(firstLine) && !/[A-Za-z]/.test(firstLine)) return null;
  return firstLine;
}

function extractDescription(text: string, vendorName: string | null) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return vendorName ? `Transaction with ${vendorName}` : "Business transaction";
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

function inferVatSignal(text: string, category: string | null): BookkeepingTaxSignal {
  const normalized = text.toLowerCase();
  if (normalized.includes("vat")) {
    const rateMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*vat/);
    return {
      relevance: "RELEVANT",
      suggestedRate:
        rateMatch?.[1] ? Number(rateMatch[1]) : NIGERIA_TAX_CONFIG.vat.standardRate,
      reason: "VAT is explicitly mentioned in the transaction details.",
    };
  }
  if (normalized.includes("tax invoice")) {
    return {
      relevance: "RELEVANT",
      suggestedRate: NIGERIA_TAX_CONFIG.vat.standardRate,
      reason: "The text reads like a Nigerian tax invoice.",
    };
  }
  if (category && ["Office", "Software", "Utilities", "Marketing", "Rent"].includes(category)) {
    return {
      relevance: "UNCERTAIN",
      suggestedRate: NIGERIA_TAX_CONFIG.vat.standardRate,
      reason: "This type of Nigerian business spend often includes VAT, but it was not explicit in the text.",
    };
  }
  return {
    relevance: "NOT_RELEVANT",
    suggestedRate: 0,
    reason: "No clear VAT signal was found.",
  };
}

function inferWhtSignal(text: string, category: string | null): BookkeepingTaxSignal {
  const normalized = text.toLowerCase();
  if (normalized.includes("withholding") || normalized.includes("wht")) {
    const rateMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:wht|withholding)/);
    return {
      relevance: "RELEVANT",
      suggestedRate:
        rateMatch?.[1]
          ? Number(rateMatch[1])
          : NIGERIA_TAX_CONFIG.wht.heuristicDefaultRate,
      reason: "Withholding tax is explicitly mentioned in the transaction details.",
    };
  }
  if (category && ["Marketing", "Rent", "Software"].includes(category)) {
    return {
      relevance: "UNCERTAIN",
      suggestedRate: 0,
      reason: "This payment may attract Nigerian WHT depending on the contract and vendor type.",
    };
  }
  return {
    relevance: "NOT_RELEVANT",
    suggestedRate: 0,
    reason: "No clear WHT signal was found.",
  };
}

export function extractOutputText(data: unknown) {
  if (isRecord(data) && typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = isRecord(data) ? data.output : undefined;
  if (!Array.isArray(output)) return null;

  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (isRecord(part) && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  const text = chunks.join("").trim();
  return text || null;
}

export function normalizeBookkeepingSuggestion(input: unknown): BookkeepingSuggestion {
  const value: Record<string, unknown> = isRecord(input) ? input : {};
  const classification = normalizeClassification(value.classification ?? value.kind ?? value.type);
  const category = cleanCategory(value.suggestedCategory ?? value.category);
  const vendorName = cleanVendor(value.vendorName);

  return {
    classification,
    suggestedCategory: category,
    vendorName,
    amount: normalizeNumber(value.amount),
    currency: normalizeString(value.currency).toUpperCase() || "NGN",
    transactionDate:
      normalizeDate(value.transactionDate ?? value.date) ??
      new Date().toISOString().slice(0, 10),
    description:
      normalizeString(value.description) ||
      (vendorName ? `Transaction with ${vendorName}` : "Business transaction"),
    vat: normalizeTaxSignal(
      value.vat,
      "VAT relevance could not be determined confidently."
    ),
    wht: normalizeTaxSignal(
      value.wht,
      "WHT relevance could not be determined confidently."
    ),
    confidence: normalizeConfidence(value.confidence),
    notes: extractNotes(value.notes),
  };
}

export function buildFallbackTextSuggestion(text: string): BookkeepingSuggestion {
  const classification = inferClassificationFromText(text);
  const category = classification === "EXPENSE" ? inferCategoryFromText(text) : null;
  const vendorName = extractVendorFromText(text);
  const amount = extractAmountFromText(text);
  const currency = extractCurrencyFromText(text);
  const transactionDate = extractDateFromText(text) ?? new Date().toISOString().slice(0, 10);
  const description = extractDescription(text, vendorName);
  const vat = inferVatSignal(text, category);
  const wht = inferWhtSignal(text, category);

  const notes = [
    "Generated with local fallback rules because OPENAI_API_KEY is not configured.",
  ];

  if (amount === null) {
    notes.push("Amount could not be extracted confidently. Review before saving.");
  }

  return {
    classification,
    suggestedCategory: category,
    vendorName,
    amount,
    currency,
    transactionDate,
    description,
    vat,
    wht,
    confidence: amount !== null ? "LOW" : "LOW",
    notes,
  };
}

export function getSuggestedTaxRate(suggestion: BookkeepingSuggestion) {
  if (suggestion.vat.relevance === "RELEVANT" || suggestion.vat.relevance === "UNCERTAIN") {
    return suggestion.vat.suggestedRate;
  }
  if (suggestion.wht.relevance === "RELEVANT") {
    return suggestion.wht.suggestedRate;
  }
  return 0;
}

export function getSuggestedTaxType(suggestion: BookkeepingSuggestion) {
  if (suggestion.wht.relevance === "RELEVANT") return "WHT" as const;
  if (suggestion.vat.relevance === "RELEVANT" || suggestion.vat.relevance === "UNCERTAIN") {
    return "VAT" as const;
  }
  return "NONE" as const;
}

export function buildLegacyTaxRecordDraft(suggestion: BookkeepingSuggestion): LegacyTaxRecordDraft {
  return {
    kind: suggestion.classification,
    type: suggestion.classification,
    amount: suggestion.amount ?? 0,
    currency: suggestion.currency,
    date: suggestion.transactionDate ?? new Date().toISOString().slice(0, 10),
    description: suggestion.description,
    category: suggestion.suggestedCategory,
    vendorName: suggestion.vendorName,
    taxType: getSuggestedTaxType(suggestion),
    suggestedTaxRate: getSuggestedTaxRate(suggestion),
    taxRate: getSuggestedTaxRate(suggestion),
    vatRelevance: suggestion.vat.relevance,
    whtRelevance: suggestion.wht.relevance,
  };
}
