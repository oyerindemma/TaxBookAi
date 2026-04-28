import "server-only";

import type {
  BankTransactionBookkeepingFeedbackDecision,
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  suggestCategoriesForWorkspaceTransactions,
  writeBankTransactionCategorizationFeedback,
} from "@/lib/bank-transaction-categorization";
import {
  type DuplicateComparableBankTransaction,
  detectPotentialBankTransactionDuplicate,
} from "@/lib/bank-transaction-duplicates";
import { bankTransactionInclude, serializeBankTransaction } from "@/lib/banking";
import { normalizeBankTransactionText } from "@/lib/bank-transaction-normalization";
import { resolveBankTransactionAccountingPostingStatus } from "@/lib/bank-transaction-posting-status";
import { postBankTransactionToFinancialEngineWithExecutor } from "@/lib/accounting/postTransaction";
import { prisma } from "@/lib/prisma";
import { buildSuggestedBankTransactionTaxUpdate } from "@/lib/transaction-tax";

type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

export const AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD = 0.55;
export const AUTO_BOOKKEEPING_DUPLICATE_THRESHOLD = 0.62;
export const AUTO_BOOKKEEPING_SUSPICIOUS_THRESHOLD = 0.56;
export const AUTO_BOOKKEEPING_PROVIDER = "heuristic-auto-bookkeeping-v1";

export const autoBookkeepingTransactionSelect = {
  id: true,
  workspaceId: true,
  clientBusinessId: true,
  bankAccountId: true,
  categoryId: true,
  suggestedCategoryId: true,
  transactionDate: true,
  description: true,
  reference: true,
  amount: true,
  type: true,
  reviewStatus: true,
  suggestedType: true,
  suggestedCounterparty: true,
  suggestedCategoryName: true,
  suggestedNarrationMeaning: true,
  confidenceScore: true,
  categorizationProvider: true,
  suggestionConfidence: true,
  suggestionReason: true,
  suggestedVatTreatment: true,
  suggestedWhtTreatment: true,
  vatTreatment: true,
  whtTreatment: true,
  vatRate: true,
  whtRate: true,
  vatAmountMinor: true,
  whtAmountMinor: true,
  taxTreatmentSource: true,
  normalizedDescription: true,
  normalizedMerchantName: true,
  autoBookkeepingConfidence: true,
  autoBookkeepingReason: true,
  autoBookkeepingProvider: true,
  autoBookkeepingProcessedAt: true,
  postingReadiness: true,
  possibleDuplicateOfTransactionId: true,
  duplicateConfidence: true,
  duplicateReason: true,
  suspiciousPatternScore: true,
  suspiciousPatternReason: true,
  bankAccount: {
    select: {
      clientBusinessId: true,
    },
  },
} satisfies Prisma.BankTransactionSelect;

type AutoBookkeepingTransaction = Prisma.BankTransactionGetPayload<{
  select: typeof autoBookkeepingTransactionSelect;
}>;

type AutoBookkeepingSuggestion = {
  transactionId: number;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  suggestionConfidence: number | null;
  suggestionReason: string | null;
  suggestedVatTreatment: AutoBookkeepingTransaction["suggestedVatTreatment"];
  suggestedWhtTreatment: AutoBookkeepingTransaction["suggestedWhtTreatment"];
  normalizedDescription: string | null;
  normalizedMerchantName: string | null;
  autoBookkeepingConfidence: number | null;
  autoBookkeepingReason: string | null;
  autoBookkeepingProvider: string;
  autoBookkeepingProcessedAt: Date;
  postingReadiness: BankTransactionPostingReadiness;
  possibleDuplicateOfTransactionId: number | null;
  duplicateConfidence: number | null;
  duplicateReason: string | null;
  suspiciousPatternScore: number | null;
  suspiciousPatternReason: string | null;
};

export type BankTransactionBookkeepingFeedbackInput = {
  workspaceId: number;
  transactionId: number;
  actorUserId: number;
  decision: BankTransactionBookkeepingFeedbackDecision;
  suggestedCategoryId?: number | null;
  selectedCategoryId?: number | null;
  suggestedVatTreatment?: AutoBookkeepingTransaction["suggestedVatTreatment"];
  selectedVatTreatment?: AutoBookkeepingTransaction["suggestedVatTreatment"];
  suggestedWhtTreatment?: AutoBookkeepingTransaction["suggestedWhtTreatment"];
  selectedWhtTreatment?: AutoBookkeepingTransaction["suggestedWhtTreatment"];
  suggestedConfidence?: number | null;
  duplicateConfidence?: number | null;
  suspiciousPatternScore?: number | null;
  postingReadiness?: BankTransactionPostingReadiness;
  provider?: string | null;
  reason?: string | null;
  note?: string | null;
};

type DerivedAutoBookkeepingInput = {
  transaction: AutoBookkeepingTransaction;
  effectiveCategoryId?: number | null;
  suggestionConfidence?: number | null;
  suggestionReason?: string | null;
  suggestedVatTreatment?: AutoBookkeepingTransaction["suggestedVatTreatment"];
  suggestedWhtTreatment?: AutoBookkeepingTransaction["suggestedWhtTreatment"];
  effectiveTaxSource?: AutoBookkeepingTransaction["taxTreatmentSource"];
  provider?: string | null;
  processedAt: Date;
  duplicateCandidates: DuplicateComparableBankTransaction[];
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeString(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function toDuplicateComparable(
  transaction: Pick<
    AutoBookkeepingTransaction,
    | "id"
    | "bankAccountId"
    | "transactionDate"
    | "amount"
    | "type"
    | "description"
    | "reference"
    | "normalizedDescription"
    | "normalizedMerchantName"
    | "suggestedCounterparty"
  >
) {
  const normalizedText = normalizeBankTransactionText({
    description: transaction.description,
    reference: transaction.reference,
    suggestedCounterparty: transaction.suggestedCounterparty,
  });

  return {
    id: transaction.id,
    bankAccountId: transaction.bankAccountId,
    transactionDate: transaction.transactionDate,
    amount: transaction.amount,
    type: transaction.type,
    description: transaction.description,
    reference: transaction.reference,
    normalizedDescription:
      transaction.normalizedDescription ?? normalizedText.normalizedDescription,
    normalizedMerchantName:
      transaction.normalizedMerchantName ?? normalizedText.normalizedMerchantName,
  } satisfies DuplicateComparableBankTransaction;
}

function buildTaxSuggestionReason(input: {
  suggestedVatTreatment: AutoBookkeepingTransaction["suggestedVatTreatment"];
  suggestedWhtTreatment: AutoBookkeepingTransaction["suggestedWhtTreatment"];
  taxTreatmentSource: AutoBookkeepingTransaction["taxTreatmentSource"];
}) {
  if (input.taxTreatmentSource === "MANUAL") {
    return "Manual tax treatment is already in place.";
  }
  if (
    input.suggestedVatTreatment !== "NONE" &&
    input.suggestedVatTreatment !== "EXEMPT" &&
    input.suggestedWhtTreatment !== "NONE"
  ) {
    return "Narration signals suggest both VAT and WHT may matter.";
  }
  if (input.suggestedVatTreatment !== "NONE" && input.suggestedVatTreatment !== "EXEMPT") {
    return "Narration signals suggest VAT may apply.";
  }
  if (input.suggestedWhtTreatment !== "NONE") {
    return "Narration signals suggest WHT may apply.";
  }
  if (input.suggestedVatTreatment === "EXEMPT") {
    return "Narration signals point to VAT-exempt treatment.";
  }
  return "No strong VAT or WHT signal was detected.";
}

function detectSuspiciousPattern(input: {
  transaction: AutoBookkeepingTransaction;
  normalizedMerchantName: string | null;
}) {
  const narration = `${input.transaction.description} ${input.transaction.reference ?? ""}`.toLowerCase();
  const absoluteAmount = Math.abs(input.transaction.amount);

  if (/(reversal|chargeback|correction|fraud|failed)/.test(narration)) {
    return {
      score: 0.74,
      reason: "Reversal or exception language appears in the narration.",
    };
  }

  if (
    /(cash withdrawal|cash out|atm|owner|personal|draw)/.test(narration) &&
    input.transaction.type === "DEBIT" &&
    absoluteAmount >= 5_000_000
  ) {
    return {
      score: 0.63,
      reason: "High-value cash or owner-style movement should be reviewed before posting.",
    };
  }

  if (
    absoluteAmount >= 20_000_000 &&
    !input.normalizedMerchantName &&
    input.transaction.type === "DEBIT"
  ) {
    return {
      score: 0.58,
      reason: "Large outgoing value has weak merchant context and should be checked.",
    };
  }

  if (
    absoluteAmount >= 10_000_000 &&
    absoluteAmount % 1_000_000 === 0 &&
    /(transfer|cash|withdrawal)/.test(narration)
  ) {
    return {
      score: 0.52,
      reason: "Round-value transfer pattern stands out and is worth a quick review.",
    };
  }

  return {
    score: null,
    reason: null,
  };
}

function buildAutoBookkeepingConfidence(input: {
  transaction: AutoBookkeepingTransaction;
  effectiveCategoryId: number | null;
  suggestionConfidence: number | null;
  effectiveTaxSource: AutoBookkeepingTransaction["taxTreatmentSource"];
  normalizedMerchantName: string | null;
  duplicateConfidence: number | null;
  suspiciousPatternScore: number | null;
}) {
  const seeds = [
    input.effectiveCategoryId ? 0.9 : null,
    input.suggestionConfidence,
    input.transaction.autoBookkeepingConfidence,
    input.transaction.confidenceScore,
    input.effectiveTaxSource === "MANUAL"
      ? 0.94
      : input.effectiveTaxSource === "SUGGESTED"
        ? 0.8
        : null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  let confidence = average(seeds) ?? 0.36;

  if (input.normalizedMerchantName) {
    confidence += 0.04;
  }
  if (input.effectiveCategoryId) {
    confidence += 0.04;
  }
  if (input.duplicateConfidence) {
    confidence -= input.duplicateConfidence * 0.28;
  }
  if (input.suspiciousPatternScore) {
    confidence -= input.suspiciousPatternScore * 0.2;
  }

  return Number(clamp(confidence, 0.12, 0.98).toFixed(4));
}

function evaluatePostingReadiness(input: {
  reviewStatus: BankTransactionReviewStatus;
  effectiveCategoryId: number | null;
  autoBookkeepingConfidence: number | null;
  duplicateConfidence: number | null;
  suspiciousPatternScore: number | null;
  processedAt: Date | null;
}) {
  if (!input.processedAt || !input.effectiveCategoryId) {
    return "NOT_READY" satisfies BankTransactionPostingReadiness;
  }

  if (
    input.reviewStatus === "FLAGGED" ||
    (input.autoBookkeepingConfidence ?? 0) < AUTO_BOOKKEEPING_LOW_CONFIDENCE_THRESHOLD ||
    (input.duplicateConfidence ?? 0) >= AUTO_BOOKKEEPING_DUPLICATE_THRESHOLD ||
    (input.suspiciousPatternScore ?? 0) >= AUTO_BOOKKEEPING_SUSPICIOUS_THRESHOLD
  ) {
    return "REVIEW_REQUIRED" satisfies BankTransactionPostingReadiness;
  }

  return "READY_TO_POST" satisfies BankTransactionPostingReadiness;
}

function buildDerivedAutoBookkeepingSignals(
  input: DerivedAutoBookkeepingInput
): Omit<
  AutoBookkeepingSuggestion,
  | "transactionId"
  | "suggestedCategoryId"
  | "suggestedCategoryName"
  | "suggestionConfidence"
  | "suggestionReason"
  | "suggestedVatTreatment"
  | "suggestedWhtTreatment"
> {
  const normalizedText = normalizeBankTransactionText({
    description: input.transaction.description,
    reference: input.transaction.reference,
    suggestedCounterparty: input.transaction.suggestedCounterparty,
  });

  const duplicate = detectPotentialBankTransactionDuplicate({
    transaction: toDuplicateComparable(input.transaction),
    candidates: input.duplicateCandidates,
  });

  const suspicious = detectSuspiciousPattern({
    transaction: input.transaction,
    normalizedMerchantName:
      input.transaction.normalizedMerchantName ?? normalizedText.normalizedMerchantName,
  });

  const effectiveCategoryId =
    input.effectiveCategoryId === undefined
      ? input.transaction.categoryId
      : input.effectiveCategoryId;
  const effectiveTaxSource = input.effectiveTaxSource ?? input.transaction.taxTreatmentSource;
  const autoBookkeepingConfidence = buildAutoBookkeepingConfidence({
    transaction: input.transaction,
    effectiveCategoryId,
    suggestionConfidence: input.suggestionConfidence ?? input.transaction.suggestionConfidence,
    effectiveTaxSource,
    normalizedMerchantName:
      input.transaction.normalizedMerchantName ?? normalizedText.normalizedMerchantName,
    duplicateConfidence: duplicate.confidence,
    suspiciousPatternScore: suspicious.score,
  });
  const postingReadiness = evaluatePostingReadiness({
    reviewStatus: input.transaction.reviewStatus,
    effectiveCategoryId,
    autoBookkeepingConfidence,
    duplicateConfidence: duplicate.confidence,
    suspiciousPatternScore: suspicious.score,
    processedAt: input.processedAt,
  });

  const reasons = [
    normalizeString(input.suggestionReason ?? input.transaction.suggestionReason),
    buildTaxSuggestionReason({
      suggestedVatTreatment:
        input.suggestedVatTreatment ?? input.transaction.suggestedVatTreatment,
      suggestedWhtTreatment:
        input.suggestedWhtTreatment ?? input.transaction.suggestedWhtTreatment,
      taxTreatmentSource: effectiveTaxSource,
    }),
    duplicate.reason ?? "",
    suspicious.reason ?? "",
  ].filter(Boolean);

  return {
    normalizedDescription:
      input.transaction.normalizedDescription ?? normalizedText.normalizedDescription,
    normalizedMerchantName:
      input.transaction.normalizedMerchantName ?? normalizedText.normalizedMerchantName,
    autoBookkeepingConfidence,
    autoBookkeepingReason: reasons.slice(0, 4).join("; ") || null,
    autoBookkeepingProvider:
      normalizeString(input.provider) ||
      normalizeString(input.transaction.autoBookkeepingProvider) ||
      normalizeString(input.transaction.categorizationProvider) ||
      AUTO_BOOKKEEPING_PROVIDER,
    autoBookkeepingProcessedAt: input.processedAt,
    postingReadiness,
    possibleDuplicateOfTransactionId: duplicate.possibleDuplicateOfTransactionId,
    duplicateConfidence: duplicate.confidence,
    duplicateReason: duplicate.reason,
    suspiciousPatternScore: suspicious.score,
    suspiciousPatternReason: suspicious.reason,
  };
}

async function loadDuplicateCandidates(
  db: PrismaExecutor,
  workspaceId: number,
  transactions: AutoBookkeepingTransaction[]
) {
  if (transactions.length === 0) {
    return [] as DuplicateComparableBankTransaction[];
  }

  const earliest = transactions.reduce((current, transaction) =>
    transaction.transactionDate < current ? transaction.transactionDate : current
  , transactions[0].transactionDate);
  const latest = transactions.reduce((current, transaction) =>
    transaction.transactionDate > current ? transaction.transactionDate : current
  , transactions[0].transactionDate);
  const excludedIds = transactions.map((transaction) => transaction.id);

  const candidates = await db.bankTransaction.findMany({
    where: {
      workspaceId,
      id: {
        notIn: excludedIds,
      },
      transactionDate: {
        gte: addDays(earliest, -7),
        lte: addDays(latest, 7),
      },
    },
    select: {
      id: true,
      bankAccountId: true,
      transactionDate: true,
      amount: true,
      type: true,
      description: true,
      reference: true,
      normalizedDescription: true,
      normalizedMerchantName: true,
      suggestedCounterparty: true,
    },
    take: 400,
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
  });

  return candidates.map((candidate) => toDuplicateComparable(candidate));
}

async function getAutoBookkeepingTransactionOrThrow(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId,
    },
    select: autoBookkeepingTransactionSelect,
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  return transaction;
}

async function getSerializedTransactionOrThrow(
  db: PrismaExecutor,
  workspaceId: number,
  transactionId: number
) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      workspaceId,
    },
    include: bankTransactionInclude,
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  return serializeBankTransaction(transaction);
}

async function resolveCategoryOrThrow(
  db: PrismaExecutor,
  workspaceId: number,
  transaction: AutoBookkeepingTransaction,
  categoryId: number
) {
  const category = await db.transactionCategory.findFirst({
    where: {
      id: categoryId,
      clientBusiness: {
        workspaceId,
        archivedAt: null,
      },
    },
    select: {
      id: true,
      name: true,
      clientBusinessId: true,
    },
  });

  if (!category) {
    throw new Error("The selected category does not belong to this workspace.");
  }

  const transactionBusinessId = transaction.clientBusinessId ?? transaction.bankAccount.clientBusinessId;
  if (transactionBusinessId && transactionBusinessId !== category.clientBusinessId) {
    throw new Error(
      "The selected category belongs to a different client business than this transaction."
    );
  }

  return category;
}

async function buildAutoBookkeepingSuggestions(
  db: PrismaExecutor,
  workspaceId: number,
  transactions: AutoBookkeepingTransaction[]
) {
  const processedAt = new Date();
  const [categorySuggestions, storedCandidates] = await Promise.all([
    suggestCategoriesForWorkspaceTransactions(db, workspaceId, transactions),
    loadDuplicateCandidates(db, workspaceId, transactions),
  ]);

  const comparisonPool = [
    ...storedCandidates,
    ...transactions.map((transaction) => toDuplicateComparable(transaction)),
  ];
  const categorySuggestionByTransactionId = new Map(
    categorySuggestions.map((suggestion) => [suggestion.transactionId, suggestion])
  );

  return transactions.map((transaction) => {
    const categorySuggestion = categorySuggestionByTransactionId.get(transaction.id);
    const suggestedCategoryId = transaction.categoryId
      ? null
      : categorySuggestion?.suggestedCategoryId ?? null;
    const suggestedCategoryName = transaction.categoryId
      ? null
      : categorySuggestion?.suggestedCategoryName ?? null;
    const suggestionConfidence = transaction.categoryId
      ? null
      : categorySuggestion?.suggestionConfidence ?? null;
    const suggestionReason = transaction.categoryId
      ? null
      : categorySuggestion?.suggestionReason ?? null;
    const suggestedVatTreatment =
      transaction.taxTreatmentSource === "MANUAL"
        ? transaction.vatTreatment
        : transaction.suggestedVatTreatment;
    const suggestedWhtTreatment =
      transaction.taxTreatmentSource === "MANUAL"
        ? transaction.whtTreatment
        : transaction.suggestedWhtTreatment;
    const derived = buildDerivedAutoBookkeepingSignals({
      transaction,
      effectiveCategoryId: transaction.categoryId,
      suggestionConfidence,
      suggestionReason,
      suggestedVatTreatment,
      suggestedWhtTreatment,
      processedAt,
      duplicateCandidates: comparisonPool,
      provider:
        categorySuggestion?.provider ??
        transaction.autoBookkeepingProvider ??
        transaction.categorizationProvider ??
        AUTO_BOOKKEEPING_PROVIDER,
    });

    return {
      transactionId: transaction.id,
      suggestedCategoryId,
      suggestedCategoryName,
      suggestionConfidence,
      suggestionReason,
      suggestedVatTreatment,
      suggestedWhtTreatment,
      ...derived,
    } satisfies AutoBookkeepingSuggestion;
  });
}

function buildSuggestionUpdate(
  suggestion: AutoBookkeepingSuggestion
): Prisma.BankTransactionUncheckedUpdateInput {
  return {
    suggestedCategoryId: suggestion.suggestedCategoryId,
    suggestedCategoryName: suggestion.suggestedCategoryName,
    suggestionConfidence: suggestion.suggestionConfidence,
    suggestionReason: suggestion.suggestionReason,
    suggestedVatTreatment: suggestion.suggestedVatTreatment,
    suggestedWhtTreatment: suggestion.suggestedWhtTreatment,
    normalizedDescription: suggestion.normalizedDescription,
    normalizedMerchantName: suggestion.normalizedMerchantName,
    autoBookkeepingConfidence: suggestion.autoBookkeepingConfidence,
    autoBookkeepingReason: suggestion.autoBookkeepingReason,
    autoBookkeepingProvider: suggestion.autoBookkeepingProvider,
    autoBookkeepingProcessedAt: suggestion.autoBookkeepingProcessedAt,
    postingReadiness: suggestion.postingReadiness,
    possibleDuplicateOfTransactionId: suggestion.possibleDuplicateOfTransactionId,
    duplicateConfidence: suggestion.duplicateConfidence,
    duplicateReason: suggestion.duplicateReason,
    suspiciousPatternScore: suggestion.suspiciousPatternScore,
    suspiciousPatternReason: suggestion.suspiciousPatternReason,
  };
}

export async function writeBankTransactionBookkeepingFeedback(
  db: PrismaExecutor,
  input: BankTransactionBookkeepingFeedbackInput
) {
  await db.bankTransactionBookkeepingFeedback.create({
    data: {
      workspaceId: input.workspaceId,
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      suggestedCategoryId: input.suggestedCategoryId ?? null,
      selectedCategoryId: input.selectedCategoryId ?? null,
      suggestedVatTreatment: input.suggestedVatTreatment ?? "NONE",
      selectedVatTreatment: input.selectedVatTreatment ?? "NONE",
      suggestedWhtTreatment: input.suggestedWhtTreatment ?? "NONE",
      selectedWhtTreatment: input.selectedWhtTreatment ?? "NONE",
      suggestedConfidence: input.suggestedConfidence ?? null,
      duplicateConfidence: input.duplicateConfidence ?? null,
      suspiciousPatternScore: input.suspiciousPatternScore ?? null,
      postingReadiness: input.postingReadiness ?? "NOT_READY",
      decision: input.decision,
      provider: normalizeString(input.provider) || null,
      reason: normalizeString(input.reason) || null,
      note: normalizeString(input.note) || null,
    },
  });
}

export async function refreshWorkspaceBankTransactionAutoBookkeepingSignalsInDb(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    transactionId: number;
  }
) {
  const transaction = await getAutoBookkeepingTransactionOrThrow(
    db,
    input.workspaceId,
    input.transactionId
  );
  const candidates = await loadDuplicateCandidates(db, input.workspaceId, [transaction]);
  const derived = buildDerivedAutoBookkeepingSignals({
    transaction,
    effectiveCategoryId: transaction.categoryId,
    suggestionConfidence: transaction.suggestionConfidence,
    suggestionReason: transaction.suggestionReason,
    suggestedVatTreatment: transaction.suggestedVatTreatment,
    suggestedWhtTreatment: transaction.suggestedWhtTreatment,
    processedAt: transaction.autoBookkeepingProcessedAt ?? new Date(),
    duplicateCandidates: [...candidates, toDuplicateComparable(transaction)],
    provider:
      transaction.autoBookkeepingProvider ??
      transaction.categorizationProvider ??
      AUTO_BOOKKEEPING_PROVIDER,
  });

  await db.bankTransaction.update({
    where: {
      id: transaction.id,
    },
    data: {
      normalizedDescription: derived.normalizedDescription,
      normalizedMerchantName: derived.normalizedMerchantName,
      autoBookkeepingConfidence: derived.autoBookkeepingConfidence,
      autoBookkeepingReason: derived.autoBookkeepingReason,
      autoBookkeepingProvider: derived.autoBookkeepingProvider,
      autoBookkeepingProcessedAt: derived.autoBookkeepingProcessedAt,
      postingReadiness: derived.postingReadiness,
      accountingPostingStatus: resolveBankTransactionAccountingPostingStatus({
        reviewStatus: transaction.reviewStatus,
        postingReadiness: derived.postingReadiness,
      }),
      possibleDuplicateOfTransactionId: derived.possibleDuplicateOfTransactionId,
      duplicateConfidence: derived.duplicateConfidence,
      duplicateReason: derived.duplicateReason,
      suspiciousPatternScore: derived.suspiciousPatternScore,
      suspiciousPatternReason: derived.suspiciousPatternReason,
    },
  });

  return getSerializedTransactionOrThrow(db, input.workspaceId, input.transactionId);
}

export async function refreshWorkspaceBankTransactionAutoBookkeepingSignals(input: {
  workspaceId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    return refreshWorkspaceBankTransactionAutoBookkeepingSignalsInDb(tx, input);
  });
}

export async function suggestWorkspaceBankTransactionAutoBookkeeping(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await getAutoBookkeepingTransactionOrThrow(
      tx,
      input.workspaceId,
      input.transactionId
    );
    const [suggestion] = await buildAutoBookkeepingSuggestions(tx, input.workspaceId, [transaction]);

    const changed =
      transaction.suggestedCategoryId !== suggestion.suggestedCategoryId ||
      transaction.suggestionConfidence !== suggestion.suggestionConfidence ||
      normalizeString(transaction.suggestionReason) !== normalizeString(suggestion.suggestionReason) ||
      transaction.suggestedVatTreatment !== suggestion.suggestedVatTreatment ||
      transaction.suggestedWhtTreatment !== suggestion.suggestedWhtTreatment ||
      normalizeString(transaction.normalizedDescription) !==
        normalizeString(suggestion.normalizedDescription) ||
      normalizeString(transaction.normalizedMerchantName) !==
        normalizeString(suggestion.normalizedMerchantName) ||
      transaction.autoBookkeepingConfidence !== suggestion.autoBookkeepingConfidence ||
      normalizeString(transaction.autoBookkeepingReason) !==
        normalizeString(suggestion.autoBookkeepingReason) ||
      transaction.postingReadiness !== suggestion.postingReadiness ||
      transaction.possibleDuplicateOfTransactionId !== suggestion.possibleDuplicateOfTransactionId ||
      transaction.duplicateConfidence !== suggestion.duplicateConfidence ||
      normalizeString(transaction.duplicateReason) !== normalizeString(suggestion.duplicateReason) ||
      transaction.suspiciousPatternScore !== suggestion.suspiciousPatternScore ||
      normalizeString(transaction.suspiciousPatternReason) !==
        normalizeString(suggestion.suspiciousPatternReason);

    if (!changed) {
      return {
        updated: false,
        transaction: await getSerializedTransactionOrThrow(
          tx,
          input.workspaceId,
          input.transactionId
        ),
      };
    }

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        ...buildSuggestionUpdate(suggestion),
        accountingPostingStatus: resolveBankTransactionAccountingPostingStatus({
          reviewStatus: transaction.reviewStatus,
          postingReadiness: suggestion.postingReadiness,
        }),
      },
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_AUTO_BOOKKEEPING_SUGGESTED",
      metadata: {
        transactionId: transaction.id,
        suggestedCategoryId: suggestion.suggestedCategoryId,
        suggestedVatTreatment: suggestion.suggestedVatTreatment,
        suggestedWhtTreatment: suggestion.suggestedWhtTreatment,
        postingReadiness: suggestion.postingReadiness,
      },
    });

    return {
      updated: true,
      transaction: await getSerializedTransactionOrThrow(tx, input.workspaceId, input.transactionId),
    };
  });
}

export async function bulkSuggestWorkspaceBankTransactionAutoBookkeeping(input: {
  workspaceId: number;
  actorUserId: number;
  transactionIds?: number[];
  limit?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transactions = await tx.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: input.transactionIds?.length
          ? {
              in: input.transactionIds,
            }
          : undefined,
        reviewStatus: {
          not: "POSTED",
        },
      },
      select: autoBookkeepingTransactionSelect,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: input.limit ?? 100,
    });

    const suggestions = await buildAutoBookkeepingSuggestions(tx, input.workspaceId, transactions);
    let updatedCount = 0;

    for (const suggestion of suggestions) {
      const previous = transactions.find((transaction) => transaction.id === suggestion.transactionId);
      if (!previous) continue;

      const changed =
        previous.suggestedCategoryId !== suggestion.suggestedCategoryId ||
        previous.suggestionConfidence !== suggestion.suggestionConfidence ||
        normalizeString(previous.suggestionReason) !== normalizeString(suggestion.suggestionReason) ||
        previous.suggestedVatTreatment !== suggestion.suggestedVatTreatment ||
        previous.suggestedWhtTreatment !== suggestion.suggestedWhtTreatment ||
        normalizeString(previous.normalizedDescription) !==
          normalizeString(suggestion.normalizedDescription) ||
        normalizeString(previous.normalizedMerchantName) !==
          normalizeString(suggestion.normalizedMerchantName) ||
        previous.autoBookkeepingConfidence !== suggestion.autoBookkeepingConfidence ||
        normalizeString(previous.autoBookkeepingReason) !==
          normalizeString(suggestion.autoBookkeepingReason) ||
        previous.postingReadiness !== suggestion.postingReadiness ||
        previous.possibleDuplicateOfTransactionId !== suggestion.possibleDuplicateOfTransactionId ||
        previous.duplicateConfidence !== suggestion.duplicateConfidence ||
        normalizeString(previous.duplicateReason) !== normalizeString(suggestion.duplicateReason) ||
        previous.suspiciousPatternScore !== suggestion.suspiciousPatternScore ||
        normalizeString(previous.suspiciousPatternReason) !==
          normalizeString(suggestion.suspiciousPatternReason);

      if (!changed) continue;

      await tx.bankTransaction.update({
        where: {
          id: suggestion.transactionId,
        },
        data: {
          ...buildSuggestionUpdate(suggestion),
          accountingPostingStatus: resolveBankTransactionAccountingPostingStatus({
            reviewStatus: previous.reviewStatus,
            postingReadiness: suggestion.postingReadiness,
          }),
        },
      });
      updatedCount += 1;
    }

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_AUTO_BOOKKEEPING_BULK_SUGGESTED",
      metadata: {
        transactionIds: transactions.map((transaction) => transaction.id),
        processedCount: transactions.length,
        updatedCount,
      },
    });

    return {
      processedCount: transactions.length,
      updatedCount,
      skippedCount: Math.max(0, transactions.length - updatedCount),
    };
  });
}

async function approveAutoBookkeepingTransaction(
  db: PrismaExecutor,
  input: {
    workspaceId: number;
    actorUserId: number;
    transaction: AutoBookkeepingTransaction;
  }
) {
  const transaction = input.transaction;
  const nextCategoryId = transaction.categoryId ?? transaction.suggestedCategoryId;

  if (!nextCategoryId) {
    throw new Error("This transaction does not have a bookkeeping suggestion to approve.");
  }

  const category = await resolveCategoryOrThrow(db, input.workspaceId, transaction, nextCategoryId);
  const nextReviewStatus: BankTransactionReviewStatus =
    transaction.reviewStatus === "IMPORTED" || transaction.reviewStatus === "PENDING_REVIEW"
      ? "REVIEWED"
      : transaction.reviewStatus;
  const taxUpdate =
    transaction.taxTreatmentSource === "MANUAL"
      ? null
      : buildSuggestedBankTransactionTaxUpdate({
          amountMinor: transaction.amount,
          description: transaction.description,
          reference: transaction.reference,
          suggestedVatTreatment: transaction.suggestedVatTreatment,
          suggestedWhtTreatment: transaction.suggestedWhtTreatment,
        });
  const processedAt = new Date();
  const candidates = await loadDuplicateCandidates(db, input.workspaceId, [transaction]);
  const derived = buildDerivedAutoBookkeepingSignals({
    transaction: {
      ...transaction,
      categoryId: category.id,
      reviewStatus: nextReviewStatus,
      taxTreatmentSource: taxUpdate?.taxTreatmentSource ?? transaction.taxTreatmentSource,
    },
    effectiveCategoryId: category.id,
    suggestionConfidence: transaction.suggestionConfidence,
    suggestionReason: transaction.suggestionReason,
    suggestedVatTreatment: transaction.suggestedVatTreatment,
    suggestedWhtTreatment: transaction.suggestedWhtTreatment,
    effectiveTaxSource: taxUpdate?.taxTreatmentSource ?? transaction.taxTreatmentSource,
    processedAt,
    duplicateCandidates: [...candidates, toDuplicateComparable(transaction)],
    provider:
      transaction.autoBookkeepingProvider ??
      transaction.categorizationProvider ??
      AUTO_BOOKKEEPING_PROVIDER,
  });

  await db.bankTransaction.update({
    where: {
      id: transaction.id,
    },
    data: {
      categoryId: category.id,
      clientBusinessId: transaction.clientBusinessId ?? category.clientBusinessId,
      reviewStatus: nextReviewStatus,
      suggestedCategoryId: null,
      suggestedCategoryName: category.name,
      suggestionConfidence: null,
      suggestionReason: null,
      vatTreatment: taxUpdate?.vatTreatment ?? undefined,
      whtTreatment: taxUpdate?.whtTreatment ?? undefined,
      vatRate: taxUpdate?.vatRate ?? undefined,
      whtRate: taxUpdate?.whtRate ?? undefined,
      vatAmountMinor: taxUpdate?.vatAmountMinor ?? undefined,
      whtAmountMinor: taxUpdate?.whtAmountMinor ?? undefined,
      taxTreatmentSource: taxUpdate?.taxTreatmentSource ?? undefined,
      normalizedDescription: derived.normalizedDescription,
      normalizedMerchantName: derived.normalizedMerchantName,
      autoBookkeepingConfidence: derived.autoBookkeepingConfidence,
      autoBookkeepingReason: derived.autoBookkeepingReason,
      autoBookkeepingProvider: derived.autoBookkeepingProvider,
      autoBookkeepingProcessedAt: derived.autoBookkeepingProcessedAt,
      postingReadiness: derived.postingReadiness,
      accountingPostingStatus: resolveBankTransactionAccountingPostingStatus({
        reviewStatus: nextReviewStatus,
        postingReadiness: derived.postingReadiness,
      }),
      possibleDuplicateOfTransactionId: derived.possibleDuplicateOfTransactionId,
      duplicateConfidence: derived.duplicateConfidence,
      duplicateReason: derived.duplicateReason,
      suspiciousPatternScore: derived.suspiciousPatternScore,
      suspiciousPatternReason: derived.suspiciousPatternReason,
      reviewedAt:
        nextReviewStatus === transaction.reviewStatus ? undefined : processedAt,
      reviewedByUserId:
        nextReviewStatus === transaction.reviewStatus ? undefined : input.actorUserId,
    },
  });

  if (transaction.suggestedCategoryId) {
    await writeBankTransactionCategorizationFeedback(db, {
      workspaceId: input.workspaceId,
      transactionId: transaction.id,
      actorUserId: input.actorUserId,
      decision: "APPROVED",
      suggestedCategoryId: transaction.suggestedCategoryId,
      selectedCategoryId: category.id,
      suggestionConfidence: transaction.suggestionConfidence ?? null,
      suggestionReason: transaction.suggestionReason ?? null,
      provider: transaction.categorizationProvider ?? transaction.autoBookkeepingProvider ?? null,
    });
  }

  await writeBankTransactionBookkeepingFeedback(db, {
    workspaceId: input.workspaceId,
    transactionId: transaction.id,
    actorUserId: input.actorUserId,
    decision: "APPROVED",
    suggestedCategoryId: transaction.suggestedCategoryId,
    selectedCategoryId: category.id,
    suggestedVatTreatment: transaction.suggestedVatTreatment,
    selectedVatTreatment: taxUpdate?.vatTreatment ?? transaction.vatTreatment,
    suggestedWhtTreatment: transaction.suggestedWhtTreatment,
    selectedWhtTreatment: taxUpdate?.whtTreatment ?? transaction.whtTreatment,
    suggestedConfidence: transaction.suggestionConfidence ?? derived.autoBookkeepingConfidence,
    duplicateConfidence: derived.duplicateConfidence,
    suspiciousPatternScore: derived.suspiciousPatternScore,
    postingReadiness: derived.postingReadiness,
    provider: derived.autoBookkeepingProvider,
    reason: derived.autoBookkeepingReason,
  });

  await postBankTransactionToFinancialEngineWithExecutor(db, {
    id: transaction.id,
    workspaceId: input.workspaceId,
    amount: transaction.amount,
    type: transaction.type,
    transactionDate: transaction.transactionDate,
    description: transaction.description,
    reference: transaction.reference,
  });

  return {
    categoryId: category.id,
    postingReadiness: derived.postingReadiness,
  };
}

export async function approveWorkspaceBankTransactionAutoBookkeeping(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await getAutoBookkeepingTransactionOrThrow(
      tx,
      input.workspaceId,
      input.transactionId
    );

    const result = await approveAutoBookkeepingTransaction(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      transaction,
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_AUTO_BOOKKEEPING_APPROVED",
      metadata: {
        transactionId: transaction.id,
        categoryId: result.categoryId,
        postingReadiness: result.postingReadiness,
      },
    });

    return getSerializedTransactionOrThrow(tx, input.workspaceId, input.transactionId);
  });
}

export async function bulkApproveWorkspaceBankTransactionAutoBookkeeping(input: {
  workspaceId: number;
  actorUserId: number;
  transactionIds: number[];
}) {
  return prisma.$transaction(async (tx) => {
    const transactions = await tx.bankTransaction.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: {
          in: input.transactionIds,
        },
      },
      select: autoBookkeepingTransactionSelect,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    });

    let updatedCount = 0;
    for (const transaction of transactions) {
      if (!transaction.categoryId && !transaction.suggestedCategoryId) {
        continue;
      }

      await approveAutoBookkeepingTransaction(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        transaction,
      });
      updatedCount += 1;
    }

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_AUTO_BOOKKEEPING_BULK_APPROVED",
      metadata: {
        transactionIds: transactions.map((transaction) => transaction.id),
        updatedCount,
      },
    });

    return {
      processedCount: transactions.length,
      updatedCount,
      skippedCount: Math.max(0, transactions.length - updatedCount),
    };
  });
}

export async function rejectWorkspaceBankTransactionAutoBookkeeping(input: {
  workspaceId: number;
  actorUserId: number;
  transactionId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await getAutoBookkeepingTransactionOrThrow(
      tx,
      input.workspaceId,
      input.transactionId
    );
    const processedAt = new Date();
    const candidates = await loadDuplicateCandidates(tx, input.workspaceId, [transaction]);
    const derived = buildDerivedAutoBookkeepingSignals({
      transaction: {
        ...transaction,
        suggestionConfidence: null,
        suggestionReason: null,
      },
      effectiveCategoryId: transaction.categoryId,
      suggestionConfidence: null,
      suggestionReason: null,
      suggestedVatTreatment: transaction.suggestedVatTreatment,
      suggestedWhtTreatment: transaction.suggestedWhtTreatment,
      processedAt,
      duplicateCandidates: [...candidates, toDuplicateComparable(transaction)],
      provider:
        transaction.autoBookkeepingProvider ??
        transaction.categorizationProvider ??
        AUTO_BOOKKEEPING_PROVIDER,
    });

    await tx.bankTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        suggestedCategoryId: null,
        suggestionConfidence: null,
        suggestionReason: null,
        normalizedDescription: derived.normalizedDescription,
        normalizedMerchantName: derived.normalizedMerchantName,
        autoBookkeepingConfidence: derived.autoBookkeepingConfidence,
        autoBookkeepingReason: derived.autoBookkeepingReason,
        autoBookkeepingProvider: derived.autoBookkeepingProvider,
        autoBookkeepingProcessedAt: derived.autoBookkeepingProcessedAt,
        postingReadiness: transaction.categoryId ? derived.postingReadiness : "REVIEW_REQUIRED",
        accountingPostingStatus: resolveBankTransactionAccountingPostingStatus({
          reviewStatus: transaction.reviewStatus,
          postingReadiness: transaction.categoryId ? derived.postingReadiness : "REVIEW_REQUIRED",
        }),
        possibleDuplicateOfTransactionId: derived.possibleDuplicateOfTransactionId,
        duplicateConfidence: derived.duplicateConfidence,
        duplicateReason: derived.duplicateReason,
        suspiciousPatternScore: derived.suspiciousPatternScore,
        suspiciousPatternReason: derived.suspiciousPatternReason,
      },
    });

    if (transaction.suggestedCategoryId) {
      await writeBankTransactionCategorizationFeedback(tx, {
        workspaceId: input.workspaceId,
        transactionId: transaction.id,
        actorUserId: input.actorUserId,
        decision: "REJECTED",
        suggestedCategoryId: transaction.suggestedCategoryId,
        selectedCategoryId: transaction.categoryId,
        suggestionConfidence: transaction.suggestionConfidence ?? null,
        suggestionReason: transaction.suggestionReason ?? null,
        provider: transaction.categorizationProvider ?? transaction.autoBookkeepingProvider ?? null,
      });
    }

    await writeBankTransactionBookkeepingFeedback(tx, {
      workspaceId: input.workspaceId,
      transactionId: transaction.id,
      actorUserId: input.actorUserId,
      decision: "REJECTED",
      suggestedCategoryId: transaction.suggestedCategoryId,
      selectedCategoryId: transaction.categoryId,
      suggestedVatTreatment: transaction.suggestedVatTreatment,
      selectedVatTreatment: transaction.vatTreatment,
      suggestedWhtTreatment: transaction.suggestedWhtTreatment,
      selectedWhtTreatment: transaction.whtTreatment,
      suggestedConfidence: transaction.suggestionConfidence ?? transaction.autoBookkeepingConfidence,
      duplicateConfidence: derived.duplicateConfidence,
      suspiciousPatternScore: derived.suspiciousPatternScore,
      postingReadiness: transaction.categoryId ? derived.postingReadiness : "REVIEW_REQUIRED",
      provider: derived.autoBookkeepingProvider,
      reason: "Auto-bookkeeping suggestion was rejected by a reviewer.",
    });

    await writeAuditLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "BANK_TRANSACTION_AUTO_BOOKKEEPING_REJECTED",
      metadata: {
        transactionId: transaction.id,
      },
    });

    return getSerializedTransactionOrThrow(tx, input.workspaceId, input.transactionId);
  });
}
