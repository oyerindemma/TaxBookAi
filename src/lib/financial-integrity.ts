import "server-only";

import type { PaymentProvider, Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getFinancialHealthSnapshot, type FinancialHealthSnapshot } from "@/lib/financial-health";
import {
  getRepairRecommendation,
  scoreIntegrityIssue,
  type IntegrityConfidenceContext,
  type IntegrityConfidenceFactors,
  type IntegrityConfidenceLabel,
  type IntegrityRepairRecommendation,
} from "@/lib/integrity-confidence";
import { getIntegrityAlertSeverity, sendIntegrityAlert } from "@/lib/integrity-alerts";
import { processInvoicePayment } from "@/lib/invoice-payments";
import { resolveInvoiceClientBusinessId } from "@/lib/invoices";
import { createIncomeEntryFromInvoice } from "@/lib/ledger";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma, withPrismaRetry } from "@/lib/prisma";

const DEFAULT_INVOICE_CURRENCY = "NGN";
const STALE_SENT_INVOICE_THRESHOLD_MS = 15 * 60 * 1000;

export type FinancialIntegrityIssueType =
  | "PAID_INVOICE_MISSING_PAYMENT"
  | "PAID_INVOICE_MISSING_LEDGER"
  | "SUCCESSFUL_PAYMENT_INVOICE_NOT_PAID"
  | "LEDGER_INVOICE_NOT_PAID"
  | "PAYMENT_LEDGER_SYNC_MISSING"
  | "PAYMENT_TAX_SYNC_MISSING"
  | "ORPHAN_PAYMENT"
  | "DUPLICATE_LEDGER_ROWS"
  | "AMOUNT_MISMATCH"
  | "STALE_SENT_INVOICE_VERIFIED_PAYMENT";

export type FinancialIntegritySeverity = "warning" | "critical";
export type FinancialIntegrityRepairConfidenceLabel = IntegrityConfidenceLabel;
export type FinancialIntegrityRepairRecommendation = IntegrityRepairRecommendation;
export type FinancialIntegrityIssueStatus =
  | "OPEN"
  | "MANUAL_REVIEW"
  | "AUTO_REPAIRED"
  | "RESOLVED"
  | "IGNORED";
export type FinancialIntegrityRepairAction =
  | "BACKFILL_PAYMENT"
  | "PROCESS_VERIFIED_PAYMENT"
  | "CREATE_LEDGER_ENTRY"
  | null;

type IntegrityInvoiceRow = {
  id: number;
  workspaceId: number;
  clientBusinessId: number | null;
  invoiceNumber: string;
  status: string;
  paymentReference: string | null;
  paidAt: Date | null;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
};

type IntegrityPaymentRow = {
  id: number;
  workspaceId: number;
  invoiceId: number;
  provider: PaymentProvider;
  reference: string;
  amountMinor: number;
  currency: string;
  status: string;
  providerTransactionId: string | null;
  paidAt: Date | null;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

type IntegrityLedgerRow = {
  id: number;
  clientBusinessId: number;
  reference: string | null;
  direction: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

type IntegrityTaxRecordRow = {
  id: number;
  invoiceId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type IntegrityClientBusinessRow = {
  id: number;
};

type ExistingIntegrityIssueRow = {
  fingerprint: string;
  status: string;
  autoRepairable: boolean;
  metadata: Prisma.JsonValue | null;
  lastDetectedAt: Date;
  updatedAt: Date;
};

type FinancialIntegrityLoadedInputs = {
  workspaceId: number;
  workspaceName: string;
  scannedAt: Date;
  invoices: IntegrityInvoiceRow[];
  payments: IntegrityPaymentRow[];
  taxRecords: IntegrityTaxRecordRow[];
  ledgerTransactions: IntegrityLedgerRow[];
  clientBusinesses: IntegrityClientBusinessRow[];
  existingIssuesByFingerprint: Map<string, ExistingIntegrityIssueRow>;
  singleActiveClientBusinessId: number | null;
  invoiceById: Map<number, IntegrityInvoiceRow>;
  paymentsByInvoiceId: Map<number, IntegrityPaymentRow[]>;
  successfulPaymentsByInvoiceId: Map<number, IntegrityPaymentRow[]>;
  latestSuccessfulPaymentByInvoiceId: Map<number, IntegrityPaymentRow>;
  taxRecordByInvoiceId: Map<number, IntegrityTaxRecordRow>;
  ledgerRowsByInvoiceId: Map<number, IntegrityLedgerRow[]>;
  moneyInLedgerRowsByInvoiceId: Map<number, IntegrityLedgerRow[]>;
};

export type FinancialIntegrityIssueRecord = {
  fingerprint: string;
  issueType: FinancialIntegrityIssueType;
  severity: FinancialIntegritySeverity;
  autoRepairable: boolean;
  repairConfidenceScore: number;
  repairConfidenceLabel: FinancialIntegrityRepairConfidenceLabel;
  repairRecommendation: FinancialIntegrityRepairRecommendation;
  repairAction: FinancialIntegrityRepairAction;
  repairReasoning: string[];
  repairConfidenceFactors: IntegrityConfidenceFactors;
  suggestedFix: string | null;
  workspaceId: number;
  invoiceId: number | null;
  paymentId: number | null;
  ledgerTransactionId: number | null;
  taxRecordId: number | null;
  summary: string;
  detailLines: string[];
  metadata: Record<string, unknown>;
};

type FinancialIntegrityHandledIssue = FinancialIntegrityIssueRecord & {
  status: FinancialIntegrityIssueStatus;
  autoRepaired: boolean;
  repairError: string | null;
};

export type FinancialIntegrityRunSummary = {
  mode: "scan" | "repair";
  workspaceId: number;
  workspaceName: string;
  scannedAt: string;
  issuesFound: number;
  autoRepaired: number;
  manualReview: number;
  skipped: number;
  flaggedForManualReview: number;
  healthScoreAfterRun: number;
  healthLabelAfterRun: FinancialHealthSnapshot["label"];
  breakdownByType: Record<
    FinancialIntegrityIssueType,
    {
      issuesFound: number;
      autoRepaired: number;
      manualReview: number;
      skipped: number;
    }
  >;
  issues: Array<{
    fingerprint: string;
    issueType: FinancialIntegrityIssueType;
    severity: FinancialIntegritySeverity;
    status: FinancialIntegrityIssueStatus;
    autoRepairable: boolean;
    repairConfidenceScore: number;
    repairConfidenceLabel: FinancialIntegrityRepairConfidenceLabel;
    repairRecommendation: FinancialIntegrityRepairRecommendation;
    autoRepaired: boolean;
    summary: string;
    detailLines: string[];
    repairReasoning: string[];
    suggestedFix: string | null;
    invoiceId: number | null;
    paymentId: number | null;
    ledgerTransactionId: number | null;
    taxRecordId: number | null;
    repairAction: FinancialIntegrityRepairAction;
    repairError: string | null;
  }>;
};

export type FinancialIntegrityAdminIssueRow = {
  id: number;
  issueType: string;
  severity: string;
  status: string;
  autoRepairable: boolean;
  confidenceScore: number | null;
  repairConfidenceScore: number | null;
  repairConfidenceLabel: FinancialIntegrityRepairConfidenceLabel | null;
  repairRecommendation: FinancialIntegrityRepairRecommendation | null;
  repairReasoning: string[];
  repairConfidenceFactors: Record<string, unknown> | null;
  suggestedFix: string | null;
  lastConfidenceComputedAt: string | null;
  repairAttempted: boolean;
  repairSucceeded: boolean | null;
  summary: string;
  details: string | null;
  demoLabel: string | null;
  invoiceId: number | null;
  paymentId: number | null;
  ledgerTransactionId: number | null;
  taxRecordId: number | null;
  reference: string | null;
  workspaceId: number;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
  lastDetectedAt: string;
  autoRepairedAt: string | null;
  resolvedAt: string | null;
  invoiceHref: string | null;
  paymentHref: string | null;
  ledgerHref: string | null;
};

export type FinancialIntegrityIssuesSnapshot = {
  generatedAt: string;
  scope: {
    workspaceIds: number[];
    selectedWorkspaceId: number | null;
  };
  summary: {
    openIssues: number;
    criticalIssues: number;
    autoRepairedToday: number;
    manualReviewRequired: number;
  };
  issues: FinancialIntegrityAdminIssueRow[];
};

export function buildFinancialIntegrityIssuesFallbackSnapshot(input: {
  workspaceIds: number[];
  selectedWorkspaceId: number | null;
}): FinancialIntegrityIssuesSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    scope: {
      workspaceIds: input.workspaceIds,
      selectedWorkspaceId: input.selectedWorkspaceId,
    },
    summary: {
      openIssues: 0,
      criticalIssues: 0,
      autoRepairedToday: 0,
      manualReviewRequired: 0,
    },
    issues: [],
  };
}

type FinancialIntegrityRepairResult = {
  success: boolean;
  repairError: string | null;
};

function buildInvoiceLedgerReference(invoiceId: number) {
  return `INVOICE:${invoiceId}`;
}

function parseInvoiceIdFromReference(reference: string | null | undefined) {
  if (!reference?.startsWith("INVOICE:")) return null;

  const parsed = Number(reference.slice("INVOICE:".length));
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildIssueFingerprint(
  issueType: FinancialIntegrityIssueType,
  workspaceId: number,
  components: Array<string | number | null | undefined>
) {
  const normalized = components.map((value) => String(value ?? "null")).join(":");
  return `${workspaceId}:${issueType}:${normalized}`;
}

function getPaymentEventTimestamp(payment: IntegrityPaymentRow) {
  return payment.paidAt ?? payment.updatedAt ?? payment.createdAt;
}

function sortPaymentsNewestFirst(left: IntegrityPaymentRow, right: IntegrityPaymentRow) {
  return getPaymentEventTimestamp(right).getTime() - getPaymentEventTimestamp(left).getTime();
}

function createIssue(
  input: Omit<
    FinancialIntegrityIssueRecord,
    | "fingerprint"
    | "repairConfidenceScore"
    | "repairConfidenceLabel"
    | "repairRecommendation"
    | "repairReasoning"
    | "repairConfidenceFactors"
    | "suggestedFix"
  >
): FinancialIntegrityIssueRecord {
  const referenceComponent =
    typeof input.metadata.reference === "string" ||
    typeof input.metadata.reference === "number"
      ? input.metadata.reference
      : null;
  const fingerprint = buildIssueFingerprint(input.issueType, input.workspaceId, [
    input.invoiceId,
    input.paymentId,
    input.ledgerTransactionId,
    input.taxRecordId,
    referenceComponent,
  ]);

  return {
    ...input,
    fingerprint,
    repairConfidenceScore: 0,
    repairConfidenceLabel: "LOW",
    repairRecommendation: "MANUAL_ONLY",
    repairReasoning: [],
    repairConfidenceFactors: {
      exactReferenceMatch: false,
      conflictingReference: false,
      verifiedSuccessfulPayment: false,
      invoiceMarkedPaid: false,
      invoiceMarkedSent: false,
      paymentAmountMatchesInvoice: false,
      ledgerAmountMatchesInvoice: false,
      moneyInLedgerPresent: false,
      taxRecordPresent: false,
      workspaceConsistent: true,
      clientBusinessResolution: "MISSING",
      duplicateMoneyInCount: 0,
      priorRepairAttemptCount: 0,
      priorRepairFailureCount: 0,
      priorRepairSucceeded: false,
      priorStatus: null,
    },
    suggestedFix: null,
  };
}

function serializeDetails(detailLines: string[]) {
  return detailLines.join("\n");
}

function parseIntegrityMetadata(
  value: Prisma.JsonValue | null | undefined
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseRepairFailureCount(metadata: Record<string, unknown>) {
  const raw = metadata.repairFailureCount;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.trunc(raw);
  }

  return 0;
}

function parseRepairConfidenceScore(metadata: Record<string, unknown>) {
  const raw = metadata.repairConfidenceScore;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampRepairConfidenceScore(raw);
  }

  return null;
}

function parseRepairConfidenceLabel(
  metadata: Record<string, unknown>
): FinancialIntegrityRepairConfidenceLabel | null {
  const raw = metadata.repairConfidenceLabel;
  if (raw === "HIGH" || raw === "MEDIUM" || raw === "LOW") {
    return raw;
  }

  return null;
}

function parseBooleanMetadata(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  return typeof raw === "boolean" ? raw : null;
}

function parseStringMetadata(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function parseStringArrayMetadata(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function parseRecordMetadata(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

function parseRepairRecommendation(
  metadata: Record<string, unknown>
): FinancialIntegrityRepairRecommendation | null {
  const raw = metadata.repairRecommendation;
  if (raw === "AUTO_FIX" || raw === "REVIEW_AND_FIX" || raw === "MANUAL_ONLY") {
    return raw;
  }

  return null;
}

function clampRepairConfidenceScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hasExactPaymentReferenceMatch(
  invoice: IntegrityInvoiceRow | null,
  payment: IntegrityPaymentRow | null
) {
  if (!invoice?.paymentReference || !payment?.reference) {
    return false;
  }

  return invoice.paymentReference.trim() === payment.reference.trim();
}

function hasConflictingPaymentReference(
  invoice: IntegrityInvoiceRow | null,
  payment: IntegrityPaymentRow | null
) {
  if (!invoice?.paymentReference || !payment?.reference) {
    return false;
  }

  return invoice.paymentReference.trim() !== payment.reference.trim();
}

function readClientBusinessResolution(
  invoice: IntegrityInvoiceRow | null,
  inputs: FinancialIntegrityLoadedInputs
): IntegrityConfidenceContext["clientBusinessResolution"] {
  if (invoice?.clientBusinessId) {
    return "EXPLICIT";
  }

  if (inputs.singleActiveClientBusinessId) {
    return "INFERRED_SINGLE_BUSINESS";
  }

  return inputs.clientBusinesses.length > 1 ? "AMBIGUOUS" : "MISSING";
}

function buildIntegrityConfidenceContext(
  issue: FinancialIntegrityIssueRecord,
  inputs: FinancialIntegrityLoadedInputs
) : IntegrityConfidenceContext {
  const invoice = issue.invoiceId ? inputs.invoiceById.get(issue.invoiceId) ?? null : null;
  const payment = issue.invoiceId
    ? inputs.latestSuccessfulPaymentByInvoiceId.get(issue.invoiceId) ?? null
    : null;
  const moneyInRows = issue.invoiceId
    ? inputs.moneyInLedgerRowsByInvoiceId.get(issue.invoiceId) ?? []
    : [];
  const existingIssue = inputs.existingIssuesByFingerprint.get(issue.fingerprint) ?? null;
  const existingMetadata = parseIntegrityMetadata(existingIssue?.metadata);

  return {
    invoice: invoice
      ? {
          id: invoice.id,
          workspaceId: invoice.workspaceId,
          status: invoice.status,
          paymentReference: invoice.paymentReference,
          totalAmount: invoice.totalAmount,
          clientBusinessId: invoice.clientBusinessId,
        }
      : null,
    latestSuccessfulPayment: payment
      ? {
          id: payment.id,
          workspaceId: payment.workspaceId,
          reference: payment.reference,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          status: payment.status,
          providerTransactionId: payment.providerTransactionId,
        }
      : null,
    paymentCount: issue.invoiceId ? (inputs.paymentsByInvoiceId.get(issue.invoiceId) ?? []).length : 0,
    successfulPaymentCount: issue.invoiceId
      ? (inputs.successfulPaymentsByInvoiceId.get(issue.invoiceId) ?? []).length
      : 0,
    moneyInLedgerRows: moneyInRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      amountMinor: row.amountMinor,
      currency: row.currency,
      clientBusinessId: row.clientBusinessId,
    })),
    taxRecord: issue.invoiceId
      ? (() => {
          const taxRecord = inputs.taxRecordByInvoiceId.get(issue.invoiceId) ?? null;
          return taxRecord ? { id: taxRecord.id } : null;
        })()
      : null,
    singleActiveClientBusinessId: inputs.singleActiveClientBusinessId,
    clientBusinessResolution: readClientBusinessResolution(invoice, inputs),
    exactPaymentReferenceMatch: hasExactPaymentReferenceMatch(invoice, payment),
    conflictingPaymentReference: hasConflictingPaymentReference(invoice, payment),
    workspaceConsistent:
      (!invoice || invoice.workspaceId === inputs.workspaceId) &&
      (!payment || payment.workspaceId === inputs.workspaceId),
    previousIssue: existingIssue
      ? {
          status: existingIssue.status,
          autoRepairable: existingIssue.autoRepairable,
          repairAttempted: parseBooleanMetadata(existingMetadata, "repairAttempted") ?? false,
          repairSucceeded: parseBooleanMetadata(existingMetadata, "repairSucceeded") ?? false,
          repairFailureCount: parseRepairFailureCount(existingMetadata),
        }
      : null,
  };
}

function applyRepairConfidenceToIssue(
  issue: FinancialIntegrityIssueRecord,
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord {
  const existingIssue = inputs.existingIssuesByFingerprint.get(issue.fingerprint) ?? null;
  const existingMetadata = parseIntegrityMetadata(existingIssue?.metadata);
  const context = buildIntegrityConfidenceContext(issue, inputs);
  const confidence = scoreIntegrityIssue(issue, context);
  const recommendation =
    confidence.recommendation ?? getRepairRecommendation(issue, context);
  const autoRepairEligible = issue.autoRepairable && recommendation === "AUTO_FIX";
  const mergedMetadata = {
    ...existingMetadata,
    ...issue.metadata,
  };

  return {
    ...issue,
    autoRepairable: autoRepairEligible,
    repairConfidenceScore: clampRepairConfidenceScore(confidence.confidenceScore),
    repairConfidenceLabel: confidence.confidenceLabel,
    repairRecommendation: recommendation,
    repairReasoning: confidence.reasoning,
    repairConfidenceFactors: confidence.factors,
    suggestedFix: confidence.suggestedFix,
    metadata: {
      ...mergedMetadata,
      repairConfidenceScore: clampRepairConfidenceScore(confidence.confidenceScore),
      repairConfidenceLabel: confidence.confidenceLabel,
      repairRecommendation: recommendation,
      repairReasoning: confidence.reasoning,
      repairConfidenceFactors: confidence.factors,
      suggestedFix: confidence.suggestedFix,
      lastConfidenceComputedAt: inputs.scannedAt.toISOString(),
      autoRepairEligible: autoRepairEligible,
    },
  };
}

function resolveIssueAlertReference(issue: FinancialIntegrityIssueRecord) {
  const metadataReference =
    typeof issue.metadata.reference === "string"
      ? issue.metadata.reference
      : typeof issue.metadata.paymentReference === "string"
        ? issue.metadata.paymentReference
        : null;

  if (metadataReference) return metadataReference;
  if (issue.invoiceId) return buildInvoiceLedgerReference(issue.invoiceId);
  return null;
}

function getStartOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function getIssueSortRank(issue: FinancialIntegrityIssueRecord) {
  if (issue.severity === "critical") return 0;
  return 1;
}

function requiresHumanReview(issue: {
  status: FinancialIntegrityIssueStatus;
  repairRecommendation: FinancialIntegrityRepairRecommendation;
}) {
  return issue.status === "MANUAL_REVIEW" || issue.repairRecommendation === "REVIEW_AND_FIX";
}

function sortIssues(issues: FinancialIntegrityIssueRecord[]) {
  return [...issues].sort((left, right) => {
    const rankDiff = getIssueSortRank(left) - getIssueSortRank(right);
    if (rankDiff !== 0) return rankDiff;
    if ((left.invoiceId ?? 0) !== (right.invoiceId ?? 0)) {
      return (left.invoiceId ?? 0) - (right.invoiceId ?? 0);
    }
    return left.issueType.localeCompare(right.issueType);
  });
}

export async function loadFinancialIntegrityInputs(
  workspaceId: number
): Promise<FinancialIntegrityLoadedInputs> {
  if (!Number.isFinite(workspaceId) || !Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw new Error("A valid workspaceId is required for financial integrity checks.");
  }

  const scannedAt = new Date();
  const [workspace, clientBusinesses, invoices, payments, taxRecords, existingIssues] =
    await withPrismaRetry(
      () =>
        Promise.all([
          prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true },
          }),
          prisma.clientBusiness.findMany({
            where: {
              workspaceId,
              archivedAt: null,
            },
            orderBy: { id: "asc" },
            select: { id: true },
          }),
          prisma.invoice.findMany({
            where: { workspaceId },
            orderBy: { id: "asc" },
            select: {
              id: true,
              workspaceId: true,
              clientBusinessId: true,
              invoiceNumber: true,
              status: true,
              paymentReference: true,
              paidAt: true,
              totalAmount: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          prisma.payment.findMany({
            where: { workspaceId },
            orderBy: { id: "asc" },
            select: {
              id: true,
              workspaceId: true,
              invoiceId: true,
              provider: true,
              reference: true,
              amountMinor: true,
              currency: true,
              status: true,
              providerTransactionId: true,
              paidAt: true,
              payload: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          prisma.taxRecord.findMany({
            where: {
              workspaceId,
              invoiceId: {
                not: null,
              },
            },
            orderBy: { id: "asc" },
            select: {
              id: true,
              invoiceId: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          prisma.integrityIssue.findMany({
            where: { workspaceId },
            orderBy: { id: "asc" },
            select: {
              fingerprint: true,
              status: true,
              autoRepairable: true,
              metadata: true,
              lastDetectedAt: true,
              updatedAt: true,
            },
          }),
        ]),
      { label: "financialIntegrity.loadCore" }
    );

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} was not found for financial integrity checks.`);
  }

  const clientBusinessIds = clientBusinesses.map((business) => business.id);
  const ledgerTransactions =
    clientBusinessIds.length > 0
      ? await withPrismaRetry(
          () =>
            prisma.ledgerTransaction.findMany({
              where: {
                clientBusinessId: {
                  in: clientBusinessIds,
                },
                reference: {
                  startsWith: "INVOICE:",
                },
              },
              orderBy: { id: "asc" },
              select: {
                id: true,
                clientBusinessId: true,
                reference: true,
                direction: true,
                amountMinor: true,
                currency: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
          { label: "financialIntegrity.loadLedgerTransactions" }
        )
      : [];

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paymentsByInvoiceId = new Map<number, IntegrityPaymentRow[]>();
  const successfulPaymentsByInvoiceId = new Map<number, IntegrityPaymentRow[]>();
  const latestSuccessfulPaymentByInvoiceId = new Map<number, IntegrityPaymentRow>();
  const taxRecordByInvoiceId = new Map<number, IntegrityTaxRecordRow>();
  const ledgerRowsByInvoiceId = new Map<number, IntegrityLedgerRow[]>();
  const moneyInLedgerRowsByInvoiceId = new Map<number, IntegrityLedgerRow[]>();
  const existingIssuesByFingerprint = new Map(
    existingIssues.map((issue) => [issue.fingerprint, issue])
  );

  for (const payment of payments) {
    const nextPayments = paymentsByInvoiceId.get(payment.invoiceId) ?? [];
    nextPayments.push(payment);
    paymentsByInvoiceId.set(payment.invoiceId, nextPayments);

    if (payment.status === "SUCCESS") {
      const nextSuccessful = successfulPaymentsByInvoiceId.get(payment.invoiceId) ?? [];
      nextSuccessful.push(payment);
      nextSuccessful.sort(sortPaymentsNewestFirst);
      successfulPaymentsByInvoiceId.set(payment.invoiceId, nextSuccessful);
      latestSuccessfulPaymentByInvoiceId.set(payment.invoiceId, nextSuccessful[0]);
    }
  }

  for (const taxRecord of taxRecords) {
    if (taxRecord.invoiceId) {
      taxRecordByInvoiceId.set(taxRecord.invoiceId, taxRecord);
    }
  }

  for (const ledgerTransaction of ledgerTransactions) {
    const invoiceId = parseInvoiceIdFromReference(ledgerTransaction.reference);
    if (!invoiceId) continue;

    const nextLedgerRows = ledgerRowsByInvoiceId.get(invoiceId) ?? [];
    nextLedgerRows.push(ledgerTransaction);
    ledgerRowsByInvoiceId.set(invoiceId, nextLedgerRows);

    if (ledgerTransaction.direction === "MONEY_IN") {
      const nextMoneyIn = moneyInLedgerRowsByInvoiceId.get(invoiceId) ?? [];
      nextMoneyIn.push(ledgerTransaction);
      moneyInLedgerRowsByInvoiceId.set(invoiceId, nextMoneyIn);
    }
  }

  return {
    workspaceId,
    workspaceName: workspace.name,
    scannedAt,
    invoices,
    payments,
    taxRecords,
    ledgerTransactions,
    clientBusinesses,
    existingIssuesByFingerprint,
    singleActiveClientBusinessId:
      clientBusinesses.length === 1 ? clientBusinesses[0].id : null,
    invoiceById,
    paymentsByInvoiceId,
    successfulPaymentsByInvoiceId,
    latestSuccessfulPaymentByInvoiceId,
    taxRecordByInvoiceId,
    ledgerRowsByInvoiceId,
    moneyInLedgerRowsByInvoiceId,
  };
}

export function scanPaidInvoicesMissingPayment(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .filter((invoice) => invoice.status === "PAID")
    .filter((invoice) => (inputs.paymentsByInvoiceId.get(invoice.id) ?? []).length === 0)
    .map((invoice) =>
      createIssue({
        issueType: "PAID_INVOICE_MISSING_PAYMENT",
        severity: "warning",
        autoRepairable: true,
        repairAction: "BACKFILL_PAYMENT",
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: null,
        ledgerTransactionId: null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Paid invoice ${invoice.invoiceNumber} is missing a Payment row.`,
        detailLines: [
          `Invoice #${invoice.invoiceNumber} is marked PAID but has no Payment records.`,
          `Invoice total: ${invoice.totalAmount} minor units.`,
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceStatus: invoice.status,
          invoiceUpdatedAt: invoice.updatedAt.toISOString(),
        },
      })
    );
}

export function scanPaidInvoicesMissingLedger(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .filter((invoice) => invoice.status === "PAID")
    .filter((invoice) => (inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id) ?? []).length === 0)
    .map((invoice) => {
      const hasResolvableClientBusiness = Boolean(
        invoice.clientBusinessId ?? inputs.singleActiveClientBusinessId
      );

      return createIssue({
        issueType: "PAID_INVOICE_MISSING_LEDGER",
        severity: hasResolvableClientBusiness ? "critical" : "warning",
        autoRepairable: hasResolvableClientBusiness,
        repairAction: hasResolvableClientBusiness ? "CREATE_LEDGER_ENTRY" : null,
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id)?.id ?? null,
        ledgerTransactionId: null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Paid invoice ${invoice.invoiceNumber} has no MONEY_IN ledger entry.`,
        detailLines: [
          `Expected a MONEY_IN ledger row with reference ${buildInvoiceLedgerReference(invoice.id)}.`,
          hasResolvableClientBusiness
            ? "Client business mapping is available, so the ledger row can be auto-recreated."
            : "Client business mapping is missing, so this invoice needs manual review.",
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          reference: buildInvoiceLedgerReference(invoice.id),
          clientBusinessId: invoice.clientBusinessId,
          singleActiveClientBusinessId: inputs.singleActiveClientBusinessId,
        },
      });
    });
}

export function scanSuccessfulPaymentsMissingPaidInvoiceStatus(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .filter((invoice) => invoice.status !== "PAID")
    .map((invoice) => ({
      invoice,
      payment: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id) ?? null,
    }))
    .filter(
      (entry): entry is { invoice: IntegrityInvoiceRow; payment: IntegrityPaymentRow } =>
        Boolean(entry.payment)
    )
    .map(({ invoice, payment }) =>
      createIssue({
        issueType: "SUCCESSFUL_PAYMENT_INVOICE_NOT_PAID",
        severity: "critical",
        autoRepairable: true,
        repairAction: "PROCESS_VERIFIED_PAYMENT",
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        ledgerTransactionId: null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Invoice ${invoice.invoiceNumber} has a successful payment but is still ${invoice.status}.`,
        detailLines: [
          `Payment ${payment.reference} is marked SUCCESS for invoice #${invoice.invoiceNumber}.`,
          `Invoice status is ${invoice.status} and should be PAID.`,
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceStatus: invoice.status,
          paymentReference: payment.reference,
          paymentStatus: payment.status,
          paymentPaidAt: getPaymentEventTimestamp(payment).toISOString(),
        },
      })
    );
}

export function scanPaymentsMissingTaxSync(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .map((invoice) => ({
      invoice,
      payment: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id) ?? null,
      taxRecord: inputs.taxRecordByInvoiceId.get(invoice.id) ?? null,
    }))
    .filter(
      (
        entry
      ): entry is {
        invoice: IntegrityInvoiceRow;
        payment: IntegrityPaymentRow;
        taxRecord: null;
      } => Boolean(entry.payment) && !entry.taxRecord
    )
    .map(({ invoice, payment }) =>
      createIssue({
        issueType: "PAYMENT_TAX_SYNC_MISSING",
        severity: "critical",
        autoRepairable: true,
        repairAction: "PROCESS_VERIFIED_PAYMENT",
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        ledgerTransactionId:
          inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id)?.[0]?.id ?? null,
        taxRecordId: null,
        summary: `Invoice ${invoice.invoiceNumber} has a successful payment but no tax record.`,
        detailLines: [
          `Payment ${payment.reference} is marked SUCCESS for invoice #${invoice.invoiceNumber}.`,
          "The invoice payment flow should have created a TaxRecord but none was found.",
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          paymentReference: payment.reference,
          paymentStatus: payment.status,
        },
      })
    );
}

export function scanLedgerExistsInvoiceNotPaid(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .filter((invoice) => invoice.status !== "PAID")
    .map((invoice) => ({
      invoice,
      payment: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id) ?? null,
      moneyInRows: inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id) ?? [],
    }))
    .filter(({ moneyInRows }) => moneyInRows.length > 0)
    .map(({ invoice, payment, moneyInRows }) =>
      createIssue({
        issueType: "LEDGER_INVOICE_NOT_PAID",
        severity: "critical",
        autoRepairable: Boolean(payment),
        repairAction: payment ? "PROCESS_VERIFIED_PAYMENT" : null,
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: payment?.id ?? null,
        ledgerTransactionId: moneyInRows[0]?.id ?? null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Invoice ${invoice.invoiceNumber} has a MONEY_IN ledger entry but is still ${invoice.status}.`,
        detailLines: [
          `Found ${moneyInRows.length} MONEY_IN ledger row(s) for ${buildInvoiceLedgerReference(invoice.id)}.`,
          payment
            ? `Payment ${payment.reference} is also marked SUCCESS, so the invoice can be repaired through the shared payment flow.`
            : "No successful payment row was found, so this ledger/invoice mismatch needs manual review.",
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceStatus: invoice.status,
          reference: buildInvoiceLedgerReference(invoice.id),
          ledgerEntryIds: moneyInRows.map((row) => row.id),
          paymentReference: payment?.reference ?? null,
        },
      })
    );
}

export function scanPaymentsMissingLedgerSync(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .filter((invoice) => invoice.status !== "PAID")
    .map((invoice) => ({
      invoice,
      payment: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id) ?? null,
      moneyInRows: inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id) ?? [],
    }))
    .filter(
      (
        entry
      ): entry is {
        invoice: IntegrityInvoiceRow;
        payment: IntegrityPaymentRow;
        moneyInRows: IntegrityLedgerRow[];
      } => Boolean(entry.payment) && entry.moneyInRows.length === 0
    )
    .map(({ invoice, payment }) =>
      createIssue({
        issueType: "PAYMENT_LEDGER_SYNC_MISSING",
        severity: "critical",
        autoRepairable: true,
        repairAction: "PROCESS_VERIFIED_PAYMENT",
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        ledgerTransactionId: null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Invoice ${invoice.invoiceNumber} has a successful payment but no MONEY_IN ledger entry.`,
        detailLines: [
          `Payment ${payment.reference} is marked SUCCESS for invoice #${invoice.invoiceNumber}.`,
          `No MONEY_IN ledger row was found for ${buildInvoiceLedgerReference(invoice.id)}.`,
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceStatus: invoice.status,
          paymentReference: payment.reference,
          reference: buildInvoiceLedgerReference(invoice.id),
        },
      })
    );
}

export function scanOrphanPayments(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.payments
    .filter((payment) => !inputs.invoiceById.has(payment.invoiceId))
    .map((payment) =>
      createIssue({
        issueType: "ORPHAN_PAYMENT",
        severity: "critical",
        autoRepairable: false,
        repairAction: null,
        workspaceId: inputs.workspaceId,
        invoiceId: null,
        paymentId: payment.id,
        ledgerTransactionId: null,
        taxRecordId: null,
        summary: `Payment ${payment.reference} does not resolve to an invoice in this workspace.`,
        detailLines: [
          `Payment ${payment.reference} points to invoice id ${payment.invoiceId}, but no matching invoice record was loaded for workspace ${inputs.workspaceId}.`,
          "This usually indicates cross-workspace drift or data corruption and needs manual review.",
        ],
        metadata: {
          paymentReference: payment.reference,
          provider: payment.provider,
          paymentStatus: payment.status,
          orphanInvoiceId: payment.invoiceId,
        },
      })
    );
}

export function scanDuplicateLedgerRows(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  const issues: FinancialIntegrityIssueRecord[] = [];

  for (const invoice of inputs.invoices) {
    const moneyInRows = inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id) ?? [];
    if (moneyInRows.length <= 1) {
      continue;
    }

    issues.push(
      createIssue({
        issueType: "DUPLICATE_LEDGER_ROWS",
        severity: "critical",
        autoRepairable: false,
        repairAction: null,
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id)?.id ?? null,
        ledgerTransactionId: moneyInRows[0]?.id ?? null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Invoice ${invoice.invoiceNumber} has duplicate MONEY_IN ledger rows.`,
        detailLines: [
          `Found ${moneyInRows.length} MONEY_IN ledger rows for ${buildInvoiceLedgerReference(invoice.id)}.`,
          "Duplicate ledger entries are never auto-deleted and must be reviewed by an admin.",
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          reference: buildInvoiceLedgerReference(invoice.id),
          ledgerEntryIds: moneyInRows.map((row) => row.id),
        },
      })
    );
  }

  return issues;
}

export function scanAmountMismatchIssues(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  const issues: FinancialIntegrityIssueRecord[] = [];

  for (const invoice of inputs.invoices) {
    const detailLines: string[] = [];
    const successfulPayments = inputs.successfulPaymentsByInvoiceId.get(invoice.id) ?? [];
    const moneyInRows = inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id) ?? [];

    for (const payment of successfulPayments) {
      if (payment.amountMinor !== invoice.totalAmount) {
        detailLines.push(
          `Payment ${payment.reference} amount ${payment.amountMinor} does not match invoice total ${invoice.totalAmount}.`
        );
      }
    }

    for (const ledgerRow of moneyInRows) {
      if (ledgerRow.amountMinor !== invoice.totalAmount) {
        detailLines.push(
          `Ledger row #${ledgerRow.id} amount ${ledgerRow.amountMinor} does not match invoice total ${invoice.totalAmount}.`
        );
      }
    }

    if (successfulPayments.length === 1 && moneyInRows.length === 1) {
      const payment = successfulPayments[0];
      const ledgerRow = moneyInRows[0];
      if (payment.amountMinor !== ledgerRow.amountMinor) {
        detailLines.push(
          `Payment ${payment.reference} amount ${payment.amountMinor} does not match ledger row #${ledgerRow.id} amount ${ledgerRow.amountMinor}.`
        );
      }
    }

    if (detailLines.length === 0) {
      continue;
    }

    issues.push(
      createIssue({
        issueType: "AMOUNT_MISMATCH",
        severity: "critical",
        autoRepairable: false,
        repairAction: null,
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: successfulPayments[0]?.id ?? null,
        ledgerTransactionId: moneyInRows[0]?.id ?? null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Invoice ${invoice.invoiceNumber} has mismatched invoice, payment, or ledger amounts.`,
        detailLines,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmountMinor: invoice.totalAmount,
          paymentIds: successfulPayments.map((payment) => payment.id),
          ledgerEntryIds: moneyInRows.map((row) => row.id),
        },
      })
    );
  }

  return issues;
}

export function scanStaleSentInvoicesWithVerifiedPayment(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return inputs.invoices
    .filter((invoice) => invoice.status === "SENT")
    .map((invoice) => ({
      invoice,
      payment: inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id) ?? null,
    }))
    .filter(
      (entry): entry is { invoice: IntegrityInvoiceRow; payment: IntegrityPaymentRow } =>
        Boolean(entry.payment)
    )
    .filter(({ payment }) => {
      return (
        inputs.scannedAt.getTime() - getPaymentEventTimestamp(payment).getTime() >=
        STALE_SENT_INVOICE_THRESHOLD_MS
      );
    })
    .map(({ invoice, payment }) =>
      createIssue({
        issueType: "STALE_SENT_INVOICE_VERIFIED_PAYMENT",
        severity: "critical",
        autoRepairable: true,
        repairAction: "PROCESS_VERIFIED_PAYMENT",
        workspaceId: inputs.workspaceId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        ledgerTransactionId:
          inputs.moneyInLedgerRowsByInvoiceId.get(invoice.id)?.[0]?.id ?? null,
        taxRecordId: inputs.taxRecordByInvoiceId.get(invoice.id)?.id ?? null,
        summary: `Invoice ${invoice.invoiceNumber} is still SENT even though a verified payment already exists.`,
        detailLines: [
          `Payment ${payment.reference} became successful at ${getPaymentEventTimestamp(payment).toISOString()}.`,
          `Invoice status is still SENT more than ${
            STALE_SENT_INVOICE_THRESHOLD_MS / 60000
          } minutes later.`,
        ],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          paymentReference: payment.reference,
          paymentAgeMinutes: Math.round(
            (inputs.scannedAt.getTime() - getPaymentEventTimestamp(payment).getTime()) / 60000
          ),
        },
      })
    );
}

export function scanFinancialIntegrityIssues(
  inputs: FinancialIntegrityLoadedInputs
): FinancialIntegrityIssueRecord[] {
  return sortIssues(
    [
      ...scanPaidInvoicesMissingPayment(inputs),
      ...scanPaidInvoicesMissingLedger(inputs),
      ...scanSuccessfulPaymentsMissingPaidInvoiceStatus(inputs),
      ...scanLedgerExistsInvoiceNotPaid(inputs),
      ...scanPaymentsMissingLedgerSync(inputs),
      ...scanPaymentsMissingTaxSync(inputs),
      ...scanOrphanPayments(inputs),
      ...scanDuplicateLedgerRows(inputs),
      ...scanAmountMismatchIssues(inputs),
      ...scanStaleSentInvoicesWithVerifiedPayment(inputs),
    ].map((issue) => applyRepairConfidenceToIssue(issue, inputs))
  );
}

async function backfillMissingPaymentRow(
  invoice: IntegrityInvoiceRow
): Promise<FinancialIntegrityRepairResult> {
  const reference = invoice.paymentReference?.trim() || `BACKFILL-${invoice.id}`;

  try {
    const existingPayment = await withPrismaRetry(
      () =>
        prisma.payment.findFirst({
          where: { invoiceId: invoice.id },
          select: { id: true },
        }),
      { label: "financialIntegrity.backfillPayment.findExistingPayment" }
    );

    if (existingPayment) {
      return { success: true, repairError: null };
    }

    await withPrismaRetry(
      () =>
        prisma.payment.upsert({
          where: { reference },
          update: {
            invoiceId: invoice.id,
            workspaceId: invoice.workspaceId,
            provider: "MANUAL",
            amountMinor: invoice.totalAmount,
            currency: DEFAULT_INVOICE_CURRENCY,
            status: "SUCCESS",
            paidAt: invoice.paidAt ?? invoice.updatedAt,
            payload: {
              kind: "financial_integrity_backfill",
              source: "manual_backfill",
            },
          },
          create: {
            invoiceId: invoice.id,
            workspaceId: invoice.workspaceId,
            provider: "MANUAL",
            reference,
            amountMinor: invoice.totalAmount,
            currency: DEFAULT_INVOICE_CURRENCY,
            status: "SUCCESS",
            paidAt: invoice.paidAt ?? invoice.updatedAt,
            createdAt: invoice.updatedAt,
            payload: {
              kind: "financial_integrity_backfill",
              source: "manual_backfill",
            },
          },
        }),
      { label: "financialIntegrity.backfillPayment.upsertPayment" }
    );

    await logAudit({
      workspaceId: invoice.workspaceId,
      actorUserId: null,
      action: "FINANCIAL_INTEGRITY_PAYMENT_BACKFILLED",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        reference,
      },
    });

    return { success: true, repairError: null };
  } catch (error) {
    logError("financial-integrity", "Payment backfill failed", error, {
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      reference,
    });
    return {
      success: false,
      repairError: error instanceof Error ? error.message : "Payment backfill failed",
    };
  }
}

async function processVerifiedPaymentRepair(
  invoice: IntegrityInvoiceRow,
  payment: IntegrityPaymentRow
): Promise<FinancialIntegrityRepairResult> {
  try {
    const result = await processInvoicePayment({
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      actorUserId: null,
      paidAt: payment.paidAt ?? payment.updatedAt ?? payment.createdAt,
      amountKobo: payment.amountMinor,
      currency: payment.currency,
      provider: payment.provider,
      paymentReference: payment.reference,
      paymentPayload: (payment.payload ?? null) as Prisma.InputJsonValue | null,
      providerTransactionId: payment.providerTransactionId,
    });

    if ("error" in result) {
      return { success: false, repairError: result.error };
    }

    return { success: true, repairError: null };
  } catch (error) {
    logError("financial-integrity", "Verified payment repair failed", error, {
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      paymentId: payment.id,
      paymentReference: payment.reference,
    });
    return {
      success: false,
      repairError: error instanceof Error ? error.message : "Verified payment repair failed",
    };
  }
}

async function createMissingLedgerEntry(
  invoice: IntegrityInvoiceRow
): Promise<FinancialIntegrityRepairResult> {
  try {
    const resolvedClientBusinessId = await resolveInvoiceClientBusinessId(prisma, {
      workspaceId: invoice.workspaceId,
      existingClientBusinessId: invoice.clientBusinessId ?? null,
    });

    if (!resolvedClientBusinessId) {
      return {
        success: false,
        repairError: "No client business mapping could be resolved for this invoice.",
      };
    }

    const result = await withPrismaRetry(
      () =>
        createIncomeEntryFromInvoice(prisma, {
          invoiceId: invoice.id,
          clientBusinessId: resolvedClientBusinessId,
        }),
      { label: "financialIntegrity.createMissingLedgerEntry" }
    );

    if (!result.entryId && result.skippedReason) {
      return { success: false, repairError: result.skippedReason };
    }

    await logAudit({
      workspaceId: invoice.workspaceId,
      actorUserId: null,
      action: "FINANCIAL_INTEGRITY_LEDGER_REPAIRED",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        ledgerEntryId: result.entryId,
      },
    });

    return { success: Boolean(result.entryId), repairError: null };
  } catch (error) {
    logError("financial-integrity", "Ledger repair failed", error, {
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
    });
    return {
      success: false,
      repairError: error instanceof Error ? error.message : "Ledger repair failed",
    };
  }
}

type FinancialIntegrityRepairContext = {
  processedPaymentRepairs: Map<number, Promise<FinancialIntegrityRepairResult>>;
};

async function repairScannedFinancialIntegrityIssue(
  issue: FinancialIntegrityIssueRecord,
  inputs: FinancialIntegrityLoadedInputs,
  repairContext: FinancialIntegrityRepairContext
): Promise<FinancialIntegrityHandledIssue> {
  if (!issue.autoRepairable) {
    return {
      ...issue,
      status: "MANUAL_REVIEW",
      autoRepaired: false,
      repairError: null,
    };
  }

  const invoice = issue.invoiceId ? inputs.invoiceById.get(issue.invoiceId) ?? null : null;
  if (!invoice) {
    return {
      ...issue,
      status: "MANUAL_REVIEW",
      autoRepaired: false,
      repairError: "Invoice could not be loaded for repair.",
    };
  }

  let repairResult: FinancialIntegrityRepairResult;

  switch (issue.repairAction) {
    case "BACKFILL_PAYMENT":
      repairResult = await backfillMissingPaymentRow(invoice);
      break;
    case "PROCESS_VERIFIED_PAYMENT": {
      const latestSuccessfulPayment =
        inputs.latestSuccessfulPaymentByInvoiceId.get(invoice.id) ?? null;
      if (!latestSuccessfulPayment) {
        repairResult = {
          success: false,
          repairError: "No successful payment row was found for this invoice.",
        };
        break;
      }

      const cachedRepair =
        repairContext.processedPaymentRepairs.get(invoice.id) ??
        processVerifiedPaymentRepair(invoice, latestSuccessfulPayment);
      repairContext.processedPaymentRepairs.set(invoice.id, cachedRepair);
      repairResult = await cachedRepair;
      break;
    }
    case "CREATE_LEDGER_ENTRY":
      repairResult = await createMissingLedgerEntry(invoice);
      break;
    default:
      repairResult = {
        success: false,
        repairError: "No repair action is configured for this issue.",
      };
      break;
  }

  if (!repairResult.success) {
    logWarn("financial-integrity", "Financial integrity issue needs manual review", {
      fingerprint: issue.fingerprint,
      issueType: issue.issueType,
      workspaceId: issue.workspaceId,
      invoiceId: issue.invoiceId,
      repairAction: issue.repairAction,
      repairError: repairResult.repairError,
    });
  }

  return {
    ...issue,
    status: repairResult.success ? "AUTO_REPAIRED" : "MANUAL_REVIEW",
    autoRepaired: repairResult.success,
    repairError: repairResult.repairError,
  };
}

async function persistFinancialIntegrityIssues(input: {
  workspaceId: number;
  workspaceName: string;
  handledIssues: FinancialIntegrityHandledIssue[];
  scannedAt: Date;
  resolveMissingFingerprints?: boolean;
}) {
  const activeFingerprints = input.handledIssues.map((issue) => issue.fingerprint);
  const existingIssues =
    activeFingerprints.length > 0
      ? await withPrismaRetry(
          () =>
            prisma.integrityIssue.findMany({
              where: {
                workspaceId: input.workspaceId,
                fingerprint: {
                  in: activeFingerprints,
                },
              },
              select: {
                fingerprint: true,
                status: true,
                metadata: true,
              },
            }),
          { label: "financialIntegrity.loadExistingIssuesForPersist" }
        )
      : [];

  const existingIssueByFingerprint = new Map(
    existingIssues.map((issue) => [issue.fingerprint, issue])
  );
  const issuePersistencePlans = input.handledIssues.map((issue) => {
    const existingIssue = existingIssueByFingerprint.get(issue.fingerprint) ?? null;
    const existingMetadata = parseIntegrityMetadata(
      (existingIssue?.metadata ?? null) as Prisma.JsonValue | null
    );
    const previousRepairFailureCount = parseRepairFailureCount(existingMetadata);
    const repairAttempted = issue.autoRepaired || issue.repairError !== null;
    const repairSucceeded = issue.autoRepaired;
    const repairFailureCount = repairAttempted
      ? repairSucceeded
        ? 0
        : previousRepairFailureCount + 1
      : previousRepairFailureCount;

    return {
      issue,
      existingIssue,
      previousRepairFailureCount,
      repairAttempted,
      repairSucceeded,
      repairFailureCount,
      metadata: {
        ...issue.metadata,
        repairAction: issue.repairAction,
        autoRepaired: issue.autoRepaired,
        repairError: issue.repairError,
        repairAttempted,
        repairSucceeded,
        repairFailureCount,
      } satisfies Record<string, unknown>,
    };
  });

  await withPrismaRetry(
    () =>
      prisma.$transaction(
        async (tx) => {
          for (const plan of issuePersistencePlans) {
            const issue = plan.issue;
            await tx.integrityIssue.upsert({
              where: { fingerprint: issue.fingerprint },
              update: {
                invoiceId: issue.invoiceId,
                paymentId: issue.paymentId,
                ledgerTransactionId: issue.ledgerTransactionId,
                taxRecordId: issue.taxRecordId,
                severity: issue.severity,
                status: issue.status,
                autoRepairable: issue.autoRepairable,
                summary: issue.summary,
                details: serializeDetails(issue.detailLines),
                metadata: plan.metadata,
                lastDetectedAt: input.scannedAt,
                autoRepairedAt: issue.autoRepaired ? input.scannedAt : null,
                resolvedAt: issue.autoRepaired ? input.scannedAt : null,
              },
              create: {
                workspaceId: input.workspaceId,
                invoiceId: issue.invoiceId,
                paymentId: issue.paymentId,
                ledgerTransactionId: issue.ledgerTransactionId,
                taxRecordId: issue.taxRecordId,
                fingerprint: issue.fingerprint,
                issueType: issue.issueType,
                severity: issue.severity,
                status: issue.status,
                autoRepairable: issue.autoRepairable,
                summary: issue.summary,
                details: serializeDetails(issue.detailLines),
                metadata: plan.metadata,
                firstDetectedAt: input.scannedAt,
                lastDetectedAt: input.scannedAt,
                autoRepairedAt: issue.autoRepaired ? input.scannedAt : null,
                resolvedAt: issue.autoRepaired ? input.scannedAt : null,
              },
            });
          }

          if (input.resolveMissingFingerprints !== false) {
            if (activeFingerprints.length > 0) {
              await tx.integrityIssue.updateMany({
                where: {
                  workspaceId: input.workspaceId,
                  fingerprint: {
                    notIn: activeFingerprints,
                  },
                  status: {
                    in: ["OPEN", "MANUAL_REVIEW"],
                  },
                },
                data: {
                  status: "RESOLVED",
                  resolvedAt: input.scannedAt,
                },
              });
            } else {
              await tx.integrityIssue.updateMany({
                where: {
                  workspaceId: input.workspaceId,
                  status: {
                    in: ["OPEN", "MANUAL_REVIEW"],
                  },
                },
                data: {
                  status: "RESOLVED",
                  resolvedAt: input.scannedAt,
                },
              });
            }
          }
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        }
      ),
    { label: "financialIntegrity.persistIssues" }
  );

  for (const plan of issuePersistencePlans) {
    const repeatedAutoRepairFailure =
      plan.repairAttempted &&
      !plan.repairSucceeded &&
      plan.repairFailureCount >= 2 &&
      plan.previousRepairFailureCount < 2;
    const severity = getIntegrityAlertSeverity({
      issueType: plan.issue.issueType,
      issueSeverity: plan.issue.severity,
      repeatedAutoRepairFailure,
    });
    const statusChanged =
      !plan.existingIssue || plan.existingIssue.status !== plan.issue.status;

    if (!statusChanged && !repeatedAutoRepairFailure) {
      continue;
    }

    try {
      await sendIntegrityAlert({
        issueType: plan.issue.issueType,
        severity,
        invoiceId: plan.issue.invoiceId,
        workspaceId: input.workspaceId,
        workspaceName: input.workspaceName,
        reference: resolveIssueAlertReference(plan.issue),
        autoRepairable: plan.issue.autoRepairable,
        repairAttempted: plan.repairAttempted,
        repairSucceeded: plan.repairAttempted ? plan.repairSucceeded : null,
        createdAt: input.scannedAt.toISOString(),
        summary: plan.issue.summary,
        detailLines: plan.issue.detailLines,
        dedupeKey: plan.issue.fingerprint,
        alertStateKey: repeatedAutoRepairFailure
          ? `${plan.issue.status}:REPEATED_AUTO_REPAIR_FAILURE`
          : plan.issue.status,
        metadata: {
          repairFailureCount: plan.repairFailureCount,
          repeatedAutoRepairFailure,
          repairError: plan.issue.repairError,
        },
      });
    } catch (error) {
      logError("financial-integrity", "Integrity alert dispatch failed", error, {
        workspaceId: input.workspaceId,
        issueType: plan.issue.issueType,
        fingerprint: plan.issue.fingerprint,
      });
    }
  }
}

function buildFinancialIntegrityRunSummary(input: {
  mode: "scan" | "repair";
  workspaceId: number;
  workspaceName: string;
  scannedAt: Date;
  handledIssues: FinancialIntegrityHandledIssue[];
  healthSnapshot: FinancialHealthSnapshot;
}): FinancialIntegrityRunSummary {
  const manualReview = input.handledIssues.filter(
    (issue) => requiresHumanReview(issue)
  ).length;
  const skipped = input.handledIssues.filter((issue) => !issue.autoRepairable).length;
  const breakdownByType = input.handledIssues.reduce<
    FinancialIntegrityRunSummary["breakdownByType"]
  >(
    (accumulator, issue) => {
      const current = accumulator[issue.issueType];
      current.issuesFound += 1;
      current.autoRepaired += issue.autoRepaired ? 1 : 0;
      current.manualReview += requiresHumanReview(issue) ? 1 : 0;
      current.skipped += issue.autoRepairable ? 0 : 1;
      return accumulator;
    },
    {
      PAID_INVOICE_MISSING_PAYMENT: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      PAID_INVOICE_MISSING_LEDGER: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      SUCCESSFUL_PAYMENT_INVOICE_NOT_PAID: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      LEDGER_INVOICE_NOT_PAID: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      PAYMENT_LEDGER_SYNC_MISSING: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      PAYMENT_TAX_SYNC_MISSING: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      ORPHAN_PAYMENT: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      DUPLICATE_LEDGER_ROWS: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      AMOUNT_MISMATCH: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
      STALE_SENT_INVOICE_VERIFIED_PAYMENT: {
        issuesFound: 0,
        autoRepaired: 0,
        manualReview: 0,
        skipped: 0,
      },
    }
  );

  return {
    mode: input.mode,
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    scannedAt: input.scannedAt.toISOString(),
    issuesFound: input.handledIssues.length,
    autoRepaired: input.handledIssues.filter((issue) => issue.autoRepaired).length,
    manualReview,
    skipped,
    flaggedForManualReview: manualReview,
    healthScoreAfterRun: input.healthSnapshot.score,
    healthLabelAfterRun: input.healthSnapshot.label,
    breakdownByType,
    issues: input.handledIssues.map((issue) => ({
      fingerprint: issue.fingerprint,
      issueType: issue.issueType,
      severity: issue.severity,
      status: issue.status,
      autoRepairable: issue.autoRepairable,
      repairConfidenceScore: issue.repairConfidenceScore,
      repairConfidenceLabel: issue.repairConfidenceLabel,
      repairRecommendation: issue.repairRecommendation,
      autoRepaired: issue.autoRepaired,
      summary: issue.summary,
      detailLines: issue.detailLines,
      repairReasoning: issue.repairReasoning,
      suggestedFix: issue.suggestedFix,
      invoiceId: issue.invoiceId,
      paymentId: issue.paymentId,
      ledgerTransactionId: issue.ledgerTransactionId,
      taxRecordId: issue.taxRecordId,
      repairAction: issue.repairAction,
      repairError: issue.repairError,
    })),
  };
}

async function scanAndPersistFinancialIntegrityWorkspace(input: {
  workspaceId: number;
  actorUserId?: number | null;
  autoRepair: boolean;
  action: string;
}): Promise<{
  loadedInputs: FinancialIntegrityLoadedInputs;
  handledIssues: FinancialIntegrityHandledIssue[];
}> {
  logInfo("financial-integrity", "Financial integrity scan started", {
    workspaceId: input.workspaceId,
    autoRepair: input.autoRepair,
  });

  const loadedInputs = await loadFinancialIntegrityInputs(input.workspaceId);
  const scannedIssues = scanFinancialIntegrityIssues(loadedInputs);
  const handledIssues: FinancialIntegrityHandledIssue[] = [];

  if (input.autoRepair) {
    const repairContext: FinancialIntegrityRepairContext = {
      processedPaymentRepairs: new Map(),
    };

    for (const issue of scannedIssues) {
      handledIssues.push(
        await repairScannedFinancialIntegrityIssue(issue, loadedInputs, repairContext)
      );
    }
  } else {
    for (const issue of scannedIssues) {
      handledIssues.push({
        ...issue,
        status:
          issue.repairRecommendation === "MANUAL_ONLY" ? "MANUAL_REVIEW" : "OPEN",
        autoRepaired: false,
        repairError: null,
      });
    }
  }

  await persistFinancialIntegrityIssues({
    workspaceId: input.workspaceId,
    workspaceName: loadedInputs.workspaceName,
    handledIssues,
    scannedAt: loadedInputs.scannedAt,
    resolveMissingFingerprints: true,
  });

  await logAudit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    metadata: {
      issuesFound: handledIssues.length,
      autoRepaired: handledIssues.filter((issue) => issue.autoRepaired).length,
      flaggedForManualReview: handledIssues.filter(
        (issue) => requiresHumanReview(issue)
      ).length,
    },
  });

  logInfo("financial-integrity", "Financial integrity scan completed", {
    workspaceId: input.workspaceId,
    autoRepair: input.autoRepair,
    issuesFound: handledIssues.length,
    autoRepaired: handledIssues.filter((issue) => issue.autoRepaired).length,
    flaggedForManualReview: handledIssues.filter(
      (issue) => requiresHumanReview(issue)
    ).length,
  });

  return { loadedInputs, handledIssues };
}

async function scanFinancialIntegrityWorkspace(input: {
  workspaceId: number;
}): Promise<{
  loadedInputs: FinancialIntegrityLoadedInputs;
  handledIssues: FinancialIntegrityHandledIssue[];
}> {
  logInfo("financial-integrity", "Financial integrity dry-run started", {
    workspaceId: input.workspaceId,
    autoRepair: false,
  });

  const loadedInputs = await loadFinancialIntegrityInputs(input.workspaceId);
  const handledIssues = scanFinancialIntegrityIssues(loadedInputs).map(
    (issue): FinancialIntegrityHandledIssue => ({
      ...issue,
      status: issue.repairRecommendation === "MANUAL_ONLY" ? "MANUAL_REVIEW" : "OPEN",
      autoRepaired: false,
      repairError: null,
    })
  );

  logInfo("financial-integrity", "Financial integrity dry-run completed", {
    workspaceId: input.workspaceId,
    autoRepair: false,
    issuesFound: handledIssues.length,
    autoRepaired: 0,
    flaggedForManualReview: handledIssues.filter(
      (issue) => requiresHumanReview(issue)
    ).length,
  });

  return {
    loadedInputs,
    handledIssues,
  };
}

export async function runFinancialIntegritySweep(input: {
  workspaceId: number;
  actorUserId?: number | null;
}): Promise<FinancialIntegrityRunSummary> {
  const result = await scanAndPersistFinancialIntegrityWorkspace({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    autoRepair: true,
    action: "FINANCIAL_INTEGRITY_SWEEP_COMPLETED",
  });
  const healthSnapshot = await getFinancialHealthSnapshot({
    accessibleWorkspaceIds: [result.loadedInputs.workspaceId],
    selectedWorkspaceId: result.loadedInputs.workspaceId,
  });

  return buildFinancialIntegrityRunSummary({
    mode: "repair",
    workspaceId: result.loadedInputs.workspaceId,
    workspaceName: result.loadedInputs.workspaceName,
    scannedAt: result.loadedInputs.scannedAt,
    handledIssues: result.handledIssues,
    healthSnapshot,
  });
}

export async function scanFinancialIntegrity(input: {
  workspaceId: number;
  actorUserId?: number | null;
  options: {
    autoRepair: boolean;
  };
}): Promise<FinancialIntegrityRunSummary> {
  if (!input.options.autoRepair) {
    const result = await scanFinancialIntegrityWorkspace({
      workspaceId: input.workspaceId,
    });
    const healthSnapshot = await getFinancialHealthSnapshot({
      accessibleWorkspaceIds: [result.loadedInputs.workspaceId],
      selectedWorkspaceId: result.loadedInputs.workspaceId,
    });

    return buildFinancialIntegrityRunSummary({
      mode: "scan",
      workspaceId: result.loadedInputs.workspaceId,
      workspaceName: result.loadedInputs.workspaceName,
      scannedAt: result.loadedInputs.scannedAt,
      handledIssues: result.handledIssues,
      healthSnapshot,
    });
  }

  return runFinancialIntegritySweep({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
  });
}

export async function recheckFinancialIntegrityWorkspace(input: {
  workspaceId: number;
  actorUserId?: number | null;
}): Promise<FinancialIntegrityRunSummary> {
  const result = await scanAndPersistFinancialIntegrityWorkspace({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    autoRepair: false,
    action: "FINANCIAL_INTEGRITY_RECHECK_COMPLETED",
  });
  const healthSnapshot = await getFinancialHealthSnapshot({
    accessibleWorkspaceIds: [result.loadedInputs.workspaceId],
    selectedWorkspaceId: result.loadedInputs.workspaceId,
  });

  return buildFinancialIntegrityRunSummary({
    mode: "scan",
    workspaceId: result.loadedInputs.workspaceId,
    workspaceName: result.loadedInputs.workspaceName,
    scannedAt: result.loadedInputs.scannedAt,
    handledIssues: result.handledIssues,
    healthSnapshot,
  });
}

export async function validateInvoiceIntegrity(input: { invoiceId: number }) {
  if (!Number.isFinite(input.invoiceId) || !Number.isInteger(input.invoiceId) || input.invoiceId <= 0) {
    throw new Error("A valid invoiceId is required for invoice integrity validation.");
  }

  const invoice = await withPrismaRetry(
    () =>
      prisma.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          workspaceId: true,
          invoiceNumber: true,
          status: true,
        },
      }),
    { label: "financialIntegrity.validateInvoiceIntegrity.loadInvoice" }
  );

  if (!invoice) {
    throw new Error(`Invoice ${input.invoiceId} was not found for integrity validation.`);
  }

  const loadedInputs = await loadFinancialIntegrityInputs(invoice.workspaceId);
  const issues = scanFinancialIntegrityIssues(loadedInputs).filter(
    (issue) => issue.invoiceId === invoice.id
  );

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    workspaceId: invoice.workspaceId,
    invoiceStatus: invoice.status,
    scannedAt: loadedInputs.scannedAt.toISOString(),
    issuesFound: issues.length,
    autoRepairable: issues.filter((issue) => issue.autoRepairable).length,
    manualReviewOnly: issues.filter((issue) => !issue.autoRepairable).length,
    issues,
  };
}

export async function repairFinancialIntegrityIssue(input: {
  issue: FinancialIntegrityIssueRecord;
  actorUserId?: number | null;
}) {
  const loadedInputs = await loadFinancialIntegrityInputs(input.issue.workspaceId);
  const scannedIssue =
    scanFinancialIntegrityIssues(loadedInputs).find(
      (issue) => issue.fingerprint === input.issue.fingerprint
    ) ?? null;

  if (!scannedIssue) {
    return {
      repaired: false,
      message: "The issue is no longer present.",
      workspaceId: input.issue.workspaceId,
      handledIssue: null,
    };
  }

  const handledIssue = await repairScannedFinancialIntegrityIssue(scannedIssue, loadedInputs, {
    processedPaymentRepairs: new Map(),
  });

  await persistFinancialIntegrityIssues({
    workspaceId: input.issue.workspaceId,
    workspaceName: loadedInputs.workspaceName,
    handledIssues: [handledIssue],
    scannedAt: loadedInputs.scannedAt,
    resolveMissingFingerprints: false,
  });

  await recheckFinancialIntegrityWorkspace({
    workspaceId: input.issue.workspaceId,
    actorUserId: input.actorUserId ?? null,
  });

  return {
    repaired: handledIssue.autoRepaired,
    message: handledIssue.autoRepaired
      ? "Auto-repair completed successfully."
      : handledIssue.repairError ?? "This issue requires manual review.",
    workspaceId: input.issue.workspaceId,
    handledIssue,
  };
}

export async function repairInvoicePaymentChain(input: {
  invoiceId: number;
  actorUserId?: number | null;
}) {
  const invoiceIntegrity = await validateInvoiceIntegrity({ invoiceId: input.invoiceId });
  const repairContext: FinancialIntegrityRepairContext = {
    processedPaymentRepairs: new Map(),
  };
  const handledIssues: FinancialIntegrityHandledIssue[] = [];

  if (invoiceIntegrity.issues.length === 0) {
    return {
      invoiceId: input.invoiceId,
      workspaceId: invoiceIntegrity.workspaceId,
      issuesFound: 0,
      autoRepaired: 0,
      manualReview: 0,
      skipped: 0,
      issues: [] as FinancialIntegrityHandledIssue[],
    };
  }

  const loadedInputs = await loadFinancialIntegrityInputs(invoiceIntegrity.workspaceId);

  for (const issue of invoiceIntegrity.issues) {
    const scannedIssue =
      scanFinancialIntegrityIssues(loadedInputs).find(
        (entry) => entry.fingerprint === issue.fingerprint
      ) ?? issue;

    if (scannedIssue.autoRepairable) {
      handledIssues.push(
        await repairScannedFinancialIntegrityIssue(scannedIssue, loadedInputs, repairContext)
      );
      continue;
    }

    handledIssues.push({
      ...scannedIssue,
      status: "MANUAL_REVIEW",
      autoRepaired: false,
      repairError: null,
    });
  }

  await persistFinancialIntegrityIssues({
    workspaceId: invoiceIntegrity.workspaceId,
    workspaceName: loadedInputs.workspaceName,
    handledIssues,
    scannedAt: loadedInputs.scannedAt,
    resolveMissingFingerprints: false,
  });

  await recheckFinancialIntegrityWorkspace({
    workspaceId: invoiceIntegrity.workspaceId,
    actorUserId: input.actorUserId ?? null,
  });

  return {
    invoiceId: input.invoiceId,
    workspaceId: invoiceIntegrity.workspaceId,
    issuesFound: handledIssues.length,
    autoRepaired: handledIssues.filter((issue) => issue.autoRepaired).length,
    manualReview: handledIssues.filter((issue) => issue.status === "MANUAL_REVIEW").length,
    skipped: handledIssues.filter((issue) => !issue.autoRepairable).length,
    issues: handledIssues,
  };
}

function resolveIssueReference(input: {
  issueType: string;
  invoiceId: number | null;
  paymentReference: string | null;
  invoicePaymentReference: string | null;
  metadata: Record<string, unknown>;
}) {
  const metadataReference =
    typeof input.metadata.reference === "string"
      ? input.metadata.reference
      : typeof input.metadata.paymentReference === "string"
        ? input.metadata.paymentReference
        : null;

  if (metadataReference) return metadataReference;
  if (input.paymentReference) return input.paymentReference;
  if (input.invoicePaymentReference) return input.invoicePaymentReference;
  if (input.invoiceId) return buildInvoiceLedgerReference(input.invoiceId);
  return null;
}

function buildIssueLinks(input: {
  invoiceId: number | null;
  paymentId: number | null;
  ledgerTransactionId: number | null;
}) {
  return {
    invoiceHref: input.invoiceId ? `/dashboard/invoices/${input.invoiceId}` : null,
    paymentHref: input.paymentId
      ? `/dashboard/system-monitor?paymentId=${input.paymentId}`
      : null,
    ledgerHref: input.ledgerTransactionId
      ? `/dashboard/banking/reconcile?ledgerId=${input.ledgerTransactionId}`
      : null,
  };
}

async function getIntegrityIssueById(issueId: number) {
  return withPrismaRetry(
    () =>
      prisma.integrityIssue.findUnique({
        where: { id: issueId },
      }),
    { label: "financialIntegrity.getIssueById" }
  );
}

export async function getFinancialIntegrityIssuesSnapshot(input: {
  accessibleWorkspaceIds: number[];
  selectedWorkspaceId?: number | null;
  issueType?: string | null;
  severity?: string | null;
  status?: string | null;
  autoRepairable?: string | boolean | null;
}): Promise<FinancialIntegrityIssuesSnapshot> {
  const accessibleWorkspaceIds = Array.from(
    new Set(
      input.accessibleWorkspaceIds.filter(
        (workspaceId) => Number.isFinite(workspaceId) && workspaceId > 0
      )
    )
  );

  if (accessibleWorkspaceIds.length === 0) {
    return buildFinancialIntegrityIssuesFallbackSnapshot({
      workspaceIds: [],
      selectedWorkspaceId: null,
    });
  }

  const selectedWorkspaceId =
    input.selectedWorkspaceId && accessibleWorkspaceIds.includes(input.selectedWorkspaceId)
      ? input.selectedWorkspaceId
      : null;
  const scopedWorkspaceIds = selectedWorkspaceId
    ? [selectedWorkspaceId]
    : accessibleWorkspaceIds;
  const startOfToday = getStartOfToday();
  const autoRepairableFilter =
    input.autoRepairable === true ||
    input.autoRepairable === "true" ||
    input.autoRepairable === "yes"
      ? true
      : input.autoRepairable === false ||
          input.autoRepairable === "false" ||
          input.autoRepairable === "no"
        ? false
        : undefined;

  const tableWhere: Prisma.IntegrityIssueWhereInput = {
    workspaceId: {
      in: scopedWorkspaceIds,
    },
    issueType: input.issueType?.trim() ? input.issueType.trim() : undefined,
    severity: input.severity?.trim() ? input.severity.trim() : undefined,
    status: input.status?.trim() ? input.status.trim() : undefined,
    autoRepairable: autoRepairableFilter,
  };
  const summaryWhere: Prisma.IntegrityIssueWhereInput = {
    workspaceId: {
      in: scopedWorkspaceIds,
    },
  };

  const [issueRows, openIssues, criticalIssues, autoRepairedToday, manualReviewRequired] =
    await withPrismaRetry(
      () =>
        Promise.all([
          prisma.integrityIssue.findMany({
            where: tableWhere,
            orderBy: [{ lastDetectedAt: "desc" }, { id: "desc" }],
            include: {
              workspace: {
                select: { name: true },
              },
            },
            take: 250,
          }),
          prisma.integrityIssue.count({
            where: {
              ...summaryWhere,
              status: {
                in: ["OPEN", "MANUAL_REVIEW"],
              },
            },
          }),
          prisma.integrityIssue.count({
            where: {
              ...summaryWhere,
              status: {
                in: ["OPEN", "MANUAL_REVIEW"],
              },
              severity: "critical",
            },
          }),
          prisma.integrityIssue.count({
            where: {
              ...summaryWhere,
              status: "AUTO_REPAIRED",
              autoRepairedAt: {
                gte: startOfToday,
              },
            },
          }),
          prisma.integrityIssue.count({
            where: {
              ...summaryWhere,
              status: "MANUAL_REVIEW",
            },
          }),
        ]),
      { label: "financialIntegrity.getIssuesSnapshot" }
    );

  const invoiceIds = Array.from(
    new Set(issueRows.map((row) => row.invoiceId).filter((value): value is number => Boolean(value)))
  );
  const paymentIds = Array.from(
    new Set(issueRows.map((row) => row.paymentId).filter((value): value is number => Boolean(value)))
  );

  const [invoices, payments] = await withPrismaRetry(
    () =>
      Promise.all([
        invoiceIds.length > 0
          ? prisma.invoice.findMany({
              where: {
                id: { in: invoiceIds },
              },
              select: {
                id: true,
                invoiceNumber: true,
                paymentReference: true,
              },
            })
          : Promise.resolve([]),
        paymentIds.length > 0
          ? prisma.payment.findMany({
              where: {
                id: { in: paymentIds },
              },
              select: {
                id: true,
                reference: true,
              },
            })
          : Promise.resolve([]),
      ]),
    { label: "financialIntegrity.getIssueRelations" }
  );

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      workspaceIds: scopedWorkspaceIds,
      selectedWorkspaceId,
    },
    summary: {
      openIssues,
      criticalIssues,
      autoRepairedToday,
      manualReviewRequired,
    },
    issues: issueRows.map((row) => {
      const metadata = parseIntegrityMetadata(row.metadata);
      const invoice = row.invoiceId ? invoiceById.get(row.invoiceId) ?? null : null;
      const payment = row.paymentId ? paymentById.get(row.paymentId) ?? null : null;
      const links = buildIssueLinks({
        invoiceId: row.invoiceId,
        paymentId: row.paymentId,
        ledgerTransactionId: row.ledgerTransactionId,
      });

      return {
        id: row.id,
        issueType: row.issueType,
        severity: row.severity,
        status: row.status,
        autoRepairable: row.autoRepairable,
        confidenceScore: parseRepairConfidenceScore(metadata),
        repairConfidenceScore: parseRepairConfidenceScore(metadata),
        repairConfidenceLabel: parseRepairConfidenceLabel(metadata),
        repairRecommendation: parseRepairRecommendation(metadata),
        repairReasoning: parseStringArrayMetadata(metadata, "repairReasoning"),
        repairConfidenceFactors: parseRecordMetadata(
          metadata,
          "repairConfidenceFactors"
        ),
        suggestedFix: parseStringMetadata(metadata, "suggestedFix"),
        lastConfidenceComputedAt: parseStringMetadata(
          metadata,
          "lastConfidenceComputedAt"
        ),
        repairAttempted: parseBooleanMetadata(metadata, "repairAttempted") ?? false,
        repairSucceeded: parseBooleanMetadata(metadata, "repairSucceeded"),
        summary: row.summary,
        details: row.details,
        demoLabel: parseStringMetadata(metadata, "demoLabel"),
        invoiceId: row.invoiceId,
        paymentId: row.paymentId,
        ledgerTransactionId: row.ledgerTransactionId,
        taxRecordId: row.taxRecordId,
        reference: resolveIssueReference({
          issueType: row.issueType,
          invoiceId: row.invoiceId,
          paymentReference: payment?.reference ?? null,
          invoicePaymentReference: invoice?.paymentReference ?? null,
          metadata,
        }),
        workspaceId: row.workspaceId,
        workspaceName: row.workspace.name,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastDetectedAt: row.lastDetectedAt.toISOString(),
        autoRepairedAt: row.autoRepairedAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        invoiceHref: links.invoiceHref,
        paymentHref: links.paymentHref,
        ledgerHref: links.ledgerHref,
      } satisfies FinancialIntegrityAdminIssueRow;
    }),
  };
}

export async function repairFinancialIntegrityIssueById(input: {
  issueId: number;
  actorUserId?: number | null;
}) {
  const issue = await getIntegrityIssueById(input.issueId);
  if (!issue) {
    throw new Error(`Integrity issue ${input.issueId} was not found.`);
  }

  const loadedInputs = await loadFinancialIntegrityInputs(issue.workspaceId);
  const scannedIssue = scanFinancialIntegrityIssues(loadedInputs).find(
    (entry) => entry.fingerprint === issue.fingerprint
  );

  if (!scannedIssue) {
    await resolveFinancialIntegrityIssueById({
      issueId: issue.id,
      actorUserId: input.actorUserId ?? null,
      mode: "resolve",
    });

    return {
      repaired: false,
      message: "The issue is no longer present and was marked resolved.",
      workspaceId: issue.workspaceId,
    };
  }

  if (!scannedIssue.autoRepairable) {
    return {
      repaired: false,
      message: "This issue requires manual investigation and cannot be auto-repaired.",
      workspaceId: issue.workspaceId,
    };
  }

  const handledIssue = await repairScannedFinancialIntegrityIssue(
    scannedIssue,
    loadedInputs,
    {
      processedPaymentRepairs: new Map(),
    }
  );

  await persistFinancialIntegrityIssues({
    workspaceId: issue.workspaceId,
    workspaceName: loadedInputs.workspaceName,
    handledIssues: [handledIssue],
    scannedAt: loadedInputs.scannedAt,
    resolveMissingFingerprints: false,
  });

  await recheckFinancialIntegrityWorkspace({
    workspaceId: issue.workspaceId,
    actorUserId: input.actorUserId ?? null,
  });

  return {
    repaired: handledIssue.autoRepaired,
    message: handledIssue.autoRepaired
      ? "Auto-repair completed successfully."
      : handledIssue.repairError ?? "Auto-repair was not able to resolve this issue.",
    workspaceId: issue.workspaceId,
  };
}

export async function recheckFinancialIntegrityIssueById(input: {
  issueId: number;
  actorUserId?: number | null;
}) {
  const issue = await getIntegrityIssueById(input.issueId);
  if (!issue) {
    throw new Error(`Integrity issue ${input.issueId} was not found.`);
  }

  await recheckFinancialIntegrityWorkspace({
    workspaceId: issue.workspaceId,
    actorUserId: input.actorUserId ?? null,
  });

  return {
    rechecked: true,
    workspaceId: issue.workspaceId,
  };
}

export async function resolveFinancialIntegrityIssueById(input: {
  issueId: number;
  actorUserId?: number | null;
  mode: "resolve" | "ignore";
}) {
  const issue = await getIntegrityIssueById(input.issueId);
  if (!issue) {
    throw new Error(`Integrity issue ${input.issueId} was not found.`);
  }

  const metadata = parseIntegrityMetadata(issue.metadata);
  const now = new Date();
  const nextStatus = input.mode === "ignore" ? "IGNORED" : "RESOLVED";

  await withPrismaRetry(
    () =>
      prisma.integrityIssue.update({
        where: { id: input.issueId },
        data: {
          status: nextStatus,
          resolvedAt: now,
          metadata: {
            ...metadata,
            resolutionMode: input.mode,
            resolutionActorUserId: input.actorUserId ?? null,
            resolutionTimestamp: now.toISOString(),
          },
        },
      }),
    { label: "financialIntegrity.resolveIssueById" }
  );

  await logAudit({
    workspaceId: issue.workspaceId,
    actorUserId: input.actorUserId ?? null,
    action:
      input.mode === "ignore"
        ? "FINANCIAL_INTEGRITY_ISSUE_IGNORED"
        : "FINANCIAL_INTEGRITY_ISSUE_RESOLVED",
    metadata: {
      issueId: issue.id,
      issueType: issue.issueType,
      fingerprint: issue.fingerprint,
    },
  });

  return {
    resolved: true,
    workspaceId: issue.workspaceId,
    status: nextStatus,
  };
}
