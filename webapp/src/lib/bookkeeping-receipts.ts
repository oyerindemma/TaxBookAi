import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  BookkeepingExtraction,
  BookkeepingFieldConfidences,
  BookkeepingExtractionLineItem,
  ExtractionMetadata,
  ExtractedDocumentType,
  ExtractedSuggestedType,
  ExtractedVatTreatment,
  ExtractedWhtTreatment,
} from "@/lib/bookkeeping-extract";

export type DuplicateDetectionResult = {
  duplicateOfUploadId: number | null;
  confidence: number | null;
  reason: string | null;
  duplicateUpload:
    | {
        id: number;
        fileName: string;
        createdAt: string;
        status: string;
        clientBusinessName: string;
      }
    | null;
};

export type HistorySuggestionResult = {
  vendorId: number | null;
  vendorName: string | null;
  categoryId: number | null;
  suggestedCategoryName: string | null;
  vatTreatment: ExtractedVatTreatment;
  whtTreatment: ExtractedWhtTreatment;
  deductibilityHint: string | null;
  notes: string[];
  vendorConfidence: number;
  categoryConfidence: number;
  historyStrength: "NONE" | "WEAK" | "MEDIUM" | "STRONG";
  supportingMatchCount: number;
  historyOverrideApplied: boolean;
  aiHistoryMismatch: boolean;
  amountAnomaly: {
    flagged: boolean;
    severity: "HIGH" | "MEDIUM" | "LOW" | null;
    reason: string | null;
    baselineAmountMinor: number | null;
  };
};

export type BookkeepingReviewSignal = {
  code:
    | "POSSIBLE_DUPLICATE"
    | "LOW_CONFIDENCE"
    | "AI_HISTORY_MISMATCH"
    | "MISSING_VENDOR"
    | "MISSING_DATE"
    | "MISSING_AMOUNT"
    | "CATEGORY_UNRESOLVED"
    | "UNUSUAL_AMOUNT"
    | "FALLBACK_EXTRACTION";
  severity: "HIGH" | "MEDIUM" | "LOW";
  label: string;
  detail: string;
};

export type ReceiptLearningCorrection = {
  capturedAt: string;
  action: "save" | "approve";
  vendorName: string | null;
  originalSuggestedCategoryName: string | null;
  finalCategoryId: number | null;
  finalCategoryName: string | null;
  corrected: boolean;
};

export type ReceiptLearningFeedback = {
  originalVendorName: string | null;
  originalSuggestedCategoryName: string | null;
  latestCorrection: ReceiptLearningCorrection | null;
  corrections: ReceiptLearningCorrection[];
};

export type ReceiptScannerPayload = {
  version: 2 | 3;
  extraction: BookkeepingExtraction;
  metadata: ExtractionMetadata;
  historySuggestion: HistorySuggestionResult;
  duplicateDetection: DuplicateDetectionResult;
  reviewSignals: BookkeepingReviewSignal[];
  learningFeedback?: ReceiptLearningFeedback | null;
  rawResponse: unknown | null;
};

export function safeJsonParse<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined) {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function similarity(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / new Set([...leftTokens, ...rightTokens]).size;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

function tokenOverlapScore(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  return overlap / new Set([...leftTokens, ...rightTokens]).size;
}

function classifyHistoryStrength(weight: number, count: number) {
  if (count <= 0 || weight <= 0) return "NONE" as const;
  if (count >= 3 && weight >= 4) return "STRONG" as const;
  if (count >= 2 && weight >= 2.4) return "MEDIUM" as const;
  return "WEAK" as const;
}

function buildDefaultLearningFeedback(input: {
  vendorName: string | null;
  suggestedCategoryName: string | null;
}) {
  return {
    originalVendorName: input.vendorName,
    originalSuggestedCategoryName: input.suggestedCategoryName,
    latestCorrection: null,
    corrections: [],
  } satisfies ReceiptLearningFeedback;
}

export function buildReceiptLearningFeedback(input: {
  rawPayload: unknown;
  action: "save" | "approve";
  vendorName: string | null;
  finalCategoryId: number | null;
  finalCategoryName: string | null;
}) {
  const payload = parseReceiptScannerPayload(input.rawPayload);
  if (!payload) {
    return typeof input.rawPayload === "string" ? input.rawPayload : null;
  }

  const learningFeedback =
    payload.learningFeedback ??
    buildDefaultLearningFeedback({
      vendorName: payload.extraction.vendorName ?? payload.historySuggestion.vendorName ?? null,
      suggestedCategoryName: payload.extraction.suggestedCategory ?? null,
    });
  const originalSuggestedCategoryName =
    learningFeedback.originalSuggestedCategoryName ??
    payload.extraction.suggestedCategory ??
    null;
  const finalCategoryName = input.finalCategoryName?.trim() || null;
  const vendorName =
    input.vendorName?.trim() ||
    learningFeedback.originalVendorName ||
    payload.extraction.vendorName ||
    payload.historySuggestion.vendorName ||
    null;

  if (!finalCategoryName && !input.finalCategoryId) {
    return JSON.stringify({
      ...payload,
      version: 3,
      learningFeedback: {
        ...learningFeedback,
        originalVendorName: learningFeedback.originalVendorName ?? vendorName,
      },
    } satisfies ReceiptScannerPayload);
  }

  const correction = {
    capturedAt: new Date().toISOString(),
    action: input.action,
    vendorName,
    originalSuggestedCategoryName,
    finalCategoryId: input.finalCategoryId ?? null,
    finalCategoryName,
    corrected:
      Boolean(finalCategoryName) &&
      normalizeName(finalCategoryName) !== normalizeName(originalSuggestedCategoryName),
  } satisfies ReceiptLearningCorrection;

  const lastCorrection =
    learningFeedback.corrections[learningFeedback.corrections.length - 1] ?? null;
  const unchangedFromLast =
    lastCorrection !== null &&
    lastCorrection.action === correction.action &&
    lastCorrection.vendorName === correction.vendorName &&
    lastCorrection.originalSuggestedCategoryName === correction.originalSuggestedCategoryName &&
    lastCorrection.finalCategoryId === correction.finalCategoryId &&
    lastCorrection.finalCategoryName === correction.finalCategoryName &&
    lastCorrection.corrected === correction.corrected;

  const corrections = unchangedFromLast
    ? learningFeedback.corrections
    : [...learningFeedback.corrections, correction].slice(-12);
  const latestCorrection = unchangedFromLast ? lastCorrection : correction;

  return JSON.stringify({
    ...payload,
    version: 3,
    learningFeedback: {
      originalVendorName: learningFeedback.originalVendorName ?? vendorName,
      originalSuggestedCategoryName,
      latestCorrection,
      corrections,
    },
  } satisfies ReceiptScannerPayload);
}

function sameDayDistance(left: string | null, right: Date | null) {
  if (!left || !right) return null;
  const leftDate = new Date(`${left}T12:00:00.000Z`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(right.getTime())) return null;
  return Math.abs(leftDate.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

function amountSimilarity(leftMinor: number | null, rightMinor: number | null) {
  if (leftMinor === null || rightMinor === null || leftMinor <= 0 || rightMinor <= 0) return 0;
  const delta = Math.abs(leftMinor - rightMinor) / Math.max(leftMinor, rightMinor);
  if (delta === 0) return 1;
  if (delta <= 0.01) return 0.8;
  if (delta <= 0.05) return 0.45;
  return 0;
}

function buildDeductibilityHint(
  categoryName: string | null,
  documentType: ExtractedDocumentType
) {
  if (documentType === "CREDIT_NOTE") {
    return "Review this credit note against the original claim so any expense and VAT treatment is reversed appropriately.";
  }

  if (!categoryName) {
    return "Confirm the spend was wholly business-related and supported before treating it as deductible.";
  }

  const normalized = categoryName.toLowerCase();
  if (/(travel|transport|rent|utilities|software|office|professional|operations)/.test(normalized)) {
    return "Usually deductible when the receipt supports an ordinary business operating cost.";
  }
  if (/(tax|compliance)/.test(normalized)) {
    return "Usually deductible when it relates to business compliance or advisory work, subject to local rules.";
  }

  return "Review the business purpose and evidence before confirming deductibility.";
}

function detectHistoryAmountAnomaly(input: {
  amountMinor: number | null;
  history: Array<number | null>;
  globalHistory: Array<number | null>;
  scopeLabel: string | null;
}) {
  if (!input.amountMinor || input.amountMinor <= 0) {
    return {
      flagged: false,
      severity: null,
      reason: null,
      baselineAmountMinor: null,
    } as const;
  }

  const history = input.history.filter(
    (value): value is number => typeof value === "number" && value > 0
  );
  const globalHistory = input.globalHistory.filter(
    (value): value is number => typeof value === "number" && value > 0
  );
  const scopeSuffix = input.scopeLabel ? ` for ${input.scopeLabel}` : "";

  if (history.length >= 3) {
    const historyAverage = average(history);
    const historyP90 = percentile(history, 0.9);
    const ratio = historyAverage > 0 ? input.amountMinor / historyAverage : 0;

    if (ratio >= 2 && input.amountMinor >= historyP90) {
      return {
        flagged: true,
        severity: ratio >= 3 ? "HIGH" : "MEDIUM",
        reason: `Amount is unusually high${scopeSuffix} compared with recent posted history.`,
        baselineAmountMinor: Math.round(historyAverage),
      } as const;
    }
  }

  if (history.length <= 1 && globalHistory.length >= 6) {
    const globalP90 = percentile(globalHistory, 0.9);
    if (globalP90 > 0 && input.amountMinor >= globalP90 * 1.35) {
      return {
        flagged: true,
        severity: "MEDIUM",
        reason:
          "Amount sits above the normal range for recent posted workspace activity and needs review.",
        baselineAmountMinor: Math.round(globalP90),
      } as const;
    }
  }

  return {
    flagged: false,
    severity: null,
    reason: null,
    baselineAmountMinor: history.length > 0 ? Math.round(average(history)) : null,
  } as const;
}

export async function detectDuplicateBookkeepingUpload(input: {
  workspaceId: number;
  currentUploadId: number;
  clientBusinessId: number;
  fileHash: string | null;
  documentNumber: string | null;
  vendorName: string | null;
  reference: string | null;
  totalAmountMinor: number | null;
  transactionDate: string | null;
}) {
  const normalizedDocumentNumber = normalizeName(input.documentNumber);
  const normalizedVendorName = normalizeName(input.vendorName);
  const normalizedReference = normalizeName(input.reference);

  const candidates = await prisma.bookkeepingUpload.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: { not: input.currentUploadId },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      fileName: true,
      fileHash: true,
      status: true,
      createdAt: true,
      clientBusiness: {
        select: {
          id: true,
          name: true,
        },
      },
      drafts: {
        take: 1,
        orderBy: [{ createdAt: "asc" }],
        select: {
          documentNumber: true,
          vendorName: true,
          reference: true,
          amountMinor: true,
          totalAmountMinor: true,
          proposedDate: true,
        },
      },
    },
  });

  for (const candidate of candidates) {
    if (input.fileHash && candidate.fileHash && input.fileHash === candidate.fileHash) {
      return {
        duplicateOfUploadId: candidate.id,
        confidence: 0.99,
        reason: "Exact file hash match with an earlier upload in this workspace.",
        duplicateUpload: {
          id: candidate.id,
          fileName: candidate.fileName,
          createdAt: candidate.createdAt.toISOString(),
          status: candidate.status,
          clientBusinessName: candidate.clientBusiness.name,
        },
      } satisfies DuplicateDetectionResult;
    }
  }

  let bestMatch: DuplicateDetectionResult | null = null;

  for (const candidate of candidates) {
    const draft = candidate.drafts[0];
    if (!draft) continue;

    let score = 0;
    const reasons: string[] = [];
    const candidateDocumentNumber = normalizeName(draft.documentNumber);
    const candidateVendorName = normalizeName(draft.vendorName);
    const candidateReference = normalizeName(draft.reference);
    const candidateAmount = draft.totalAmountMinor ?? draft.amountMinor ?? null;

    if (normalizedDocumentNumber && candidateDocumentNumber === normalizedDocumentNumber) {
      score += 0.45;
      reasons.push("same document number");
    }
    if (normalizedVendorName && candidateVendorName === normalizedVendorName) {
      score += 0.2;
      reasons.push("same vendor");
    }
    if (normalizedReference && candidateReference === normalizedReference) {
      score += 0.18;
      reasons.push("same reference");
    }

    const amountScore = amountSimilarity(input.totalAmountMinor, candidateAmount);
    if (amountScore >= 0.8) {
      score += 0.22;
      reasons.push("same amount");
    } else if (amountScore > 0) {
      score += 0.12;
      reasons.push("very similar amount");
    }

    const dateDistance = sameDayDistance(input.transactionDate, draft.proposedDate);
    if (dateDistance !== null && dateDistance <= 1) {
      score += 0.12;
      reasons.push("same date");
    } else if (dateDistance !== null && dateDistance <= 7) {
      score += 0.06;
      reasons.push("close transaction date");
    }

    if (candidate.clientBusiness.id === input.clientBusinessId) {
      score += 0.02;
    }

    if (!bestMatch || (bestMatch.confidence ?? 0) < score) {
      bestMatch = {
        duplicateOfUploadId: score >= 0.62 ? candidate.id : null,
        confidence: score,
        reason:
          score >= 0.62
            ? `Likely duplicate: ${reasons.join(", ")}.`
            : null,
        duplicateUpload:
          score >= 0.62
            ? {
                id: candidate.id,
                fileName: candidate.fileName,
                createdAt: candidate.createdAt.toISOString(),
                status: candidate.status,
                clientBusinessName: candidate.clientBusiness.name,
              }
            : null,
      };
    }
  }

  return bestMatch ?? {
    duplicateOfUploadId: null,
    confidence: null,
    reason: null,
    duplicateUpload: null,
  };
}

export async function buildWorkspaceHistorySuggestion(input: {
  clientBusinessId: number;
  vendorName: string | null;
  description: string;
  reference: string | null;
  suggestedCategoryName: string | null;
  amountMinor: number | null;
  transactionDate: string | null;
  suggestedType: ExtractedSuggestedType;
  documentType: ExtractedDocumentType;
  vatTreatment: ExtractedVatTreatment;
  whtTreatment: ExtractedWhtTreatment;
}) {
  const [vendors, categories, recentTransactions, approvedDrafts] = await Promise.all([
    prisma.vendor.findMany({
      where: { clientBusinessId: input.clientBusinessId },
      select: { id: true, name: true },
    }),
    prisma.transactionCategory.findMany({
      where: { clientBusinessId: input.clientBusinessId },
      select: { id: true, name: true },
    }),
    prisma.ledgerTransaction.findMany({
      where: { clientBusinessId: input.clientBusinessId },
      orderBy: [{ transactionDate: "desc" }],
      take: 80,
      select: {
        vendorId: true,
        categoryId: true,
        description: true,
        reference: true,
        amountMinor: true,
        transactionDate: true,
        vatTreatment: true,
        whtTreatment: true,
        vendor: {
          select: {
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.bookkeepingDraft.findMany({
      where: {
        reviewStatus: "APPROVED",
        upload: {
          clientBusinessId: input.clientBusinessId,
        },
      },
      orderBy: [{ approvedAt: "desc" }],
      take: 80,
      select: {
        vendorId: true,
        vendorName: true,
        categoryId: true,
        suggestedCategoryName: true,
        description: true,
        reference: true,
        amountMinor: true,
        totalAmountMinor: true,
        proposedDate: true,
        vatTreatment: true,
        whtTreatment: true,
        aiPayload: true,
        vendor: {
          select: {
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const normalizedVendorName = normalizeName(input.vendorName);
  const normalizedSuggestedCategory = normalizeName(input.suggestedCategoryName);
  const exactVendor = vendors.find((vendor) => normalizeName(vendor.name) === normalizedVendorName) ?? null;
  const exactCategory =
    categories.find((category) => normalizeName(category.name) === normalizedSuggestedCategory) ?? null;
  const fuzzyCategory =
    exactCategory ??
    categories
      .map((category) => ({
        category,
        score: Math.max(
          tokenOverlapScore(input.suggestedCategoryName, category.name),
          tokenOverlapScore(input.description, category.name) * 0.6
        ),
      }))
      .filter((candidate) => candidate.score >= 0.45)
      .sort(
        (left, right) =>
          right.score - left.score || left.category.name.localeCompare(right.category.name)
      )[0]?.category ??
    null;

  const historyCandidates = [
    ...approvedDrafts.map((draft) => {
      const learningFeedback = parseReceiptScannerPayload(draft.aiPayload)?.learningFeedback ?? null;
      return {
        learningFeedback,
        source: "approved-draft" as const,
        vendorId: draft.vendorId,
        vendorName: draft.vendorName ?? draft.vendor?.name ?? null,
        categoryId: draft.categoryId,
        categoryName: draft.category?.name ?? draft.suggestedCategoryName ?? null,
        description: draft.description ?? "",
        reference: draft.reference ?? null,
        amountMinor: draft.totalAmountMinor ?? draft.amountMinor ?? null,
        transactionDate: draft.proposedDate ?? null,
        vatTreatment: draft.vatTreatment,
        whtTreatment: draft.whtTreatment,
        supportWeight:
          (learningFeedback?.latestCorrection?.corrected ? 1.85 : 1.4) +
          Math.min(
            0.25,
            Math.max(0, (learningFeedback?.corrections.length ?? 0) - 1) * 0.08
          ),
      };
    }),
    ...recentTransactions.map((transaction) => ({
      learningFeedback: null,
      source: "ledger" as const,
      vendorId: transaction.vendorId,
      vendorName: transaction.vendor?.name ?? null,
      categoryId: transaction.categoryId,
      categoryName: transaction.category?.name ?? null,
      description: transaction.description,
      reference: transaction.reference ?? null,
      amountMinor: transaction.amountMinor,
      transactionDate: transaction.transactionDate,
      vatTreatment: transaction.vatTreatment,
      whtTreatment: transaction.whtTreatment,
      supportWeight: 1,
    })),
  ];

  let bestScore = 0;
  let bestHistoryMatch: (typeof historyCandidates)[number] | null = null;

  for (const transaction of historyCandidates) {
    let score = 0;
    if (normalizedVendorName && normalizeName(transaction.vendorName) === normalizedVendorName) {
      score += 0.42;
    }
    if (
      normalizedSuggestedCategory &&
      normalizeName(transaction.categoryName) === normalizedSuggestedCategory
    ) {
      score += 0.18;
    }
    score += similarity(input.description, transaction.description) * 0.28;
    score += similarity(input.reference, transaction.reference) * 0.12;
    score += amountSimilarity(input.amountMinor, transaction.amountMinor) * 0.12;
    score += Math.min(0.12, (transaction.supportWeight - 1) * 0.08);

    const dateDistance = sameDayDistance(input.transactionDate, transaction.transactionDate);
    if (dateDistance !== null && dateDistance <= 7) {
      score += 0.08;
    }

    if (score > bestScore) {
      bestScore = score;
      bestHistoryMatch = transaction;
    }
  }

  const notes: string[] = [];
  const vendorId = exactVendor?.id ?? bestHistoryMatch?.vendorId ?? null;
  let vendorName = exactVendor?.name ?? bestHistoryMatch?.vendorName ?? input.vendorName ?? null;
  const vendorHistoryTransactions = normalizedVendorName
    ? historyCandidates.filter(
        (transaction) => normalizeName(transaction.vendorName) === normalizedVendorName
      )
    : [];
  const vendorPreferredCategory = vendorHistoryTransactions
    .map((transaction) =>
      transaction.categoryId && transaction.categoryName
        ? {
            id: transaction.categoryId,
            name: transaction.categoryName,
            supportWeight: transaction.supportWeight,
          }
        : null
    )
    .filter(
      (
        category
      ): category is {
        id: number;
        name: string;
        supportWeight: number;
      } => Boolean(category)
    )
    .reduce<Map<number, { id: number; name: string; count: number; weight: number }>>(
      (counts, category) => {
        const current = counts.get(category.id) ?? {
          id: category.id,
          name: category.name,
          count: 0,
          weight: 0,
        };
        current.count += 1;
        current.weight += category.supportWeight;
        counts.set(category.id, current);
        return counts;
      },
      new Map()
    );
  const rankedVendorCategories = [...vendorPreferredCategory.values()].sort(
    (left, right) =>
      right.weight - left.weight ||
      right.count - left.count ||
      left.name.localeCompare(right.name)
  );
  const vendorPreferredCategoryEntry = rankedVendorCategories[0] ?? null;
  const vendorPreferredCategoryRunnerUp = rankedVendorCategories[1] ?? null;
  const historyStrength = classifyHistoryStrength(
    vendorPreferredCategoryEntry?.weight ?? 0,
    vendorPreferredCategoryEntry?.count ?? 0
  );
  const strongVendorHistory =
    historyStrength === "STRONG" ||
    (historyStrength === "MEDIUM" &&
      Boolean(
        vendorPreferredCategoryEntry &&
          (!vendorPreferredCategoryRunnerUp ||
            vendorPreferredCategoryEntry.weight >=
              vendorPreferredCategoryRunnerUp.weight + 1.2)
      ));
  const aiHistoryMismatch =
    Boolean(normalizedSuggestedCategory) &&
    Boolean(vendorPreferredCategoryEntry?.name) &&
    strongVendorHistory &&
    normalizeName(vendorPreferredCategoryEntry?.name) !== normalizedSuggestedCategory;
  const preferredHistoricalCategory =
    vendorPreferredCategoryEntry &&
    (strongVendorHistory || vendorHistoryTransactions.length >= 2)
      ? vendorPreferredCategoryEntry
      : null;
  const historyOverrideApplied =
    aiHistoryMismatch &&
    Boolean(preferredHistoricalCategory?.name) &&
    normalizeName(preferredHistoricalCategory?.name) !== normalizedSuggestedCategory;
  const categoryId =
    preferredHistoricalCategory?.id ??
    exactCategory?.id ??
    fuzzyCategory?.id ??
    (vendorPreferredCategoryEntry && vendorHistoryTransactions.length >= 2
      ? vendorPreferredCategoryEntry.id
      : null) ??
    bestHistoryMatch?.categoryId ??
    null;
  let suggestedCategoryName =
    preferredHistoricalCategory?.name ??
    exactCategory?.name ??
    fuzzyCategory?.name ??
    (vendorPreferredCategoryEntry && vendorHistoryTransactions.length >= 2
      ? vendorPreferredCategoryEntry.name
      : null) ??
    bestHistoryMatch?.categoryName ??
    input.suggestedCategoryName ??
    null;

  if (exactVendor) {
    notes.push("Matched the vendor against an existing vendor profile for this business.");
  } else if (bestHistoryMatch?.vendorName && bestScore >= 0.45) {
    notes.push(
      bestHistoryMatch.source === "approved-draft"
        ? "Reused vendor context from approved reviewer history."
        : "Reused vendor context from a similar ledger posting."
    );
  }

  if (exactCategory) {
    notes.push("Matched the suggested category to an existing business category.");
  } else if (fuzzyCategory) {
    notes.push("Matched the suggested category to the closest existing business category.");
  } else if (preferredHistoricalCategory && historyOverrideApplied) {
    notes.push(
      "Overrode the weaker AI category suggestion because reviewer-approved history strongly favors a different category for this vendor."
    );
  } else if (vendorPreferredCategoryEntry && vendorHistoryTransactions.length >= 2) {
    notes.push(
      strongVendorHistory
        ? "Suggested a category from strong reviewer-confirmed vendor history."
        : "Suggested a category from this vendor's recent posted history."
    );
  } else if (bestHistoryMatch?.categoryName && bestScore >= 0.45) {
    notes.push(
      bestHistoryMatch.source === "approved-draft"
        ? "Suggested a category from approved reviewer corrections for similar documents."
        : "Suggested a category from similar prior bookkeeping history."
    );
  }

  let vatTreatment = input.vatTreatment;
  let whtTreatment = input.whtTreatment;

  if (bestHistoryMatch && bestScore >= 0.6) {
    if (vatTreatment === "NONE" && bestHistoryMatch.vatTreatment !== "NONE") {
      vatTreatment = bestHistoryMatch.vatTreatment;
      notes.push(
        bestHistoryMatch.source === "approved-draft"
          ? "VAT treatment was strengthened from approved reviewer history."
          : "VAT treatment was strengthened from similar posted history."
      );
    }
    if (whtTreatment === "NONE" && bestHistoryMatch.whtTreatment !== "NONE") {
      whtTreatment = bestHistoryMatch.whtTreatment;
      notes.push(
        bestHistoryMatch.source === "approved-draft"
          ? "WHT treatment was strengthened from approved reviewer history."
          : "WHT treatment was strengthened from similar posted history."
      );
    }
  }

  if (!vendorId && input.vendorName) {
    vendorName = input.vendorName;
  }
  if (!categoryId && input.suggestedCategoryName) {
    suggestedCategoryName = input.suggestedCategoryName;
  }

  const anomalyHistory =
    vendorHistoryTransactions.length >= 2
      ? vendorHistoryTransactions
      : categoryId
        ? historyCandidates.filter((transaction) => transaction.categoryId === categoryId)
        : [];
  const amountAnomaly = detectHistoryAmountAnomaly({
    amountMinor: input.amountMinor,
    history: anomalyHistory.map((transaction) => transaction.amountMinor),
    globalHistory: historyCandidates.map((transaction) => transaction.amountMinor),
    scopeLabel:
      (vendorName && `vendor ${vendorName}`) ||
      (suggestedCategoryName && `category ${suggestedCategoryName}`) ||
      null,
  });

  if (amountAnomaly.flagged && amountAnomaly.reason) {
    notes.push(amountAnomaly.reason);
  }

  const supportingMatchCount = preferredHistoricalCategory?.count ?? vendorHistoryTransactions.length;
  const boostedCategoryConfidence =
    preferredHistoricalCategory && strongVendorHistory
      ? clamp(0.84 + Math.min(0.12, (preferredHistoricalCategory.weight - 2.5) * 0.04))
      : exactCategory
        ? 0.9
        : fuzzyCategory
          ? 0.78
          : vendorPreferredCategoryEntry && vendorHistoryTransactions.length >= 2
            ? clamp(0.68 + Math.min(0.12, (vendorPreferredCategoryEntry.weight - 2) * 0.05))
            : bestScore >= 0.45
              ? Math.min(0.84, bestScore)
              : 0.2;

  return {
    vendorId,
    vendorName,
    categoryId,
    suggestedCategoryName,
    vatTreatment,
    whtTreatment,
    deductibilityHint: buildDeductibilityHint(suggestedCategoryName, input.documentType),
    notes,
    vendorConfidence:
      exactVendor
        ? 0.92
        : vendorHistoryTransactions.length >= 3
          ? clamp(0.74 + Math.min(0.16, vendorHistoryTransactions.length * 0.03))
          : bestScore >= 0.45
            ? Math.min(0.88, bestScore)
            : 0.22,
    categoryConfidence: boostedCategoryConfidence,
    historyStrength,
    supportingMatchCount,
    historyOverrideApplied,
    aiHistoryMismatch,
    amountAnomaly,
  } satisfies HistorySuggestionResult;
}

export function buildReceiptReviewSignals(input: {
  extraction: BookkeepingExtraction;
  metadata: ExtractionMetadata;
  historySuggestion: HistorySuggestionResult;
  duplicateDetection: DuplicateDetectionResult;
}) {
  const signals: BookkeepingReviewSignal[] = [];
  const combinedConfidence = Math.max(
    input.extraction.confidenceScore,
    clamp(
      average([
        input.historySuggestion.vendorConfidence,
        input.historySuggestion.categoryConfidence,
      ]) *
        (input.historySuggestion.historyStrength === "STRONG"
          ? 1
          : input.historySuggestion.historyStrength === "MEDIUM"
            ? 0.94
            : 0.88)
    )
  );

  if (
    input.duplicateDetection.duplicateOfUploadId ||
    (input.duplicateDetection.confidence ?? 0) >= 0.62
  ) {
    signals.push({
      code: "POSSIBLE_DUPLICATE",
      severity: "HIGH",
      label: "Possible duplicate",
      detail:
        input.duplicateDetection.reason ??
        "This upload closely matches an earlier document in the same workspace.",
    });
  }

  if (
    input.extraction.totalAmount === null &&
    input.extraction.amount === null
  ) {
    signals.push({
      code: "MISSING_AMOUNT",
      severity: "HIGH",
      label: "Amount missing",
      detail: "No reliable amount was extracted, so the draft needs manual review before posting.",
    });
  }

  if (!input.extraction.transactionDate) {
    signals.push({
      code: "MISSING_DATE",
      severity: "MEDIUM",
      label: "Date missing",
      detail: "The transaction date could not be confirmed from the document.",
    });
  }

  if (!input.extraction.vendorName && !input.historySuggestion.vendorName) {
    signals.push({
      code: "MISSING_VENDOR",
      severity: "MEDIUM",
      label: "Vendor missing",
      detail: "No vendor match was found from the document or prior workspace history.",
    });
  }

  if (
    !input.historySuggestion.categoryId &&
    !input.historySuggestion.suggestedCategoryName &&
    !input.extraction.suggestedCategory
  ) {
    signals.push({
      code: "CATEGORY_UNRESOLVED",
      severity: "MEDIUM",
      label: "Category unresolved",
      detail: "The draft could not be mapped to a confident bookkeeping category yet.",
    });
  }

  if (input.historySuggestion.aiHistoryMismatch) {
    signals.push({
      code: "AI_HISTORY_MISMATCH",
      severity:
        input.historySuggestion.historyStrength === "STRONG" ? "MEDIUM" : "LOW",
      label: "AI differs from history",
      detail: input.historySuggestion.historyOverrideApplied
        ? "Strong reviewer-confirmed history for this vendor disagrees with the original AI category suggestion."
        : "Prior reviewer history and the current AI suggestion point to different categories.",
    });
  }

  if (combinedConfidence < 0.55) {
    signals.push({
      code: "LOW_CONFIDENCE",
      severity: "HIGH",
      label: "Low extraction confidence",
      detail: "AI confidence is low, so key fields should be checked before approval.",
    });
  } else if (
    combinedConfidence < 0.72 &&
    input.historySuggestion.historyStrength !== "STRONG"
  ) {
    signals.push({
      code: "LOW_CONFIDENCE",
      severity: "LOW",
      label: "Review suggested",
      detail:
        "Confidence is moderate and worth a quick review before posting, especially if the category looks off.",
    });
  }

  if (input.historySuggestion.amountAnomaly.flagged && input.historySuggestion.amountAnomaly.reason) {
    signals.push({
      code: "UNUSUAL_AMOUNT",
      severity: input.historySuggestion.amountAnomaly.severity ?? "MEDIUM",
      label: "Unusual amount",
      detail: input.historySuggestion.amountAnomaly.reason,
    });
  }

  if (input.metadata.provider !== "openai" || input.metadata.warnings.length > 0) {
    signals.push({
      code: "FALLBACK_EXTRACTION",
      severity: input.metadata.provider === "unavailable" ? "MEDIUM" : "LOW",
      label: "Fallback extraction path",
      detail:
        input.metadata.warnings[0] ??
        "This draft used a fallback extraction path, so reviewer checks are recommended.",
    });
  }

  return signals.slice(0, 8);
}

export function buildReceiptScannerPayload(input: {
  extraction: BookkeepingExtraction;
  metadata: ExtractionMetadata;
  historySuggestion: HistorySuggestionResult;
  duplicateDetection: DuplicateDetectionResult;
  reviewSignals: BookkeepingReviewSignal[];
  rawResponse: unknown | null;
}) {
  return {
    version: 3,
    extraction: input.extraction,
    metadata: input.metadata,
    historySuggestion: input.historySuggestion,
    duplicateDetection: input.duplicateDetection,
    reviewSignals: input.reviewSignals,
    learningFeedback: buildDefaultLearningFeedback({
      vendorName: input.extraction.vendorName ?? input.historySuggestion.vendorName ?? null,
      suggestedCategoryName: input.extraction.suggestedCategory ?? null,
    }),
    rawResponse: input.rawResponse,
  } satisfies ReceiptScannerPayload;
}

export function parseReceiptScannerPayload(raw: unknown) {
  return safeJsonParse<ReceiptScannerPayload>(raw);
}

export function parseFieldConfidences(raw: unknown) {
  return safeJsonParse<BookkeepingFieldConfidences>(raw);
}

export function parseLineItems(raw: unknown) {
  return safeJsonParse<BookkeepingExtractionLineItem[]>(raw) ?? [];
}
