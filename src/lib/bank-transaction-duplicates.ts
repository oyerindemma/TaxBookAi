import "server-only";

import type { BankTransactionType } from "@prisma/client";

export type DuplicateComparableBankTransaction = {
  id: number;
  bankAccountId: number;
  transactionDate: Date;
  amount: number;
  type: BankTransactionType;
  description: string;
  reference: string | null;
  normalizedDescription: string | null;
  normalizedMerchantName: string | null;
};

export type DuplicateDetectionResult = {
  possibleDuplicateOfTransactionId: number | null;
  confidence: number | null;
  reason: string | null;
  candidateCount: number;
};

function tokenize(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !/^\d+$/.test(token))
  );
}

function overlapRatio(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function normalizeReference(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreAmount(left: number, right: number) {
  if (left === right) {
    return { score: 0.42, reason: "amount exactly matches" };
  }

  const difference = Math.abs(left - right);
  const tightTolerance = Math.max(100, Math.round(Math.max(Math.abs(left), Math.abs(right)) * 0.01));
  const looseTolerance = Math.max(250, Math.round(Math.max(Math.abs(left), Math.abs(right)) * 0.03));

  if (difference <= tightTolerance) {
    return { score: 0.28, reason: "amount is nearly identical" };
  }

  if (difference <= looseTolerance) {
    return { score: 0.14, reason: "amount is within a small tolerance" };
  }

  return { score: 0, reason: null };
}

function scoreDate(left: Date, right: Date) {
  const differenceDays = Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);

  if (differenceDays === 0) {
    return { score: 0.24, reason: "same-day timing" };
  }
  if (differenceDays <= 2) {
    return { score: 0.18, reason: "date is very close" };
  }
  if (differenceDays <= 5) {
    return { score: 0.1, reason: "date is within a short review window" };
  }

  return { score: 0, reason: null };
}

function scoreMerchant(left: string | null, right: string | null) {
  if (!left || !right) {
    return { score: 0, reason: null };
  }

  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft === normalizedRight) {
    return { score: 0.2, reason: "merchant context matches" };
  }

  const overlap = overlapRatio(left, right);
  if (overlap >= 0.75) {
    return { score: 0.14, reason: "merchant tokens strongly align" };
  }
  if (overlap >= 0.45) {
    return { score: 0.08, reason: "merchant tokens overlap" };
  }

  return { score: 0, reason: null };
}

function scoreDescription(left: string | null, right: string | null) {
  const overlap = overlapRatio(left, right);
  if (overlap >= 0.8) {
    return { score: 0.12, reason: "normalized narration strongly matches" };
  }
  if (overlap >= 0.5) {
    return { score: 0.08, reason: "normalized narration matches" };
  }
  if (overlap >= 0.3) {
    return { score: 0.04, reason: "normalized narration partly matches" };
  }

  return { score: 0, reason: null };
}

function scoreReference(left: string | null, right: string | null) {
  const normalizedLeft = normalizeReference(left);
  const normalizedRight = normalizeReference(right);
  if (!normalizedLeft || !normalizedRight) {
    return { score: 0, reason: null };
  }

  if (normalizedLeft === normalizedRight && normalizedLeft.length >= 6) {
    return { score: 0.16, reason: "reference matches" };
  }

  if (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 6 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return { score: 0.08, reason: "reference is closely related" };
  }

  return { score: 0, reason: null };
}

export function detectPotentialBankTransactionDuplicate(input: {
  transaction: DuplicateComparableBankTransaction;
  candidates: DuplicateComparableBankTransaction[];
}) {
  let bestCandidate: DuplicateComparableBankTransaction | null = null;
  let bestScore = 0;
  let bestReasons: string[] = [];

  for (const candidate of input.candidates) {
    if (candidate.id === input.transaction.id) continue;
    if (candidate.type !== input.transaction.type) continue;

    const reasons: string[] = [];
    let score = 0;

    if (candidate.bankAccountId === input.transaction.bankAccountId) {
      score += 0.08;
      reasons.push("same bank account");
    }

    const amount = scoreAmount(input.transaction.amount, candidate.amount);
    score += amount.score;
    if (amount.reason) reasons.push(amount.reason);

    const date = scoreDate(input.transaction.transactionDate, candidate.transactionDate);
    score += date.score;
    if (date.reason) reasons.push(date.reason);

    const merchant = scoreMerchant(
      input.transaction.normalizedMerchantName,
      candidate.normalizedMerchantName
    );
    score += merchant.score;
    if (merchant.reason) reasons.push(merchant.reason);

    const description = scoreDescription(
      input.transaction.normalizedDescription,
      candidate.normalizedDescription
    );
    score += description.score;
    if (description.reason) reasons.push(description.reason);

    const reference = scoreReference(input.transaction.reference, candidate.reference);
    score += reference.score;
    if (reference.reason) reasons.push(reference.reason);

    const finalScore = Math.min(0.99, Number(score.toFixed(4)));
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestCandidate = candidate;
      bestReasons = reasons;
    }
  }

  if (!bestCandidate || bestScore < 0.62) {
    return {
      possibleDuplicateOfTransactionId: null,
      confidence: null,
      reason: null,
      candidateCount: input.candidates.length,
    } satisfies DuplicateDetectionResult;
  }

  return {
    possibleDuplicateOfTransactionId: bestCandidate.id,
    confidence: bestScore,
    reason: bestReasons.slice(0, 4).join(", ") || "This transaction closely matches earlier activity.",
    candidateCount: input.candidates.length,
  } satisfies DuplicateDetectionResult;
}
