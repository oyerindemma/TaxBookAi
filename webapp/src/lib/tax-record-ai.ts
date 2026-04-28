import {
  type BookkeepingProvider,
  type BookkeepingSourceType,
  normalizeBookkeepingSuggestion,
} from "@/lib/bookkeeping-ai";

type PendingTaxRecordAiMetadata = {
  version?: unknown;
  assistant?: unknown;
  suggestion?: unknown;
  review?: unknown;
};

type ReviewMetadata = {
  appliedAt: string;
};

type AssistantMetadata = {
  version: 1;
  provider: BookkeepingProvider;
  route: "tax-record-draft" | "receipt-scan";
  model: string | null;
  sourceType: BookkeepingSourceType;
  generatedAt: string;
  warnings: string[];
  fileName?: string | null;
};

export type TaxRecordAiMetadataPayload = {
  version: 1;
  assistant: AssistantMetadata;
  suggestion: ReturnType<typeof normalizeBookkeepingSuggestion>;
  review: ReviewMetadata;
};

type PersistedTaxRecordAiMetadata = TaxRecordAiMetadataPayload & {
  approval: {
    approvedAt: string;
    approvedByUserId: number;
  };
};

const MAX_AI_METADATA_LENGTH = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIsoDate(value: unknown, fallback: string) {
  const raw = normalizeString(value);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function normalizeProvider(value: unknown): BookkeepingProvider {
  const raw = normalizeString(value);
  if (raw === "openai" || raw === "heuristic-fallback" || raw === "unavailable") {
    return raw;
  }
  return "heuristic-fallback";
}

function normalizeSourceType(value: unknown): BookkeepingSourceType {
  const raw = normalizeString(value);
  if (raw === "text" || raw === "receipt-image") return raw;
  return "text";
}

function normalizeAssistantMetadata(value: unknown): AssistantMetadata {
  const now = new Date().toISOString();
  if (!isRecord(value)) {
    return {
      version: 1 as const,
      provider: "heuristic-fallback" as const,
      route: "tax-record-draft" as const,
      model: null,
      sourceType: "text" as const,
      generatedAt: now,
      warnings: ["Assistant metadata was incomplete. The saved payload was normalized."],
    };
  }

  return {
    version: 1 as const,
    provider: normalizeProvider(value.provider),
    route: value.route === "receipt-scan" ? "receipt-scan" : "tax-record-draft",
    model: normalizeString(value.model) || null,
    sourceType: normalizeSourceType(value.sourceType),
    generatedAt: normalizeIsoDate(value.generatedAt, now),
    warnings: Array.isArray(value.warnings)
      ? value.warnings
          .map((warning) => normalizeString(warning))
          .filter(Boolean)
          .slice(0, 5)
      : [],
    fileName: normalizeString(value.fileName) || null,
  };
}

function normalizeReviewMetadata(value: unknown): ReviewMetadata {
  const now = new Date().toISOString();
  if (!isRecord(value)) {
    return { appliedAt: now };
  }
  return {
    appliedAt: normalizeIsoDate(value.appliedAt, now),
  };
}

export function buildPendingTaxRecordAiMetadata(
  payload: Omit<TaxRecordAiMetadataPayload, "version">
): TaxRecordAiMetadataPayload {
  return {
    version: 1,
    assistant: normalizeAssistantMetadata(payload.assistant),
    suggestion: normalizeBookkeepingSuggestion(payload.suggestion),
    review: normalizeReviewMetadata(payload.review),
  };
}

export function serializeTaxRecordAiMetadata(raw: unknown, approvedByUserId: number) {
  if (raw === undefined) {
    return { serialized: undefined, source: undefined };
  }

  if (raw === null || raw === "") {
    return { serialized: null, source: null };
  }

  let parsed: PendingTaxRecordAiMetadata = raw as PendingTaxRecordAiMetadata;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as PendingTaxRecordAiMetadata;
    } catch {
      throw new Error("aiMetadata must be valid JSON");
    }
  }

  if (!isRecord(parsed)) {
    throw new Error("aiMetadata must be an object");
  }

  const metadata: PersistedTaxRecordAiMetadata = {
    version: 1,
    assistant: normalizeAssistantMetadata(parsed.assistant),
    suggestion: normalizeBookkeepingSuggestion(parsed.suggestion),
    review: normalizeReviewMetadata(parsed.review),
    approval: {
      approvedAt: new Date().toISOString(),
      approvedByUserId,
    },
  };

  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_AI_METADATA_LENGTH) {
    throw new Error("aiMetadata is too large");
  }

  const source =
    metadata.assistant.sourceType === "receipt-image" ? "ai_receipt_image" : "ai_text_assist";

  return { serialized, source };
}
