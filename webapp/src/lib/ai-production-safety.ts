import type {
  BookkeepingConfidence,
  BookkeepingProvider,
  BookkeepingSuggestion,
  BookkeepingSuggestionMetadata,
} from "@/lib/bookkeeping-ai";

export const AI_REVIEW_DISCLAIMER =
  "AI output is a draft for bookkeeping review, not tax or legal advice.";

export const AI_TAX_REVIEW_WARNING =
  "Review VAT, WHT, deductibility, and filing treatment with the underlying document before filing.";

export function confidenceLabel(score: number | null | undefined): BookkeepingConfidence {
  if (typeof score !== "number" || !Number.isFinite(score)) return "LOW";
  if (score >= 0.8) return "HIGH";
  if (score >= 0.55) return "MEDIUM";
  return "LOW";
}

export function confidenceExplanation(confidence: BookkeepingConfidence) {
  if (confidence === "HIGH") {
    return "Most key fields were readable, but the draft still needs human review before posting or filing.";
  }
  if (confidence === "MEDIUM") {
    return "Some key fields were inferred or partially matched. Check amount, date, category, and tax treatment.";
  }
  return "Several fields were missing, unclear, or inferred locally. Treat this as review-needed.";
}

export function buildAiSafetyWarnings(input?: {
  provider?: BookkeepingProvider | "rules" | "unavailable" | null;
  confidence?: BookkeepingConfidence | null;
  taxRelevant?: boolean;
}) {
  const warnings = new Set<string>();
  warnings.add(AI_REVIEW_DISCLAIMER);

  if (input?.provider && input.provider !== "openai") {
    warnings.add("OpenAI was unavailable or not configured, so TaxBook used conservative local fallback rules.");
  }

  if (input?.confidence === "LOW") {
    warnings.add(confidenceExplanation("LOW"));
  } else if (input?.confidence === "MEDIUM") {
    warnings.add(confidenceExplanation("MEDIUM"));
  }

  if (input?.taxRelevant) {
    warnings.add(AI_TAX_REVIEW_WARNING);
  }

  return Array.from(warnings);
}

export function addAiSafetyToSuggestion(suggestion: BookkeepingSuggestion): BookkeepingSuggestion {
  const taxRelevant =
    suggestion.vat.relevance !== "NOT_RELEVANT" ||
    suggestion.wht.relevance !== "NOT_RELEVANT";
  const notes = new Set([
    ...suggestion.notes,
    confidenceExplanation(suggestion.confidence),
    ...buildAiSafetyWarnings({
      confidence: suggestion.confidence,
      taxRelevant,
    }),
  ]);

  return {
    ...suggestion,
    notes: Array.from(notes).slice(0, 8),
  };
}

export function buildAiSuggestionMetadata(input: {
  provider: BookkeepingSuggestionMetadata["provider"];
  route: BookkeepingSuggestionMetadata["route"];
  model: string | null;
  sourceType: BookkeepingSuggestionMetadata["sourceType"];
  warnings?: string[];
  fileName?: string | null;
}) {
  return {
    version: 1 as const,
    provider: input.provider,
    route: input.route,
    model: input.model,
    sourceType: input.sourceType,
    generatedAt: new Date().toISOString(),
    warnings: Array.from(
      new Set([
        ...(input.warnings ?? []),
        ...buildAiSafetyWarnings({ provider: input.provider }),
      ])
    ),
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
  } satisfies BookkeepingSuggestionMetadata;
}

export type MessyAiEvaluationFixture = {
  id: string;
  description: string;
  input: string;
  expected: {
    classification: "INCOME" | "EXPENSE";
    currency: string;
    amount: number | null;
    category: string | null;
    vat: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
    wht: "RELEVANT" | "NOT_RELEVANT" | "UNCERTAIN";
  };
};

export const MESSY_BOOKKEEPING_FIXTURES: MessyAiEvaluationFixture[] = [
  {
    id: "faded-pos-fuel",
    description: "Faded POS fuel receipt with noisy amount and date",
    input: "TOTAL PAID NGN 48,500.00\nMOBIL FILLING STATION\nPOS APPROVED\n12/04/2026\nTHANK YOU",
    expected: {
      classification: "EXPENSE",
      currency: "NGN",
      amount: 48_500,
      category: "Transport",
      vat: "NOT_RELEVANT",
      wht: "NOT_RELEVANT",
    },
  },
  {
    id: "consulting-invoice-wht",
    description: "Professional services invoice with explicit WHT and VAT",
    input:
      "Invoice INV-449\nVendor: Blue Advisory Ltd\nProfessional consulting fee subtotal 1,000,000 VAT 7.5% 75,000 WHT 5% 50,000 total amount 1,075,000",
    expected: {
      classification: "EXPENSE",
      currency: "NGN",
      amount: 1_075_000,
      category: null,
      vat: "RELEVANT",
      wht: "RELEVANT",
    },
  },
  {
    id: "customer-transfer",
    description: "Bank transfer receipt for customer payment",
    input: "Received payment from customer ACME Stores for invoice paid. Credit NGN 350,000 on 2026-04-18.",
    expected: {
      classification: "INCOME",
      currency: "NGN",
      amount: 350_000,
      category: null,
      vat: "NOT_RELEVANT",
      wht: "NOT_RELEVANT",
    },
  },
  {
    id: "unknown-scan-fragment",
    description: "Fragmented OCR with no reliable amount",
    input: "scan copy\nsupplier: ???\namount unreadable\npaid by card\ninvoice maybe 2026",
    expected: {
      classification: "EXPENSE",
      currency: "NGN",
      amount: null,
      category: null,
      vat: "NOT_RELEVANT",
      wht: "NOT_RELEVANT",
    },
  },
];
