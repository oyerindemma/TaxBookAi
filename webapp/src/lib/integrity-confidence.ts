import "server-only";

export type IntegrityConfidenceLabel = "HIGH" | "MEDIUM" | "LOW";
export type IntegrityRepairRecommendation =
  | "AUTO_FIX"
  | "REVIEW_AND_FIX"
  | "MANUAL_ONLY";

export type IntegrityConfidenceFactors = {
  exactReferenceMatch: boolean;
  conflictingReference: boolean;
  verifiedSuccessfulPayment: boolean;
  invoiceMarkedPaid: boolean;
  invoiceMarkedSent: boolean;
  paymentAmountMatchesInvoice: boolean;
  ledgerAmountMatchesInvoice: boolean;
  moneyInLedgerPresent: boolean;
  taxRecordPresent: boolean;
  workspaceConsistent: boolean;
  clientBusinessResolution:
    | "EXPLICIT"
    | "INFERRED_SINGLE_BUSINESS"
    | "AMBIGUOUS"
    | "MISSING";
  duplicateMoneyInCount: number;
  priorRepairAttemptCount: number;
  priorRepairFailureCount: number;
  priorRepairSucceeded: boolean;
  priorStatus: string | null;
};

export type IntegrityConfidenceIssueInput = {
  issueType: string;
  severity: string;
  autoRepairable: boolean;
  repairAction: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  workspaceId: number;
  invoiceId: number | null;
  paymentId: number | null;
  ledgerTransactionId: number | null;
  taxRecordId: number | null;
};

export type IntegrityConfidenceContext = {
  invoice: {
    id: number;
    workspaceId: number;
    status: string;
    paymentReference: string | null;
    totalAmount: number;
    clientBusinessId: number | null;
  } | null;
  latestSuccessfulPayment: {
    id: number;
    workspaceId: number;
    reference: string;
    amountMinor: number;
    currency: string;
    status: string;
    providerTransactionId: string | null;
  } | null;
  paymentCount: number;
  successfulPaymentCount: number;
  moneyInLedgerRows: Array<{
    id: number;
    reference: string | null;
    amountMinor: number;
    currency: string;
    clientBusinessId: number;
  }>;
  taxRecord: {
    id: number;
  } | null;
  singleActiveClientBusinessId: number | null;
  clientBusinessResolution:
    | "EXPLICIT"
    | "INFERRED_SINGLE_BUSINESS"
    | "AMBIGUOUS"
    | "MISSING";
  exactPaymentReferenceMatch: boolean;
  conflictingPaymentReference: boolean;
  workspaceConsistent: boolean;
  previousIssue: {
    status: string | null;
    autoRepairable: boolean;
    repairAttempted: boolean;
    repairSucceeded: boolean;
    repairFailureCount: number;
  } | null;
};

export type IntegrityConfidenceAssessment = {
  confidenceScore: number;
  confidenceLabel: IntegrityConfidenceLabel;
  recommendation: IntegrityRepairRecommendation;
  reasoning: string[];
  factors: IntegrityConfidenceFactors;
  suggestedFix: string | null;
};

export type IntegrityConfidenceScorer = {
  scoreIssue(
    issue: IntegrityConfidenceIssueInput,
    context: IntegrityConfidenceContext
  ): IntegrityConfidenceAssessment;
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function readConfidenceLabel(value: number): IntegrityConfidenceLabel {
  if (value >= 0.85) return "HIGH";
  if (value >= 0.55) return "MEDIUM";
  return "LOW";
}

function buildFactors(
  context: IntegrityConfidenceContext
): IntegrityConfidenceFactors {
  const invoice = context.invoice;
  const payment = context.latestSuccessfulPayment;
  const moneyInLedgerRows = context.moneyInLedgerRows;
  const singleLedgerAmountMatch =
    invoice !== null &&
    moneyInLedgerRows.length === 1 &&
    moneyInLedgerRows[0].amountMinor === invoice.totalAmount;

  return {
    exactReferenceMatch: context.exactPaymentReferenceMatch,
    conflictingReference: context.conflictingPaymentReference,
    verifiedSuccessfulPayment: Boolean(payment && payment.status === "SUCCESS"),
    invoiceMarkedPaid: invoice?.status === "PAID",
    invoiceMarkedSent: invoice?.status === "SENT",
    paymentAmountMatchesInvoice:
      invoice !== null && payment !== null
        ? payment.amountMinor === invoice.totalAmount
        : false,
    ledgerAmountMatchesInvoice: singleLedgerAmountMatch,
    moneyInLedgerPresent: moneyInLedgerRows.length > 0,
    taxRecordPresent: Boolean(context.taxRecord),
    workspaceConsistent: context.workspaceConsistent,
    clientBusinessResolution: context.clientBusinessResolution,
    duplicateMoneyInCount: Math.max(0, moneyInLedgerRows.length - 1),
    priorRepairAttemptCount: context.previousIssue?.repairAttempted ? 1 : 0,
    priorRepairFailureCount: context.previousIssue?.repairFailureCount ?? 0,
    priorRepairSucceeded: context.previousIssue?.repairSucceeded ?? false,
    priorStatus: context.previousIssue?.status ?? null,
  };
}

function applyCommonAdjustments(input: {
  score: number;
  reasoning: string[];
  factors: IntegrityConfidenceFactors;
}) {
  let score = input.score;
  const reasoning = [...input.reasoning];

  if (!input.factors.workspaceConsistent) {
    score = Math.min(score, 0.2);
    reasoning.push("Workspace consistency could not be proven across the payment chain.");
  }

  if (input.factors.conflictingReference) {
    score = Math.min(score, 0.25);
    reasoning.push("Invoice and payment references conflict.");
  }

  if (input.factors.clientBusinessResolution === "AMBIGUOUS") {
    score = Math.min(score, 0.35);
    reasoning.push("Client business mapping is ambiguous.");
  }

  if (input.factors.priorRepairFailureCount >= 2) {
    score = Math.min(score, 0.2);
    reasoning.push("Repeated repair failures lowered confidence.");
  } else if (input.factors.priorRepairFailureCount === 1) {
    score -= 0.18;
    reasoning.push("A previous repair attempt failed for this issue.");
  }

  if (input.factors.priorRepairSucceeded) {
    score += 0.05;
    reasoning.push("A previous repair for this fingerprint succeeded.");
  }

  return {
    score: clampScore(score),
    reasoning,
  };
}

function getSuggestedFix(
  issue: IntegrityConfidenceIssueInput,
  recommendation: IntegrityRepairRecommendation
) {
  switch (issue.issueType) {
    case "PAID_INVOICE_MISSING_PAYMENT":
      return recommendation === "AUTO_FIX"
        ? "Backfill the missing Payment row from the paid invoice state."
        : "Review the invoice payment trail before backfilling a Payment row.";
    case "SUCCESSFUL_PAYMENT_INVOICE_NOT_PAID":
    case "STALE_SENT_INVOICE_VERIFIED_PAYMENT":
      return recommendation === "AUTO_FIX"
        ? "Replay the verified payment flow to mark the invoice PAID and sync downstream records."
        : "Verify the payment reference, then replay payment confirmation if the match is exact.";
    case "PAID_INVOICE_MISSING_LEDGER":
    case "PAYMENT_LEDGER_SYNC_MISSING":
      return recommendation === "AUTO_FIX"
        ? "Recreate the missing MONEY_IN ledger entry through the shared invoice payment chain."
        : "Confirm client-business mapping before recreating the ledger entry.";
    case "PAYMENT_TAX_SYNC_MISSING":
      return recommendation === "AUTO_FIX"
        ? "Rerun the shared payment confirmation flow so the tax record is regenerated safely."
        : "Verify payment and ledger integrity first, then rerun tax sync.";
    case "LEDGER_INVOICE_NOT_PAID":
      return "Confirm the ledger row and payment reference before replaying payment confirmation.";
    case "AMOUNT_MISMATCH":
      return "Manual investigation required. Do not auto-change financial amounts.";
    case "DUPLICATE_LEDGER_ROWS":
      return "Manual investigation required. Do not auto-delete duplicate ledger rows.";
    case "ORPHAN_PAYMENT":
      return "Manual investigation required. Resolve the missing or cross-workspace invoice link.";
    default:
      return issue.autoRepairable
        ? "Review the payment chain and apply the shared repair flow if the references are exact."
        : "Manual investigation is required before taking action.";
  }
}

function deriveRecommendation(input: {
  issue: IntegrityConfidenceIssueInput;
  score: number;
  label: IntegrityConfidenceLabel;
  factors: IntegrityConfidenceFactors;
}): IntegrityRepairRecommendation {
  const manualOnlyIssueTypes = new Set([
    "AMOUNT_MISMATCH",
    "DUPLICATE_LEDGER_ROWS",
    "ORPHAN_PAYMENT",
  ]);

  if (manualOnlyIssueTypes.has(input.issue.issueType)) {
    return "MANUAL_ONLY";
  }

  if (input.factors.conflictingReference) {
    return "MANUAL_ONLY";
  }

  if (input.factors.clientBusinessResolution === "AMBIGUOUS") {
    return "MANUAL_ONLY";
  }

  if (
    input.issue.issueType === "LEDGER_INVOICE_NOT_PAID" &&
    !input.factors.verifiedSuccessfulPayment
  ) {
    return "MANUAL_ONLY";
  }

  if (input.factors.priorRepairFailureCount >= 2) {
    return "MANUAL_ONLY";
  }

  if (input.label === "HIGH" && input.issue.autoRepairable) {
    return "AUTO_FIX";
  }

  if (input.label === "MEDIUM") {
    return "REVIEW_AND_FIX";
  }

  return "MANUAL_ONLY";
}

function scoreMissingPayment(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.72;
  const reasoning = [
    "The invoice is already marked paid, so a Payment row is expected.",
  ];

  if (factors.invoiceMarkedPaid) {
    score += 0.12;
    reasoning.push("Invoice status is already PAID.");
  }

  if (context.paymentCount === 0) {
    score += 0.09;
    reasoning.push("No Payment row exists yet, so backfill will not duplicate an existing payment.");
  }

  if (context.invoice && context.invoice.totalAmount > 0) {
    score += 0.06;
    reasoning.push("Invoice amount is present and can be used for a deterministic backfill.");
  }

  return { score, reasoning };
}

function scoreSuccessfulPaymentInvoiceNotPaid(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.52;
  const reasoning = [
    "A successful payment exists while the invoice is not yet marked PAID.",
  ];

  if (factors.verifiedSuccessfulPayment) {
    score += 0.18;
    reasoning.push("Payment status is SUCCESS.");
  }

  if (factors.exactReferenceMatch) {
    score += 0.18;
    reasoning.push("Invoice and payment references match exactly.");
  } else if (!factors.conflictingReference) {
    score += 0.05;
    reasoning.push("No conflicting reference was found.");
  }

  if (factors.paymentAmountMatchesInvoice) {
    score += 0.1;
    reasoning.push("Payment amount matches the invoice total.");
  }

  if (factors.moneyInLedgerPresent && factors.ledgerAmountMatchesInvoice) {
    score += 0.05;
    reasoning.push("A matching MONEY_IN ledger entry already exists.");
  }

  return { score, reasoning };
}

function scoreMissingLedger(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.48;
  const reasoning = [
    "A paid invoice is missing the expected MONEY_IN ledger entry.",
  ];

  if (factors.invoiceMarkedPaid) {
    score += 0.12;
    reasoning.push("Invoice status is PAID.");
  }

  if (context.clientBusinessResolution === "EXPLICIT") {
    score += 0.22;
    reasoning.push("Client business is explicitly linked on the invoice.");
  } else if (context.clientBusinessResolution === "INFERRED_SINGLE_BUSINESS") {
    score += 0.12;
    reasoning.push("The workspace has exactly one active client business, so mapping is deterministic.");
  } else if (context.clientBusinessResolution === "MISSING") {
    score -= 0.08;
    reasoning.push("No client business mapping is currently available.");
  }

  if (factors.verifiedSuccessfulPayment && factors.paymentAmountMatchesInvoice) {
    score += 0.1;
    reasoning.push("A matching successful payment supports recreating the ledger entry safely.");
  }

  return { score, reasoning };
}

function scoreMissingTaxSync(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.52;
  const reasoning = [
    "A successful payment exists, but no tax record was created for the invoice.",
  ];

  if (factors.verifiedSuccessfulPayment) {
    score += 0.18;
    reasoning.push("Payment status is SUCCESS.");
  }

  if (factors.exactReferenceMatch) {
    score += 0.1;
    reasoning.push("Invoice and payment references match exactly.");
  }

  if (factors.moneyInLedgerPresent && factors.ledgerAmountMatchesInvoice) {
    score += 0.14;
    reasoning.push("Ledger posting already succeeded with a matching MONEY_IN row.");
  } else if (factors.moneyInLedgerPresent) {
    score += 0.05;
    reasoning.push("A MONEY_IN ledger row exists for the invoice.");
  }

  if (factors.paymentAmountMatchesInvoice) {
    score += 0.08;
    reasoning.push("Payment amount matches the invoice total.");
  }

  return { score, reasoning };
}

function scorePaymentLedgerGap(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.46;
  const reasoning = [
    "A successful payment exists, but the MONEY_IN ledger row is missing.",
  ];

  if (factors.verifiedSuccessfulPayment) {
    score += 0.16;
    reasoning.push("Payment status is SUCCESS.");
  }

  if (factors.exactReferenceMatch) {
    score += 0.14;
    reasoning.push("Invoice and payment references match exactly.");
  }

  if (factors.paymentAmountMatchesInvoice) {
    score += 0.12;
    reasoning.push("Payment amount matches the invoice total.");
  }

  return { score, reasoning };
}

function scoreLedgerInvoiceNotPaid(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.42;
  const reasoning = [
    "A MONEY_IN ledger row exists while the invoice is not marked PAID.",
  ];

  if (factors.verifiedSuccessfulPayment) {
    score += 0.14;
    reasoning.push("A successful payment row also exists.");
  }

  if (factors.ledgerAmountMatchesInvoice) {
    score += 0.1;
    reasoning.push("Ledger amount matches the invoice total.");
  }

  if (factors.exactReferenceMatch) {
    score += 0.12;
    reasoning.push("Invoice and payment references match exactly.");
  }

  return { score, reasoning };
}

function scoreStaleSentInvoice(
  context: IntegrityConfidenceContext,
  factors: IntegrityConfidenceFactors
) {
  let score = 0.46;
  const reasoning = [
    "A verified payment exists, but the invoice is still in SENT status after the expected sync window.",
  ];

  if (factors.verifiedSuccessfulPayment) {
    score += 0.12;
    reasoning.push("Payment status is SUCCESS.");
  }

  if (factors.exactReferenceMatch) {
    score += 0.12;
    reasoning.push("Invoice and payment references match exactly.");
  }

  if (factors.paymentAmountMatchesInvoice) {
    score += 0.08;
    reasoning.push("Payment amount matches the invoice total.");
  }

  return { score, reasoning };
}

export const deterministicIntegrityConfidenceScorer: IntegrityConfidenceScorer = {
  scoreIssue(issue, context) {
    const factors = buildFactors(context);
    let score = 0.2;
    let reasoning: string[] = [];

    switch (issue.issueType) {
      case "PAID_INVOICE_MISSING_PAYMENT": {
        const result = scoreMissingPayment(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "SUCCESSFUL_PAYMENT_INVOICE_NOT_PAID": {
        const result = scoreSuccessfulPaymentInvoiceNotPaid(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "PAID_INVOICE_MISSING_LEDGER": {
        const result = scoreMissingLedger(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "PAYMENT_TAX_SYNC_MISSING": {
        const result = scoreMissingTaxSync(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "PAYMENT_LEDGER_SYNC_MISSING": {
        const result = scorePaymentLedgerGap(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "LEDGER_INVOICE_NOT_PAID": {
        const result = scoreLedgerInvoiceNotPaid(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "STALE_SENT_INVOICE_VERIFIED_PAYMENT": {
        const result = scoreStaleSentInvoice(context, factors);
        score = result.score;
        reasoning = result.reasoning;
        break;
      }
      case "AMOUNT_MISMATCH":
        score = 0.08;
        reasoning = [
          "Financial amounts do not match across invoice, payment, or ledger records.",
          "Amounts are never auto-corrected by the integrity engine.",
        ];
        break;
      case "DUPLICATE_LEDGER_ROWS":
        score = 0.08;
        reasoning = [
          "Duplicate MONEY_IN ledger rows were detected for the same invoice reference.",
          "Duplicate ledger rows must be reviewed manually and are never auto-deleted.",
        ];
        break;
      case "ORPHAN_PAYMENT":
        score = 0.08;
        reasoning = [
          "The payment does not resolve cleanly to an invoice in this workspace.",
          "Cross-workspace drift or missing invoice linkage requires manual review.",
        ];
        break;
      default:
        score = issue.autoRepairable ? 0.55 : 0.3;
        reasoning = [
          issue.autoRepairable
            ? "The issue has a known repair action, but confidence depends on additional operator review."
            : "No safe automatic repair path is configured for this issue.",
        ];
        break;
    }

    const adjusted = applyCommonAdjustments({ score, reasoning, factors });
    const confidenceLabel = readConfidenceLabel(adjusted.score);
    const recommendation = deriveRecommendation({
      issue,
      score: adjusted.score,
      label: confidenceLabel,
      factors,
    });

    return {
      confidenceScore: adjusted.score,
      confidenceLabel,
      recommendation,
      reasoning: adjusted.reasoning,
      factors,
      suggestedFix: getSuggestedFix(issue, recommendation),
    };
  },
};

export function scoreIntegrityIssue(
  issue: IntegrityConfidenceIssueInput,
  context: IntegrityConfidenceContext,
  scorer: IntegrityConfidenceScorer = deterministicIntegrityConfidenceScorer
) {
  return scorer.scoreIssue(issue, context);
}

export function getRepairRecommendation(
  issue: IntegrityConfidenceIssueInput,
  context: IntegrityConfidenceContext,
  scorer: IntegrityConfidenceScorer = deterministicIntegrityConfidenceScorer
) {
  return scorer.scoreIssue(issue, context).recommendation;
}
