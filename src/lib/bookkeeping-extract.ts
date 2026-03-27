import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import {
  BOOKKEEPING_CATEGORY_GUIDANCE,
  buildFallbackTextSuggestion,
  extractOutputText,
  getSuggestedTaxRate,
} from "@/lib/bookkeeping-ai";
import { getOpenAiServerConfig } from "@/lib/env";
import { NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";

export type ExtractedDocumentType = "RECEIPT" | "INVOICE" | "CREDIT_NOTE" | "UNKNOWN";
export type ExtractedSuggestedType = "INCOME" | "EXPENSE";
export type ExtractedVatTreatment = "NONE" | "INPUT" | "OUTPUT" | "EXEMPT";
export type ExtractedWhtTreatment = "NONE" | "PAYABLE" | "RECEIVABLE";

export type BookkeepingExtractionLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
};

export type BookkeepingFieldConfidences = {
  documentType: number;
  vendorName: number;
  documentNumber: number;
  transactionDate: number;
  subtotal: number;
  vatAmount: number;
  whtRelevant: number;
  totalAmount: number;
  currency: number;
  paymentMethod: number;
  lineItems: number;
  suggestedCategory: number;
};

export type BookkeepingExtraction = {
  documentType: ExtractedDocumentType;
  vendorName: string | null;
  documentNumber: string | null;
  amount: number | null;
  subtotal: number | null;
  taxAmount: number | null;
  taxRate: number;
  currency: string;
  transactionDate: string | null;
  description: string;
  suggestedCategory: string | null;
  suggestedType: ExtractedSuggestedType;
  vatTreatment: ExtractedVatTreatment;
  whtTreatment: ExtractedWhtTreatment;
  confidenceScore: number;
  rawText: string | null;
  vatAmount: number | null;
  whtAmount: number | null;
  totalAmount: number | null;
  whtRelevant: boolean | null;
  paymentMethod: string | null;
  lineItems: BookkeepingExtractionLineItem[];
  deductibilityHint: string | null;
  fieldConfidences: BookkeepingFieldConfidences;
  notes: string[];
};

export type ExtractionMetadata = {
  provider: "openai" | "heuristic-fallback" | "unavailable";
  model: string | null;
  warnings: string[];
  fileName: string | null;
  mimeType: string | null;
};

export type BookkeepingExtractionResult = {
  extraction: BookkeepingExtraction;
  metadata: ExtractionMetadata;
  rawResponse: unknown | null;
};

export const SUPPORTED_BOOKKEEPING_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_BOOKKEEPING_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_BOOKKEEPING_PDF_BYTES = 15 * 1024 * 1024;

const CLIENT_BUSINESS_CATEGORY_GUIDANCE =
  "When a category fits, prefer one of these exact names: Revenue, Cost of sales, Operations, Payroll, Rent and utilities, Professional fees, Tax and compliance, Travel and logistics.";

const PDF_PARSE_WORKER_SRC = pathToFileURL(
  path.resolve(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs")
).toString();

const DEFAULT_FIELD_CONFIDENCES: BookkeepingFieldConfidences = {
  documentType: 0.2,
  vendorName: 0.2,
  documentNumber: 0.15,
  transactionDate: 0.2,
  subtotal: 0.15,
  vatAmount: 0.15,
  whtRelevant: 0.15,
  totalAmount: 0.2,
  currency: 0.3,
  paymentMethod: 0.15,
  lineItems: 0.1,
  suggestedCategory: 0.2,
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const exactMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (exactMatch) return raw;

  const ddmmyyyy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeDocumentType(value: unknown): ExtractedDocumentType {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "RECEIPT" || raw === "INVOICE" || raw === "CREDIT_NOTE") return raw;
  return "UNKNOWN";
}

function normalizeSuggestedType(value: unknown): ExtractedSuggestedType {
  return normalizeString(value).toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE";
}

function normalizeVatTreatment(value: unknown): ExtractedVatTreatment {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "INPUT" || raw === "OUTPUT" || raw === "EXEMPT") return raw;
  return "NONE";
}

function normalizeWhtTreatment(value: unknown): ExtractedWhtTreatment {
  const raw = normalizeString(value).toUpperCase();
  if (raw === "PAYABLE" || raw === "RECEIVABLE") return raw;
  return "NONE";
}

function normalizeConfidenceScore(value: unknown) {
  const numberValue = normalizeNumber(value);
  if (numberValue === null) return 0.25;
  if (numberValue > 1) {
    return Math.max(0, Math.min(1, numberValue / 100));
  }
  return Math.max(0, Math.min(1, numberValue));
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const raw = normalizeString(value).toLowerCase();
  if (raw === "true" || raw === "yes") return true;
  if (raw === "false" || raw === "no") return false;
  return null;
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).slice(0, 8);
}

function normalizeLineItems(value: unknown) {
  if (!Array.isArray(value)) return [] as BookkeepingExtractionLineItem[];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const line = entry as Record<string, unknown>;
      const description = normalizeString(line.description);
      if (!description) return null;
      return {
        description,
        quantity: normalizeNumber(line.quantity),
        unitPrice: normalizeNumber(line.unitPrice),
        total: normalizeNumber(line.total),
      } satisfies BookkeepingExtractionLineItem;
    })
    .filter((line): line is BookkeepingExtractionLineItem => Boolean(line))
    .slice(0, 20);
}

function normalizeFieldConfidences(
  value: unknown,
  fallbackScore: number
): BookkeepingFieldConfidences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(DEFAULT_FIELD_CONFIDENCES).map(([key, defaultValue]) => [
        key,
        Math.max(defaultValue, fallbackScore * 0.85),
      ])
    ) as BookkeepingFieldConfidences;
  }

  const record = value as Record<string, unknown>;
  return {
    documentType:
      normalizeConfidenceScore(record.documentType) ?? DEFAULT_FIELD_CONFIDENCES.documentType,
    vendorName:
      normalizeConfidenceScore(record.vendorName) ?? DEFAULT_FIELD_CONFIDENCES.vendorName,
    documentNumber:
      normalizeConfidenceScore(record.documentNumber) ??
      DEFAULT_FIELD_CONFIDENCES.documentNumber,
    transactionDate:
      normalizeConfidenceScore(record.transactionDate) ??
      DEFAULT_FIELD_CONFIDENCES.transactionDate,
    subtotal:
      normalizeConfidenceScore(record.subtotal) ?? DEFAULT_FIELD_CONFIDENCES.subtotal,
    vatAmount:
      normalizeConfidenceScore(record.vatAmount) ?? DEFAULT_FIELD_CONFIDENCES.vatAmount,
    whtRelevant:
      normalizeConfidenceScore(record.whtRelevant) ??
      DEFAULT_FIELD_CONFIDENCES.whtRelevant,
    totalAmount:
      normalizeConfidenceScore(record.totalAmount) ?? DEFAULT_FIELD_CONFIDENCES.totalAmount,
    currency:
      normalizeConfidenceScore(record.currency) ?? DEFAULT_FIELD_CONFIDENCES.currency,
    paymentMethod:
      normalizeConfidenceScore(record.paymentMethod) ??
      DEFAULT_FIELD_CONFIDENCES.paymentMethod,
    lineItems:
      normalizeConfidenceScore(record.lineItems) ?? DEFAULT_FIELD_CONFIDENCES.lineItems,
    suggestedCategory:
      normalizeConfidenceScore(record.suggestedCategory) ??
      DEFAULT_FIELD_CONFIDENCES.suggestedCategory,
  };
}

function mergeNotes(...noteLists: Array<string[] | undefined>) {
  const unique = new Set<string>();
  for (const noteList of noteLists) {
    for (const note of noteList ?? []) {
      const normalized = normalizeString(note);
      if (normalized) unique.add(normalized);
    }
  }
  return Array.from(unique).slice(0, 8);
}

function textIncludes(text: string, patterns: string[]) {
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function inferDocumentType(text: string, fileName?: string | null): ExtractedDocumentType {
  const normalized = `${fileName ?? ""}\n${text}`.toLowerCase();
  if (normalized.includes("credit note") || normalized.includes("credit memo")) {
    return "CREDIT_NOTE";
  }
  if (normalized.includes("invoice")) return "INVOICE";
  if (normalized.includes("receipt")) return "RECEIPT";
  return "UNKNOWN";
}

function extractCurrencyFromText(text: string) {
  const normalized = text.toUpperCase();
  if (normalized.includes("USD") || normalized.includes("$")) return "USD";
  if (normalized.includes("EUR") || normalized.includes("€")) return "EUR";
  if (normalized.includes("GBP") || normalized.includes("£")) return "GBP";
  return "NGN";
}

function extractPaymentMethod(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("bank transfer") || normalized.includes("transfer")) {
    return "BANK_TRANSFER";
  }
  if (normalized.includes("pos")) return "POS";
  if (normalized.includes("debit card") || normalized.includes("credit card") || normalized.includes("card")) {
    return "CARD";
  }
  if (normalized.includes("cash")) return "CASH";
  if (normalized.includes("cheque") || normalized.includes("check")) return "CHEQUE";
  return null;
}

function extractDocumentNumber(text: string, fileName?: string | null) {
  const patterns = [
    /(?:invoice|receipt|credit note|credit memo)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Z0-9/-]{3,})/i,
    /(?:ref(?:erence)?|doc(?:ument)?(?: no\.?)?)\s*[:#-]?\s*([A-Z0-9/-]{3,})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].trim();
  }

  const fileMatch = /([A-Z]{2,}[A-Z0-9-/_]{2,}|\d{4,})/i.exec(fileName ?? "");
  return fileMatch?.[1]?.trim() ?? null;
}

function extractDateFromText(text: string, fallback?: string | null) {
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

  return normalizeDate(fallback);
}

function extractAmountCandidates(text: string) {
  return Array.from(
    text.matchAll(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?/g)
  )
    .map((match) => {
      const raw = match[0];
      const value = Number(raw.replace(/,/g, ""));
      const index = match.index ?? 0;
      const context = text
        .slice(Math.max(0, index - 24), Math.min(text.length, index + raw.length + 24))
        .toLowerCase();

      let score = 0;
      if (/(amount|total|subtotal|paid|payment|balance|vat|tax|sum)/.test(context)) score += 4;
      if (/(ngn|naira|₦|\$|usd|eur|gbp)/.test(context)) score += 3;
      if (raw.includes(",") || raw.includes(".")) score += 1;
      if (value >= 1000) score += 1;
      if (/^20\d{2}$/.test(raw) && /(date|issued|invoice)/.test(context)) score -= 6;

      return { value, raw, score, index, context };
    })
    .filter((candidate) => Number.isFinite(candidate.value));
}

function extractLabeledAmount(text: string, labels: string[]) {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?:${escapedLabels.join("|")})\\s*[:=-]?\\s*(?:NGN|N|₦|USD|EUR|GBP|\\$|€|£)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)`,
    "i"
  );
  const match = pattern.exec(text);
  return match?.[1] ? Number(match[1].replace(/,/g, "")) : null;
}

function extractBestTotal(text: string) {
  const labeled =
    extractLabeledAmount(text, [
      "grand total",
      "total amount",
      "amount paid",
      "total",
      "amount due",
      "net payable",
    ]) ?? null;
  if (labeled !== null) return labeled;

  const candidates = extractAmountCandidates(text);
  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.value !== left.value) return right.value - left.value;
    return left.index - right.index;
  });
  return candidates[0]?.value ?? null;
}

function inferCategoryDeductibility(category: string | null, documentType: ExtractedDocumentType) {
  if (documentType === "CREDIT_NOTE") {
    return "Review this credit note against the original purchase or invoice so prior VAT and expense claims are reversed correctly.";
  }

  if (!category) {
    return "Deduct if the spend was wholly, reasonably, exclusively, and necessarily incurred for business operations.";
  }

  const normalized = category.toLowerCase();
  if (/(rent|utilities|transport|software|office|professional|operations|travel)/.test(normalized)) {
    return "Usually deductible as an operating expense when the document supports a genuine business cost.";
  }
  if (/(tax|compliance)/.test(normalized)) {
    return "Usually deductible subject to local rules and whether the charge is a business compliance cost.";
  }

  return "Confirm business purpose and supporting evidence before treating this as deductible.";
}

function mapSuggestionToTreatments(
  suggestedType: ExtractedSuggestedType,
  vatRelevant: boolean,
  whtRelevant: boolean
) {
  const vatTreatment: ExtractedVatTreatment = vatRelevant
    ? suggestedType === "INCOME"
      ? "OUTPUT"
      : "INPUT"
    : "NONE";
  const whtTreatment: ExtractedWhtTreatment = whtRelevant
    ? suggestedType === "INCOME"
      ? "RECEIVABLE"
      : "PAYABLE"
    : "NONE";

  return {
    vatTreatment,
    whtTreatment,
  };
}

function extractLineItemsFromText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 6 && /[0-9]/.test(line))
    .map((line) => {
      const total = extractBestTotal(line);
      const description = line.replace(/[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?/g, "").trim();
      if (!description || total === null) return null;
      const item: BookkeepingExtractionLineItem = {
        description: description.replace(/\s{2,}/g, " "),
        quantity: null,
        unitPrice: null,
        total,
      };
      return item;
    })
    .filter((line): line is BookkeepingExtractionLineItem => line !== null)
    .slice(0, 8);
}

export function buildFallbackBookkeepingExtraction(
  text: string,
  options?: {
    fileName?: string | null;
    rawText?: string | null;
    warnings?: string[];
    fallbackDate?: string | null;
  }
): BookkeepingExtraction {
  const suggestion = buildFallbackTextSuggestion(text);
  const suggestedType: ExtractedSuggestedType = suggestion.classification;
  const documentType = inferDocumentType(text, options?.fileName);
  const vendorName = suggestion.vendorName ?? normalizeNullableString(options?.fileName) ?? null;
  const totalAmount = extractBestTotal(text) ?? suggestion.amount;
  const vatAmount =
    extractLabeledAmount(text, ["vat", "value added tax"]) ??
    (textIncludes(text, ["vat"]) ? (totalAmount ?? 0) * (NIGERIA_TAX_CONFIG.vat.standardRate / 100) : null);
  const whtAmount = extractLabeledAmount(text, ["withholding tax", "wht"]);
  const subtotal =
    extractLabeledAmount(text, ["subtotal", "sub total"]) ??
    (totalAmount !== null && vatAmount !== null ? Math.max(totalAmount - vatAmount, 0) : null);
  const whtRelevant = textIncludes(text, ["withholding", "wht"]) ? true : null;
  const taxRate = getSuggestedTaxRate(suggestion);
  const { vatTreatment, whtTreatment } = mapSuggestionToTreatments(
    suggestedType,
    (vatAmount ?? 0) > 0 || suggestion.vat.relevance !== "NOT_RELEVANT",
    (whtAmount ?? 0) > 0 || suggestion.wht.relevance !== "NOT_RELEVANT"
  );
  const confidenceScore =
    suggestion.confidence === "HIGH" ? 0.86 : suggestion.confidence === "MEDIUM" ? 0.62 : 0.32;

  return {
    documentType,
    vendorName,
    documentNumber: extractDocumentNumber(text, options?.fileName),
    amount: totalAmount,
    subtotal,
    taxAmount:
      vatAmount !== null || whtAmount !== null
        ? [vatAmount ?? 0, whtAmount ?? 0].reduce((sum, value) => sum + value, 0)
        : null,
    taxRate,
    currency: suggestion.currency || extractCurrencyFromText(text),
    transactionDate: extractDateFromText(text, options?.fallbackDate ?? null) ?? suggestion.transactionDate,
    description: suggestion.description || vendorName || "Business transaction",
    suggestedCategory: suggestion.suggestedCategory,
    suggestedType,
    vatTreatment,
    whtTreatment,
    confidenceScore,
    rawText: options?.rawText ?? text,
    vatAmount,
    whtAmount,
    totalAmount,
    whtRelevant,
    paymentMethod: extractPaymentMethod(text),
    lineItems: extractLineItemsFromText(text),
    deductibilityHint: inferCategoryDeductibility(suggestion.suggestedCategory, documentType),
    fieldConfidences: {
      documentType: documentType === "UNKNOWN" ? 0.35 : 0.72,
      vendorName: vendorName ? 0.62 : 0.18,
      documentNumber: extractDocumentNumber(text, options?.fileName) ? 0.7 : 0.18,
      transactionDate: extractDateFromText(text, options?.fallbackDate ?? null) ? 0.68 : 0.2,
      subtotal: subtotal !== null ? 0.58 : 0.15,
      vatAmount: vatAmount !== null ? 0.64 : 0.12,
      whtRelevant: whtRelevant !== null ? 0.56 : 0.1,
      totalAmount: totalAmount !== null ? 0.72 : 0.18,
      currency: 0.78,
      paymentMethod: extractPaymentMethod(text) ? 0.55 : 0.15,
      lineItems: extractLineItemsFromText(text).length > 0 ? 0.46 : 0.12,
      suggestedCategory: suggestion.suggestedCategory ? 0.58 : 0.18,
    },
    notes: mergeNotes(
      suggestion.notes,
      options?.warnings,
      [
        "Fallback extraction used heuristics from parsed text and filename. Review all amounts before posting.",
      ]
    ),
  };
}

export function buildImageMetadataFallbackExtraction(options: {
  fileName?: string | null;
  mimeType?: string | null;
  lastModified?: number | null;
  warnings?: string[];
}) {
  const fileName = normalizeNullableString(options.fileName) ?? "uploaded-document";
  const description = fileName
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const transactionDate =
    extractDateFromText(description, options.lastModified ? new Date(options.lastModified).toISOString() : null) ??
    null;
  const documentType = inferDocumentType("", fileName);
  const vendorName = description
    .replace(/\b(receipt|invoice|credit note|credit memo|scan|upload)\b/gi, "")
    .replace(/[0-9/_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const paymentMethod = extractPaymentMethod(description);

  return {
    documentType,
    vendorName: vendorName || null,
    documentNumber: extractDocumentNumber("", fileName),
    amount: null,
    subtotal: null,
    taxAmount: null,
    taxRate: 0,
    currency: "NGN",
    transactionDate,
    description: description || "Uploaded receipt or invoice image",
    suggestedCategory: null,
    suggestedType: "EXPENSE" as const,
    vatTreatment: "NONE" as const,
    whtTreatment: "NONE" as const,
    confidenceScore: 0.16,
    rawText: null,
    vatAmount: null,
    whtAmount: null,
    totalAmount: null,
    whtRelevant: null,
    paymentMethod,
    lineItems: [],
    deductibilityHint:
      "OCR is unavailable in this environment. Review the document manually before approving any posting.",
    fieldConfidences: {
      documentType: documentType === "UNKNOWN" ? 0.3 : 0.48,
      vendorName: vendorName ? 0.26 : 0.08,
      documentNumber: extractDocumentNumber("", fileName) ? 0.2 : 0.05,
      transactionDate: transactionDate ? 0.22 : 0.05,
      subtotal: 0.03,
      vatAmount: 0.03,
      whtRelevant: 0.03,
      totalAmount: 0.03,
      currency: 0.3,
      paymentMethod: paymentMethod ? 0.18 : 0.04,
      lineItems: 0.01,
      suggestedCategory: 0.04,
    },
    notes: mergeNotes(options.warnings, [
      "OPENAI vision extraction is unavailable. The draft was created from file metadata only.",
      "Upload a text PDF or enable OPENAI_API_KEY for richer extraction from images.",
    ]),
  } satisfies BookkeepingExtraction;
}

export function normalizeBookkeepingExtraction(
  input: unknown,
  fallback: {
    fileName?: string | null;
    rawText?: string | null;
    fallbackDate?: string | null;
  }
): BookkeepingExtraction {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const confidenceScore = normalizeConfidenceScore(value.confidenceScore);
  const rawText = normalizeString(value.rawText) || fallback.rawText || null;
  const documentType =
    normalizeString(value.documentType) === ""
      ? inferDocumentType(rawText ?? "", fallback.fileName)
      : normalizeDocumentType(value.documentType);
  const suggestedType = normalizeSuggestedType(value.suggestedType);
  const totalAmount = normalizeNumber(value.totalAmount) ?? normalizeNumber(value.amount);
  const vatAmount = normalizeNumber(value.vatAmount);
  const whtAmount = normalizeNumber(value.whtAmount);
  const whtRelevant = normalizeBoolean(value.whtRelevant);
  const computedTaxAmount =
    normalizeNumber(value.taxAmount) ??
    (vatAmount !== null || whtAmount !== null ? (vatAmount ?? 0) + (whtAmount ?? 0) : null);
  const { vatTreatment: inferredVatTreatment, whtTreatment: inferredWhtTreatment } =
    mapSuggestionToTreatments(
      suggestedType,
      (vatAmount ?? 0) > 0,
      whtRelevant === true || (whtAmount ?? 0) > 0
    );
  const vatTreatment = normalizeVatTreatment(value.vatTreatment);
  const whtTreatment = normalizeWhtTreatment(value.whtTreatment);
  const suggestedCategory = normalizeNullableString(value.suggestedCategory);

  return {
    documentType,
    vendorName: normalizeNullableString(value.vendorName),
    documentNumber: normalizeNullableString(value.documentNumber),
    amount: totalAmount,
    subtotal: normalizeNumber(value.subtotal),
    taxAmount: computedTaxAmount,
    taxRate: Math.max(0, normalizeNumber(value.taxRate) ?? 0),
    currency: normalizeString(value.currency).toUpperCase() || "NGN",
    transactionDate: normalizeDate(value.transactionDate) ?? normalizeDate(fallback.fallbackDate),
    description:
      normalizeString(value.description) ||
      normalizeNullableString(value.vendorName) ||
      "Business transaction",
    suggestedCategory,
    suggestedType,
    vatTreatment: vatTreatment === "NONE" && (vatAmount ?? 0) > 0 ? inferredVatTreatment : vatTreatment,
    whtTreatment:
      whtTreatment === "NONE" && ((whtAmount ?? 0) > 0 || whtRelevant === true)
        ? inferredWhtTreatment
        : whtTreatment,
    confidenceScore,
    rawText,
    vatAmount,
    whtAmount,
    totalAmount,
    whtRelevant,
    paymentMethod: normalizeNullableString(value.paymentMethod),
    lineItems: normalizeLineItems(value.lineItems),
    deductibilityHint:
      normalizeNullableString(value.deductibilityHint) ??
      inferCategoryDeductibility(suggestedCategory, documentType),
    fieldConfidences: normalizeFieldConfidences(value.fieldConfidences, confidenceScore),
    notes: normalizeNotes(value.notes),
  };
}

async function requestOpenAiExtraction(requestBody: unknown) {
  const { apiKey } = getOpenAiServerConfig();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? "AI request failed");
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error("AI response missing output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  return {
    rawResponse: data,
    parsed,
  };
}

function buildExtractionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      documentType: {
        type: "string",
        enum: ["RECEIPT", "INVOICE", "CREDIT_NOTE", "UNKNOWN"],
      },
      vendorName: { type: ["string", "null"] },
      documentNumber: { type: ["string", "null"] },
      subtotal: { type: ["number", "null"] },
      amount: { type: ["number", "null"] },
      totalAmount: { type: ["number", "null"] },
      taxAmount: { type: ["number", "null"] },
      taxRate: { type: "number" },
      currency: { type: "string" },
      transactionDate: { type: ["string", "null"] },
      description: { type: "string" },
      suggestedCategory: { type: ["string", "null"] },
      suggestedType: {
        type: "string",
        enum: ["INCOME", "EXPENSE"],
      },
      vatTreatment: {
        type: "string",
        enum: ["NONE", "INPUT", "OUTPUT", "EXEMPT"],
      },
      whtTreatment: {
        type: "string",
        enum: ["NONE", "PAYABLE", "RECEIVABLE"],
      },
      confidenceScore: { type: "number" },
      rawText: { type: ["string", "null"] },
      vatAmount: { type: ["number", "null"] },
      whtAmount: { type: ["number", "null"] },
      whtRelevant: { type: ["boolean", "null"] },
      paymentMethod: { type: ["string", "null"] },
      lineItems: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            quantity: { type: ["number", "null"] },
            unitPrice: { type: ["number", "null"] },
            total: { type: ["number", "null"] },
          },
          required: ["description", "quantity", "unitPrice", "total"],
        },
      },
      deductibilityHint: { type: ["string", "null"] },
      fieldConfidences: {
        type: "object",
        additionalProperties: false,
        properties: {
          documentType: { type: "number" },
          vendorName: { type: "number" },
          documentNumber: { type: "number" },
          transactionDate: { type: "number" },
          subtotal: { type: "number" },
          vatAmount: { type: "number" },
          whtRelevant: { type: "number" },
          totalAmount: { type: "number" },
          currency: { type: "number" },
          paymentMethod: { type: "number" },
          lineItems: { type: "number" },
          suggestedCategory: { type: "number" },
        },
        required: [
          "documentType",
          "vendorName",
          "documentNumber",
          "transactionDate",
          "subtotal",
          "vatAmount",
          "whtRelevant",
          "totalAmount",
          "currency",
          "paymentMethod",
          "lineItems",
          "suggestedCategory",
        ],
      },
      notes: {
        type: "array",
        items: { type: "string" },
        maxItems: 8,
      },
    },
    required: [
      "documentType",
      "vendorName",
      "documentNumber",
      "subtotal",
      "amount",
      "totalAmount",
      "taxAmount",
      "taxRate",
      "currency",
      "transactionDate",
      "description",
      "suggestedCategory",
      "suggestedType",
      "vatTreatment",
      "whtTreatment",
      "confidenceScore",
      "rawText",
      "vatAmount",
      "whtAmount",
      "whtRelevant",
      "paymentMethod",
      "lineItems",
      "deductibilityHint",
      "fieldConfidences",
      "notes",
    ],
  };
}

function buildBaseInstructions() {
  return (
    "You are TaxBook AI, a document extraction assistant for Nigerian accountants. " +
    "Return exactly one conservative structured extraction from the supplied receipt, invoice, or credit note. " +
    "Do not invent fields. If a field is not visible, return null. " +
    "Default currency to NGN when it is missing. " +
    `Use ${NIGERIA_TAX_CONFIG.vat.standardRate}% as the VAT rate only when VAT is explicit or strongly implied. ` +
    `Use ${NIGERIA_TAX_CONFIG.wht.heuristicDefaultRate}% as the WHT rate only when withholding is explicit. ` +
    "Distinguish RECEIPT, INVOICE, CREDIT_NOTE, and UNKNOWN carefully. " +
    "For expense documents, VAT usually maps to INPUT and WHT usually maps to PAYABLE. " +
    "For income documents, VAT usually maps to OUTPUT and WHT usually maps to RECEIVABLE. " +
    `${BOOKKEEPING_CATEGORY_GUIDANCE} ${CLIENT_BUSINESS_CATEGORY_GUIDANCE} ` +
    "Set confidenceScore and every fieldConfidences value between 0 and 1. " +
    "Line items should only be returned when they are visible enough to trust. " +
    "Populate rawText with the best OCR or parsed text available."
  );
}

export async function extractBookkeepingFromImage(options: {
  dataUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<BookkeepingExtractionResult> {
  const { visionModel: model } = getOpenAiServerConfig();
  const prompt =
    `${buildBaseInstructions()} ` +
    "The document is an uploaded image. Extract document number, totals, VAT/WHT, payment method, and line items when visible.";

  const { parsed, rawResponse } = await requestOpenAiExtraction({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: options.dataUrl },
        ],
      },
    ],
    temperature: 0.1,
    text: {
      format: {
        type: "json_schema",
        name: "bookkeeping_extract_image_v2",
        strict: true,
        schema: buildExtractionSchema(),
      },
    },
  });

  return {
    extraction: normalizeBookkeepingExtraction(parsed, {
      fileName: options.fileName,
      rawText: null,
    }),
    metadata: {
      provider: "openai",
      model,
      warnings: [],
      fileName: options.fileName ?? null,
      mimeType: options.mimeType ?? null,
    },
    rawResponse,
  };
}

export async function extractBookkeepingFromText(options: {
  text: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<BookkeepingExtractionResult> {
  const { model } = getOpenAiServerConfig();
  const prompt =
    `${buildBaseInstructions()} ` +
    "The document text came from a parsed PDF or OCR pass. Infer the document type from the text and stay conservative." +
    `\n\nDocument text:\n${options.text}`;

  const { parsed, rawResponse } = await requestOpenAiExtraction({
    model,
    input: prompt,
    temperature: 0.1,
    text: {
      format: {
        type: "json_schema",
        name: "bookkeeping_extract_text_v2",
        strict: true,
        schema: buildExtractionSchema(),
      },
    },
  });

  return {
    extraction: normalizeBookkeepingExtraction(parsed, {
      fileName: options.fileName,
      rawText: options.text,
    }),
    metadata: {
      provider: "openai",
      model,
      warnings: [],
      fileName: options.fileName ?? null,
      mimeType: options.mimeType ?? null,
    },
    rawResponse,
  };
}

export async function extractPdfText(buffer: Buffer) {
  PDFParse.setWorker(PDF_PARSE_WORKER_SRC);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text.trim() || null;
  } finally {
    await parser.destroy();
  }
}

export function deriveUploadSourceType(documentType: ExtractedDocumentType) {
  if (documentType === "RECEIPT") return "RECEIPT" as const;
  if (documentType === "INVOICE") return "INVOICE" as const;
  if (documentType === "CREDIT_NOTE") return "CREDIT_NOTE" as const;
  return "OTHER" as const;
}

export function deriveLedgerDirection(suggestedType: ExtractedSuggestedType) {
  return suggestedType === "INCOME" ? "MONEY_IN" : "MONEY_OUT";
}

export function toMinorUnits(amount: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function buildStoredDraftAmounts(extraction: BookkeepingExtraction) {
  const totalAmount = extraction.totalAmount ?? extraction.amount;
  const computedTaxAmount =
    extraction.taxAmount ??
    (extraction.vatAmount !== null || extraction.whtAmount !== null
      ? (extraction.vatAmount ?? 0) + (extraction.whtAmount ?? 0)
      : null);
  const explicitVatAmountMinor = toMinorUnits(extraction.vatAmount);
  const explicitWhtAmountMinor = toMinorUnits(extraction.whtAmount);
  const taxAmountMinor = toMinorUnits(computedTaxAmount);

  return {
    subtotalMinor: toMinorUnits(extraction.subtotal),
    amountMinor: toMinorUnits(totalAmount),
    totalAmountMinor: toMinorUnits(totalAmount),
    taxAmountMinor,
    vatAmountMinor:
      explicitVatAmountMinor ??
      (extraction.vatTreatment !== "NONE" && extraction.whtTreatment === "NONE"
        ? taxAmountMinor ?? 0
        : 0),
    whtAmountMinor:
      explicitWhtAmountMinor ??
      (extraction.whtTreatment !== "NONE" && extraction.vatTreatment === "NONE"
        ? taxAmountMinor ?? 0
        : 0),
  };
}
