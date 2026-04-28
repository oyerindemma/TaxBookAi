import "server-only";

import type {
  BankTransactionAccountingPostingStatus,
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
} from "@prisma/client";

export const BANK_TRANSACTION_ACCOUNTING_POSTING_STATUSES = [
  "UNPOSTED",
  "READY_TO_POST",
  "POSTED",
] as const satisfies readonly BankTransactionAccountingPostingStatus[];

export function resolveBankTransactionAccountingPostingStatus(input: {
  reviewStatus: BankTransactionReviewStatus;
  postingReadiness: BankTransactionPostingReadiness;
  hasPostedJournalEntry?: boolean;
}): BankTransactionAccountingPostingStatus {
  if (input.hasPostedJournalEntry || input.reviewStatus === "POSTED") {
    return "POSTED";
  }

  if (input.reviewStatus === "REVIEWED" && input.postingReadiness === "READY_TO_POST") {
    return "READY_TO_POST";
  }

  return "UNPOSTED";
}

export function isBankTransactionReadyToPost(input: {
  reviewStatus: BankTransactionReviewStatus;
  postingReadiness: BankTransactionPostingReadiness;
  hasPostedJournalEntry?: boolean;
}) {
  return (
    resolveBankTransactionAccountingPostingStatus(input) === "READY_TO_POST" &&
    input.reviewStatus === "REVIEWED" &&
    input.postingReadiness === "READY_TO_POST"
  );
}
