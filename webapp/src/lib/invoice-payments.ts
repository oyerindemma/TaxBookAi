import "server-only";

import crypto from "crypto";
import type { Invoice, Prisma, PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import {
  getInvoiceDetailById,
  getWorkspaceInvoiceDetail,
  type WorkspaceInvoiceDetail,
} from "@/lib/invoice-records";
import { isSuccessfulInvoicePaymentReplay } from "@/lib/invoice-payment-idempotency";
import { createIncomeEntryFromInvoice } from "@/lib/ledger";
import { logError } from "@/lib/logger";
import { logPaymentLifecycleEvent } from "@/lib/payment-lifecycle-logs";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { resolveInvoiceClientBusinessId } from "@/lib/invoices";

type InvoiceIncomeRecordTarget = Pick<
  Invoice,
  "id" | "invoiceNumber" | "totalAmount" | "taxAmount" | "workspaceId"
>;

export type InvoicePaymentLinkResult = {
  paymentReference: string;
  paymentUrl: string;
  provider: "stub";
};

export type InvoicePaymentPostingStatus = {
  invoiceStatus: WorkspaceInvoiceDetail["status"];
  paymentReference: string | null;
  alreadyProcessed: boolean;
  ledgerEntryId: number | null;
  taxRecordId: number | null;
  ledgerDirection: string | null;
  ledgerReference: string | null;
  ledgerEntryCreated: boolean;
  ledgerConfirmed: boolean;
  taxSyncRan: boolean;
  taxConfirmed: boolean;
  needsReview: boolean;
  integrityIssues: string[];
};

export type InvoicePaymentPostingSnapshot = {
  invoice: WorkspaceInvoiceDetail;
  confirmation: InvoicePaymentPostingStatus;
};

type InvoicePaymentProvider = "PAYSTACK" | "STUB" | "MANUAL";
type PrismaExecutor = Prisma.TransactionClient | PrismaClient;

type CheckoutInvoiceTarget = {
  id: number;
  workspaceId: number;
  status: Invoice["status"];
  totalAmount: number;
  paymentReference: string | null;
  paymentUrl: string | null;
};

export type PaymentIntegrityValidationResult = {
  invoiceId: number;
  workspaceId: number;
  ok: boolean;
  needsReview: boolean;
  expectedReference: string;
  expectedAmountMinor: number;
  successfulPaymentCount: number;
  ledgerEntryCount: number;
  successfulPaymentIds: number[];
  ledgerEntryIds: number[];
  issues: string[];
};

const PAYMENT_INTEGRITY_REVIEW_PREFIX = "[PAYMENT_INTEGRITY_NEEDS_REVIEW]";
const DEFAULT_INVOICE_CURRENCY = "NGN";

function computeTax(amountKobo: number, taxRate: number) {
  const computedTax = Math.round(amountKobo * (taxRate / 100));
  const netAmount = Math.round(amountKobo - computedTax);
  return { computedTax, netAmount };
}

export function buildInvoicePaymentReference(invoiceId: number) {
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PAY-${invoiceId}-${suffix}`;
}

export function buildInvoicePaymentUrl(requestUrl: string, paymentReference: string) {
  const origin = new URL(requestUrl).origin;
  return `${origin}/pay/${encodeURIComponent(paymentReference)}`;
}

export function createStubInvoicePaymentLink(input: {
  invoiceId: number;
  requestUrl: string;
}): InvoicePaymentLinkResult {
  const paymentReference = buildInvoicePaymentReference(input.invoiceId);
  return {
    paymentReference,
    paymentUrl: buildInvoicePaymentUrl(input.requestUrl, paymentReference),
    provider: "stub",
  };
}

export async function ensureInvoiceIncomeTaxRecord(
  tx: Prisma.TransactionClient,
  input: {
    invoice: InvoiceIncomeRecordTarget;
    actorUserId: number;
    occurredOn?: Date;
  }
) {
  const { invoice, actorUserId, occurredOn = new Date() } = input;

  const existingRecord = await tx.taxRecord.findUnique({
    where: { invoiceId: invoice.id },
    select: { id: true },
  });
  if (existingRecord) {
    return existingRecord.id;
  }

  const effectiveTaxRate =
    invoice.totalAmount > 0
      ? Number(((invoice.taxAmount / invoice.totalAmount) * 100).toFixed(2))
      : 0;
  const computed = computeTax(invoice.totalAmount, effectiveTaxRate);

  const record = await tx.taxRecord.create({
    data: {
      userId: actorUserId,
      workspaceId: invoice.workspaceId,
      invoiceId: invoice.id,
      kind: "INCOME",
      amountKobo: invoice.totalAmount,
      taxRate: effectiveTaxRate,
      computedTax: computed.computedTax,
      netAmount: computed.netAmount,
      occurredOn,
      description: `Invoice #${invoice.invoiceNumber}`,
      source: "invoice",
    },
  });

  return record.id;
}

async function resolveInvoiceActorUserId(
  tx: Prisma.TransactionClient,
  workspaceId: number
) {
  const membership = await tx.workspaceMember.findFirst({
    where: { workspaceId },
    orderBy: { id: "asc" },
    select: { userId: true },
  });

  return membership?.userId ?? null;
}

export async function confirmInvoicePaymentByReference(input: {
  paymentReference: string;
  provider?: string | null;
  paidAt?: Date;
  amountKobo?: number | null;
  currency?: string | null;
  eventId?: string | null;
  paymentPayload?: Prisma.InputJsonValue | null;
  providerTransactionId?: string | null;
}) {
  const resolvedInvoice = await resolveInvoicePaymentTargetByReference(
    input.paymentReference
  );
  if (!resolvedInvoice) {
    return { error: "Invoice not found" } as const;
  }

  return processInvoicePayment({
    invoiceId: resolvedInvoice.invoiceId,
    workspaceId: resolvedInvoice.workspaceId,
    actorUserId: null,
    paidAt: input.paidAt,
    amountKobo: input.amountKobo,
    currency: input.currency ?? null,
    provider: input.provider ?? "STUB",
    eventId: input.eventId ?? null,
    paymentReference: input.paymentReference,
    paymentPayload: input.paymentPayload ?? null,
    providerTransactionId: input.providerTransactionId ?? null,
  });
}

type ConfirmInvoicePaymentRecordInput = {
  invoiceId?: number;
  paymentReference?: string;
  workspaceId?: number | null;
  actorUserId?: number | null;
  paidAt?: Date;
  amountKobo?: number | null;
  currency?: string | null;
  provider?: string | null;
  paymentPayload?: Prisma.InputJsonValue | null;
  providerTransactionId?: string | null;
};

type ProcessInvoicePaymentInput = {
  invoiceId: number;
  workspaceId?: number | null;
  actorUserId?: number | null;
  paidAt?: Date;
  amountKobo?: number | null;
  currency?: string | null;
  provider?: string | null;
  eventId?: string | null;
  paymentReference?: string | null;
  paymentPayload?: Prisma.InputJsonValue | null;
  providerTransactionId?: string | null;
};

type InvoicePaymentProcessError = {
  error: string;
};

type InvoicePaymentProcessSuccess = {
  invoice: Invoice;
  taxRecordId: number | null;
  ledgerEntryId: number | null;
  alreadyPaid: boolean;
  paymentId: number | null;
  alreadyProcessed: boolean;
  integrityValidation: PaymentIntegrityValidationResult | null;
};

type BuildInvoicePaymentPostingSnapshotInput = {
  invoiceId: number;
  workspaceId?: number | null;
  alreadyProcessed: boolean;
  ledgerEntryId?: number | null;
  taxRecordId?: number | null;
};

export type ResolvedInvoicePaymentTarget = {
  paymentId: number | null;
  invoiceId: number;
  workspaceId: number;
};

async function getInvoicePaymentDetailForSnapshot(input: {
  invoiceId: number;
  workspaceId?: number | null;
}) {
  if (input.workspaceId) {
    return getWorkspaceInvoiceDetail(input.workspaceId, input.invoiceId);
  }

  return getInvoiceDetailById(input.invoiceId);
}

function normalizePaymentProvider(provider?: string | null): InvoicePaymentProvider {
  const normalized = String(provider ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "PAYSTACK" || normalized === "STUB" || normalized === "MANUAL") {
    return normalized;
  }

  return "MANUAL";
}

function normalizeCurrency(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;
}

function buildInvoiceLedgerReference(invoiceId: number) {
  return `INVOICE:${invoiceId}`;
}

function stripPaymentIntegrityReviewNote(notes: string | null | undefined) {
  if (!notes?.trim()) return null;

  const cleaned = notes
    .split("\n")
    .filter((line) => !line.trim().startsWith(PAYMENT_INTEGRITY_REVIEW_PREFIX))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || null;
}

function buildPaymentIntegrityReviewNote(issues: string[]) {
  return `${PAYMENT_INTEGRITY_REVIEW_PREFIX} ${issues.join(" | ")}`;
}

function extractPaymentIntegrityIssues(notes: string | null | undefined) {
  if (!notes?.trim()) return [];

  const reviewLine = notes
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(PAYMENT_INTEGRITY_REVIEW_PREFIX));

  if (!reviewLine) return [];

  const detail = reviewLine.replace(PAYMENT_INTEGRITY_REVIEW_PREFIX, "").trim();
  if (!detail) return [];

  return detail
    .split(" | ")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function upsertPaymentIntegrityReviewNote(
  notes: string | null | undefined,
  issues: string[]
) {
  const baseNotes = stripPaymentIntegrityReviewNote(notes);
  const reviewNote = buildPaymentIntegrityReviewNote(issues);
  return baseNotes ? `${baseNotes}\n\n${reviewNote}` : reviewNote;
}

export async function validatePaymentIntegrity(
  invoiceId: number
): Promise<PaymentIntegrityValidationResult> {
  const invoice = await withPrismaRetry(
    () =>
      prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          workspaceId: true,
          totalAmount: true,
          notes: true,
        },
      }),
    { label: "validatePaymentIntegrity.findInvoice" }
  );

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} was not found for payment integrity validation.`);
  }

  const expectedReference = buildInvoiceLedgerReference(invoice.id);
  const [successfulPayments, ledgerEntries] = await withPrismaRetry(
    () =>
      Promise.all([
        prisma.payment.findMany({
          where: {
            invoiceId: invoice.id,
            status: "SUCCESS",
          },
          select: {
            id: true,
            amountMinor: true,
            reference: true,
          },
          orderBy: { id: "asc" },
        }),
        prisma.ledgerTransaction.findMany({
          where: {
            reference: expectedReference,
          },
          select: {
            id: true,
            direction: true,
            amountMinor: true,
            reference: true,
          },
          orderBy: { id: "asc" },
        }),
      ]),
    { label: "validatePaymentIntegrity.loadRelations" }
  );

  const issues: string[] = [];
  const moneyInEntries = ledgerEntries.filter((entry) => entry.direction === "MONEY_IN");

  if (successfulPayments.length === 0) {
    issues.push("No successful payment records were found for this paid invoice.");
  } else if (successfulPayments.length > 1) {
    issues.push(
      `Found ${successfulPayments.length} successful payment records; expected exactly 1.`
    );
  }

  for (const payment of successfulPayments) {
    if (payment.amountMinor !== invoice.totalAmount) {
      issues.push(
        `Payment #${payment.id} amount ${payment.amountMinor} does not match invoice total ${invoice.totalAmount}.`
      );
    }
  }

  if (moneyInEntries.length !== 1) {
    issues.push(
      `Found ${moneyInEntries.length} MONEY_IN ledger entries for ${expectedReference}; expected exactly 1.`
    );
  }

  if (ledgerEntries.length !== moneyInEntries.length) {
    issues.push(
      `Found ${ledgerEntries.length - moneyInEntries.length} non-MONEY_IN ledger entries using ${expectedReference}.`
    );
  }

  if (moneyInEntries.length === 1) {
    const entry = moneyInEntries[0];
    if (entry.amountMinor !== invoice.totalAmount) {
      issues.push(
        `Ledger entry #${entry.id} amount ${entry.amountMinor} does not match invoice total ${invoice.totalAmount}.`
      );
    }
    if (entry.reference !== expectedReference) {
      issues.push(
        `Ledger entry #${entry.id} reference ${entry.reference ?? "null"} does not match ${expectedReference}.`
      );
    }
  }

  const needsReview = issues.length > 0;
  const nextNotes = needsReview
    ? upsertPaymentIntegrityReviewNote(invoice.notes, issues)
    : stripPaymentIntegrityReviewNote(invoice.notes);

  if ((nextNotes ?? null) !== (invoice.notes ?? null)) {
    await withPrismaRetry(
      () =>
        prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            notes: nextNotes,
          },
        }),
      { label: "validatePaymentIntegrity.updateNotes" }
    );
  }

  if (needsReview) {
    logError(
      "payments",
      "Invoice payment integrity mismatch detected",
      new Error(issues.join(" | ")),
      {
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        expectedReference,
        expectedAmountMinor: invoice.totalAmount,
        successfulPaymentIds: successfulPayments.map((payment) => payment.id),
        ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
      }
    );

    await logAudit({
      workspaceId: invoice.workspaceId,
      actorUserId: null,
      action: "INVOICE_PAYMENT_INTEGRITY_NEEDS_REVIEW",
      metadata: {
        invoiceId: invoice.id,
        expectedReference,
        expectedAmountMinor: invoice.totalAmount,
        successfulPaymentIds: successfulPayments.map((payment) => payment.id),
        ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
        issues,
      },
    });
  }

  return {
    invoiceId: invoice.id,
    workspaceId: invoice.workspaceId,
    ok: !needsReview,
    needsReview,
    expectedReference,
    expectedAmountMinor: invoice.totalAmount,
    successfulPaymentCount: successfulPayments.length,
    ledgerEntryCount: moneyInEntries.length,
    successfulPaymentIds: successfulPayments.map((payment) => payment.id),
    ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
    issues,
  };
}

export async function resolveInvoicePaymentTargetByReference(
  reference: string
): Promise<ResolvedInvoicePaymentTarget | null> {
  const payment = await withPrismaRetry(
    () =>
      prisma.payment.findUnique({
        where: { reference },
        select: {
          id: true,
          invoiceId: true,
          workspaceId: true,
        },
      }),
    { label: "resolveInvoicePaymentTargetByReference.findPayment" }
  );

  if (payment) {
    return {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      workspaceId: payment.workspaceId,
    };
  }

  const invoice = await withPrismaRetry(
    () =>
      prisma.invoice.findFirst({
        where: { paymentReference: reference },
        select: {
          id: true,
          workspaceId: true,
        },
      }),
    { label: "resolveInvoicePaymentTargetByReference.findInvoice" }
  );

  if (!invoice) {
    return null;
  }

  return {
    paymentId: null,
    invoiceId: invoice.id,
    workspaceId: invoice.workspaceId,
  };
}

async function upsertInvoicePaymentRecordWithExecutor(
  executor: PrismaExecutor,
  input: {
    invoiceId: number;
    workspaceId: number;
    reference: string;
    amountMinor: number;
    provider: InvoicePaymentProvider;
    status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELED";
    currency?: string | null;
    payload?: Prisma.InputJsonValue | null;
    providerTransactionId?: string | null;
    paidAt?: Date | null;
  }
) {
  const payment = await executor.payment.upsert({
    where: { reference: input.reference },
    update: {
      invoiceId: input.invoiceId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "NGN",
      status: input.status,
      providerTransactionId: input.providerTransactionId ?? undefined,
      paidAt: input.paidAt ?? undefined,
      payload: input.payload ?? undefined,
    },
    create: {
      invoiceId: input.invoiceId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "NGN",
      status: input.status,
      providerTransactionId: input.providerTransactionId ?? null,
      paidAt: input.paidAt ?? null,
      payload: input.payload ?? undefined,
    },
    select: { id: true },
  });

  return payment.id;
}

export async function upsertInvoicePaymentRecord(input: {
  invoiceId: number;
  workspaceId: number;
  reference: string;
  amountMinor: number;
  provider: InvoicePaymentProvider;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELED";
  currency?: string | null;
  payload?: Prisma.InputJsonValue | null;
  providerTransactionId?: string | null;
  paidAt?: Date | null;
}) {
  return withPrismaRetry(
    () => upsertInvoicePaymentRecordWithExecutor(prisma, input),
    { label: "upsertInvoicePaymentRecord" }
  );
}

export async function getInvoicePaymentReplayStateByReference(input: {
  reference: string;
  providerTransactionId?: string | null;
}) {
  const existingPayment = await withPrismaRetry(
    () =>
      prisma.payment.findUnique({
        where: { reference: input.reference },
        select: {
          id: true,
          invoiceId: true,
          workspaceId: true,
          status: true,
          providerTransactionId: true,
        },
      }),
    { label: "getInvoicePaymentReplayStateByReference" }
  );

  return {
    existingPayment,
    replay: isSuccessfulInvoicePaymentReplay({
      existingPayment,
      providerTransactionId: input.providerTransactionId ?? null,
    }),
  };
}

export async function prepareInvoiceCheckoutState(input: {
  invoice: CheckoutInvoiceTarget;
  paymentPageBaseUrl: string;
  provider: InvoicePaymentProvider;
  source: string;
  callbackUrl: string;
  payload?: Prisma.InputJsonValue | null;
}) {
  if (input.invoice.status === "PAID") {
    throw new Error("This invoice has already been paid.");
  }

  const paymentReference =
    input.invoice.paymentReference ?? buildInvoicePaymentReference(input.invoice.id);
  const paymentUrl =
    input.invoice.paymentUrl ??
    buildInvoicePaymentUrl(input.paymentPageBaseUrl, paymentReference);

  const paymentId = await withPrismaRetry(
    () =>
      prisma.$transaction(
        async (tx) => {
          if (
            input.invoice.paymentReference !== paymentReference ||
            input.invoice.paymentUrl !== paymentUrl
          ) {
            await tx.invoice.update({
              where: { id: input.invoice.id },
              data: {
                paymentReference,
                paymentUrl,
              },
            });
          }

          return upsertInvoicePaymentRecordWithExecutor(tx, {
            invoiceId: input.invoice.id,
            workspaceId: input.invoice.workspaceId,
            reference: paymentReference,
            amountMinor: input.invoice.totalAmount,
            currency: "NGN",
            provider: input.provider,
            status: "PENDING",
            payload:
              input.payload ??
              ({
                kind: "invoice_checkout_pending",
                source: input.source,
                callbackUrl: input.callbackUrl,
              } as Prisma.InputJsonValue),
          });
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        }
      ),
    { label: "prepareInvoiceCheckoutState" }
  );

  return {
    paymentId,
    paymentReference,
    paymentUrl,
  };
}

function parseMetadataObject(value: unknown) {
  if (!value) return null;

  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>)
    : null;
}

function parseMetadataInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateInvoiceGatewayTransaction(input: {
  transaction: {
    reference: string;
    amount: number;
    currency?: unknown;
    metadata?: unknown;
  };
  expectedReference: string;
  expectedInvoiceId: number;
  expectedWorkspaceId?: number | null;
  expectedCurrency?: string | null;
}) {
  if (input.transaction.reference.trim() !== input.expectedReference) {
    return {
      ok: false as const,
      error: "The gateway reference does not match this invoice.",
    };
  }

  if (!Number.isFinite(input.transaction.amount) || input.transaction.amount <= 0) {
    return {
      ok: false as const,
      error: "Invalid Paystack amount.",
    };
  }

  const expectedCurrency =
    normalizeCurrency(input.expectedCurrency) ?? DEFAULT_INVOICE_CURRENCY;
  const transactionCurrency = normalizeCurrency(input.transaction.currency);
  if (transactionCurrency && transactionCurrency !== expectedCurrency) {
    return {
      ok: false as const,
      error: `The verified gateway transaction currency ${transactionCurrency} does not match ${expectedCurrency}.`,
    };
  }

  const metadata = parseMetadataObject(input.transaction.metadata);
  if (!metadata) {
    return { ok: true as const };
  }

  const kind = parseMetadataString(metadata.kind);
  if (kind && kind !== "invoice_payment") {
    return {
      ok: false as const,
      error: "The verified gateway transaction is not tagged as an invoice payment.",
    };
  }

  const metadataInvoiceId = parseMetadataInteger(metadata.invoiceId);
  if (metadataInvoiceId && metadataInvoiceId !== input.expectedInvoiceId) {
    return {
      ok: false as const,
      error: "The verified gateway transaction does not belong to this invoice.",
    };
  }

  const metadataWorkspaceId = parseMetadataInteger(metadata.workspaceId);
  if (
    metadataWorkspaceId &&
    input.expectedWorkspaceId &&
    metadataWorkspaceId !== input.expectedWorkspaceId
  ) {
    return {
      ok: false as const,
      error: "The verified gateway transaction does not belong to this workspace.",
    };
  }

  const metadataPaymentReference = parseMetadataString(
    metadata.paymentReference ?? metadata.reference
  );
  if (metadataPaymentReference && metadataPaymentReference !== input.expectedReference) {
    return {
      ok: false as const,
      error: "The verified gateway metadata does not match this invoice reference.",
    };
  }

  const metadataCurrency = normalizeCurrency(metadata.currency);
  if (metadataCurrency && metadataCurrency !== expectedCurrency) {
    return {
      ok: false as const,
      error: `The verified gateway metadata currency ${metadataCurrency} does not match ${expectedCurrency}.`,
    };
  }

  return { ok: true as const };
}

export async function buildInvoicePaymentPostingSnapshot(
  input: BuildInvoicePaymentPostingSnapshotInput
): Promise<InvoicePaymentPostingSnapshot | null> {
  const invoice = await withPrismaRetry(
    () =>
      getInvoicePaymentDetailForSnapshot({
        invoiceId: input.invoiceId,
        workspaceId: input.workspaceId ?? null,
      }),
    { label: "buildInvoicePaymentPostingSnapshot.loadInvoice" }
  );

  if (!invoice) {
    return null;
  }

  const ledgerRow = await withPrismaRetry(
    () =>
      input.ledgerEntryId
        ? prisma.ledgerTransaction.findUnique({
            where: { id: input.ledgerEntryId },
            select: {
              id: true,
              direction: true,
              reference: true,
            },
          })
        : invoice.ledgerEntry?.reference
          ? prisma.ledgerTransaction.findFirst({
              where: {
                reference: invoice.ledgerEntry.reference,
              },
              select: {
                id: true,
                direction: true,
                reference: true,
              },
            })
          : Promise.resolve(null),
    { label: "buildInvoicePaymentPostingSnapshot.loadLedgerRow" }
  );

  const resolvedLedgerEntryId = input.ledgerEntryId ?? invoice.ledgerEntry?.id ?? null;
  const resolvedTaxRecordId = input.taxRecordId ?? invoice.taxRecord?.id ?? null;
  const ledgerConfirmed =
    ledgerRow?.direction === "MONEY_IN" &&
    ledgerRow.reference === `INVOICE:${invoice.id}`;
  const taxConfirmed = Boolean(invoice.taxRecord);
  const integrityIssues = extractPaymentIntegrityIssues(invoice.notes);

  return {
    invoice,
    confirmation: {
      invoiceStatus: invoice.status,
      paymentReference: invoice.paymentReference,
      alreadyProcessed: input.alreadyProcessed,
      ledgerEntryId: resolvedLedgerEntryId,
      taxRecordId: resolvedTaxRecordId,
      ledgerDirection: ledgerRow?.direction ?? null,
      ledgerReference: ledgerRow?.reference ?? invoice.ledgerEntry?.reference ?? null,
      ledgerEntryCreated: Boolean(resolvedLedgerEntryId),
      ledgerConfirmed,
      taxSyncRan: Boolean(resolvedTaxRecordId),
      taxConfirmed,
      needsReview: integrityIssues.length > 0,
      integrityIssues,
    },
  };
}

async function confirmInvoicePaymentRecord(input: ConfirmInvoicePaymentRecordInput) {
  const paidAt = input.paidAt ?? new Date();

  return withPrismaRetry(
    () =>
      prisma.$transaction(
        async (tx) => {
          const invoice = await tx.invoice.findFirst({
            where: input.invoiceId
              ? {
                  id: input.invoiceId,
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                }
              : {
                  paymentReference: input.paymentReference,
                },
          });

          if (!invoice) {
            return { error: "Invoice not found" } as const;
          }

          if (
            input.amountKobo !== undefined &&
            input.amountKobo !== null &&
            input.amountKobo !== invoice.totalAmount
          ) {
            return { error: "Payment amount does not match invoice total" } as const;
          }

          const paymentCurrency = normalizeCurrency(input.currency);
          if (paymentCurrency && paymentCurrency !== DEFAULT_INVOICE_CURRENCY) {
            return { error: "Payment currency does not match invoice currency" } as const;
          }

          const alreadyPaid = invoice.status === "PAID";
          const effectivePaidAt = invoice.paidAt ?? paidAt;
          const resolvedClientBusinessId = await resolveInvoiceClientBusinessId(tx, {
            workspaceId: invoice.workspaceId,
            existingClientBusinessId: invoice.clientBusinessId ?? null,
          });
          const effectivePaymentReference =
            input.paymentReference ??
            invoice.paymentReference ??
            buildInvoicePaymentReference(invoice.id);
          const effectivePaymentUrl =
            invoice.paymentUrl ??
            buildInvoicePaymentUrl(getAppUrl(), effectivePaymentReference);

          let updated: Invoice;
          if (alreadyPaid) {
            updated =
              invoice.paidAt &&
              invoice.clientBusinessId === resolvedClientBusinessId &&
              invoice.paymentReference === effectivePaymentReference &&
              invoice.paymentUrl === effectivePaymentUrl
                ? invoice
                : await tx.invoice.update({
                    where: { id: invoice.id },
                    data: {
                      paidAt: effectivePaidAt,
                      clientBusinessId: resolvedClientBusinessId,
                      paymentReference: effectivePaymentReference,
                      paymentUrl: effectivePaymentUrl,
                    },
                  });
          } else {
            await tx.invoice.updateMany({
              where: {
                id: invoice.id,
                status: {
                  not: "PAID",
                },
              },
              data: {
                status: "PAID",
                paidAt: effectivePaidAt,
                clientBusinessId: resolvedClientBusinessId,
                paymentReference: effectivePaymentReference,
                paymentUrl: effectivePaymentUrl,
              },
            });

            const lockedInvoice = await tx.invoice.findUnique({
              where: { id: invoice.id },
            });

            if (!lockedInvoice) {
              return { error: "Invoice not found" } as const;
            }

            updated = lockedInvoice;
          }

          const existingTaxRecord = await tx.taxRecord.findUnique({
            where: { invoiceId: updated.id },
            select: { id: true },
          });

          const actorUserId =
            input.actorUserId ?? (await resolveInvoiceActorUserId(tx, updated.workspaceId));

          if (!actorUserId && !existingTaxRecord) {
            return { error: "No workspace member available for payment confirmation" } as const;
          }

          let taxRecordId = existingTaxRecord?.id ?? null;
          if (!existingTaxRecord && actorUserId) {
            taxRecordId = await ensureInvoiceIncomeTaxRecord(tx, {
              invoice: updated,
              actorUserId,
              occurredOn: effectivePaidAt,
            });
          }

          const ledgerResult = await createIncomeEntryFromInvoice(tx, {
            invoiceId: updated.id,
            actorUserId: actorUserId ?? null,
            occurredOn: effectivePaidAt,
            clientBusinessId: resolvedClientBusinessId ?? undefined,
          });

          const paymentReference = updated.paymentReference ?? effectivePaymentReference;
          const paymentId = paymentReference
            ? await upsertInvoicePaymentRecordWithExecutor(tx, {
                invoiceId: updated.id,
                workspaceId: updated.workspaceId,
                reference: paymentReference,
                amountMinor: updated.totalAmount,
                currency: "NGN",
                provider: normalizePaymentProvider(input.provider),
                status: "SUCCESS",
                providerTransactionId: input.providerTransactionId ?? null,
                paidAt: updated.paidAt ?? effectivePaidAt,
                payload: input.paymentPayload ?? null,
              })
            : null;

          return {
            invoice: updated,
            taxRecordId,
            ledgerEntryId: ledgerResult.entryId,
            alreadyPaid,
            paymentId,
          } as const;
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        }
      ),
    { label: "confirmInvoicePaymentRecord" }
  );
}

export async function processInvoicePayment(
  input: ProcessInvoicePaymentInput
): Promise<InvoicePaymentProcessError | InvoicePaymentProcessSuccess> {
  const effectivePaidAt = input.paidAt ?? new Date();
  const result = await confirmInvoicePaymentRecord({
    invoiceId: input.invoiceId,
    workspaceId: input.workspaceId ?? null,
    actorUserId: input.actorUserId ?? null,
    paidAt: effectivePaidAt,
    amountKobo: input.amountKobo,
    currency: input.currency ?? null,
    provider: input.provider ?? null,
    paymentReference: input.paymentReference ?? undefined,
    paymentPayload: input.paymentPayload ?? null,
    providerTransactionId: input.providerTransactionId ?? null,
  });

  if ("error" in result) {
    await logPaymentLifecycleEvent({
      event: "PAYMENT_FAILED",
      invoiceId: input.invoiceId,
      reference: input.paymentReference ?? null,
      workspaceId: input.workspaceId ?? null,
      status: result.error ?? "PROCESSING_FAILED",
      actorUserId: input.actorUserId ?? null,
      metadata: {
        provider: normalizePaymentProvider(input.provider),
        eventId: input.eventId ?? null,
      },
    });
    return { error: result.error ?? "Invoice payment processing failed" };
  }

  const paymentReference = input.paymentReference ?? result.invoice.paymentReference ?? null;

  if (!result.alreadyPaid) {
    await logAudit({
      workspaceId: result.invoice.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "INVOICE_PAYMENT_CONFIRMED",
      metadata: {
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        paymentReference,
        provider: normalizePaymentProvider(input.provider),
        paidAt: result.invoice.paidAt?.toISOString() ?? effectivePaidAt.toISOString(),
        amountKobo: result.invoice.totalAmount,
        eventId: input.eventId ?? null,
        paymentId: result.paymentId,
      },
    });
  }

  if (result.taxRecordId || result.ledgerEntryId) {
    await logAudit({
      workspaceId: result.invoice.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "Income created from invoice payment",
      metadata: {
        invoiceId: result.invoice.id,
        taxRecordId: result.taxRecordId,
        ledgerEntryId: result.ledgerEntryId,
        amountKobo: result.invoice.totalAmount,
        paymentReference,
        paymentId: result.paymentId,
        source: normalizePaymentProvider(input.provider),
      },
    });
  }

  if (result.ledgerEntryId) {
    await logPaymentLifecycleEvent({
      event: "LEDGER_POSTED",
      invoiceId: result.invoice.id,
      reference: paymentReference,
      workspaceId: result.invoice.workspaceId,
      status: "POSTED",
      actorUserId: input.actorUserId ?? null,
      metadata: {
        ledgerEntryId: result.ledgerEntryId,
      },
    });
  }

  if (result.taxRecordId) {
    await logPaymentLifecycleEvent({
      event: "TAX_SYNCED",
      invoiceId: result.invoice.id,
      reference: paymentReference,
      workspaceId: result.invoice.workspaceId,
      status: "SYNCED",
      actorUserId: input.actorUserId ?? null,
      metadata: {
        taxRecordId: result.taxRecordId,
      },
    });
  }

  let integrityValidation: PaymentIntegrityValidationResult | null = null;
  try {
    integrityValidation = await validatePaymentIntegrity(result.invoice.id);
  } catch (error) {
    logError("payments", "Invoice payment integrity validation failed unexpectedly", error, {
      invoiceId: result.invoice.id,
      workspaceId: result.invoice.workspaceId,
      paymentId: result.paymentId,
      paymentReference,
    });
  }

  const successResult: InvoicePaymentProcessSuccess = {
    ...result,
    alreadyProcessed: result.alreadyPaid,
    integrityValidation,
  };

  return successResult;
}

export async function confirmInvoicePaymentById(input: {
  invoiceId: number;
  workspaceId?: number | null;
  actorUserId?: number | null;
  paidAt?: Date;
}) {
  return processInvoicePayment({
    invoiceId: input.invoiceId,
    workspaceId: input.workspaceId ?? null,
    actorUserId: input.actorUserId ?? null,
    paidAt: input.paidAt,
    provider: "MANUAL",
  });
}
