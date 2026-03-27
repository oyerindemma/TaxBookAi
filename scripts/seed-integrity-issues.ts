import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

const SEED_WORKSPACE_NAME = "Integrity Engine Demo Workspace";
const SEED_CLIENT_BUSINESS_NAME = "Integrity Demo Services";
const SEED_CLIENT_EMAIL = "finance@integrity-demo.test";
const SEED_USER_EMAIL =
  process.env.INTEGRITY_SEED_EMAIL?.trim().toLowerCase() || "integrity-demo@taxbook.app";
const SEED_USER_PASSWORD =
  process.env.INTEGRITY_SEED_PASSWORD?.trim() || "Integrity123!";
const SEED_USER_NAME = process.env.INTEGRITY_SEED_NAME?.trim() || "Integrity Demo Owner";
const INVOICE_PREFIX = "INT-SEED-";
const PAYMENT_PREFIX = "INT-SEED-PAY-";
const NOTE_MARKER = "[INTEGRITY_SEED]";

type SeedWorkspaceContext = {
  userId: number;
  workspaceId: number;
  clientId: number;
  clientBusinessId: number;
};

type SeedInvoiceContext = {
  invoiceId: number;
  invoiceNumber: string;
  paymentReference: string | null;
  taxRecordId: number | null;
  paymentId: number | null;
  ledgerTransactionId: number | null;
  totalAmount: number;
};

function ensureSafeEnvironment() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Integrity issue seeding is disabled in production. Use this utility only in development."
    );
  }
}

function buildInvoiceLedgerReference(invoiceId: number) {
  return `INVOICE:${invoiceId}`;
}

function buildIssueFingerprint(
  workspaceId: number,
  issueType: string,
  components: Array<string | number | null | undefined>
) {
  return `${workspaceId}:${issueType}:${components.map((value) => String(value ?? "null")).join(":")}`;
}

function buildSeedTimestamp(dayOffset: number, hour = 9) {
  return new Date(Date.UTC(2026, 2, 1 + dayOffset, hour, 0, 0, 0));
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ensureSeedWorkspace(): Promise<SeedWorkspaceContext> {
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {
      fullName: SEED_USER_NAME,
      password: passwordHash,
    },
    create: {
      email: SEED_USER_EMAIL,
      fullName: SEED_USER_NAME,
      password: passwordHash,
      role: "USER",
    },
    select: {
      id: true,
    },
  });

  const existingMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspace: {
        name: SEED_WORKSPACE_NAME,
      },
    },
    include: {
      workspace: true,
    },
  });

  const workspace = existingMembership?.workspace
    ? await prisma.workspace.update({
        where: { id: existingMembership.workspace.id },
        data: {
          archivedAt: null,
          name: SEED_WORKSPACE_NAME,
        },
        select: {
          id: true,
        },
      })
    : await prisma.workspace.create({
        data: {
          name: SEED_WORKSPACE_NAME,
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
          subscription: {
            create: {
              plan: "PROFESSIONAL",
              status: "active",
            },
          },
          businessProfile: {
            create: {
              businessName: "Integrity Demo Workspace",
              businessType: "Accounting firm",
              industry: "Professional services",
              country: "Nigeria",
              state: "Lagos",
              defaultCurrency: "NGN",
              onboardingCompletedAt: new Date(),
            },
          },
        },
        select: {
          id: true,
        },
      });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {
      role: "OWNER",
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  await prisma.workspaceSubscription.upsert({
    where: { workspaceId: workspace.id },
    update: {
      plan: "PROFESSIONAL",
      status: "active",
    },
    create: {
      workspaceId: workspace.id,
      plan: "PROFESSIONAL",
      status: "active",
    },
  });

  const clientBusiness = await prisma.clientBusiness.upsert({
    where: {
      workspaceId_name: {
        workspaceId: workspace.id,
        name: SEED_CLIENT_BUSINESS_NAME,
      },
    },
    update: {
      archivedAt: null,
      legalName: "Integrity Demo Services Ltd",
      industry: "Professional services",
      country: "Nigeria",
      state: "Lagos",
      defaultCurrency: "NGN",
      notes: "Dedicated workspace for Financial Integrity Engine validation.",
    },
    create: {
      workspaceId: workspace.id,
      name: SEED_CLIENT_BUSINESS_NAME,
      legalName: "Integrity Demo Services Ltd",
      industry: "Professional services",
      country: "Nigeria",
      state: "Lagos",
      defaultCurrency: "NGN",
      notes: "Dedicated workspace for Financial Integrity Engine validation.",
    },
    select: {
      id: true,
    },
  });

  const existingClient = await prisma.client.findFirst({
    where: {
      workspaceId: workspace.id,
      email: SEED_CLIENT_EMAIL,
    },
    select: {
      id: true,
    },
  });

  const client = existingClient
    ? await prisma.client.update({
        where: { id: existingClient.id },
        data: {
          name: "Integrity Demo Client",
          companyName: "Integrity Demo Client Ltd",
          email: SEED_CLIENT_EMAIL,
          phone: "+2348000000100",
          address: "Victoria Island, Lagos",
          notes: "Seed client for integrity validation.",
        },
        select: {
          id: true,
        },
      })
    : await prisma.client.create({
        data: {
          workspaceId: workspace.id,
          name: "Integrity Demo Client",
          companyName: "Integrity Demo Client Ltd",
          email: SEED_CLIENT_EMAIL,
          phone: "+2348000000100",
          address: "Victoria Island, Lagos",
          notes: "Seed client for integrity validation.",
        },
        select: {
          id: true,
        },
      });

  return {
    userId: user.id,
    workspaceId: workspace.id,
    clientId: client.id,
    clientBusinessId: clientBusiness.id,
  };
}

async function clearExistingSeedData(workspaceId: number, clientBusinessId: number) {
  await prisma.integrityIssue.deleteMany({
    where: {
      workspaceId,
    },
  });

  const seededInvoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      invoiceNumber: {
        startsWith: INVOICE_PREFIX,
      },
    },
    select: {
      id: true,
    },
  });

  const invoiceIds = seededInvoices.map((invoice) => invoice.id);

  if (invoiceIds.length === 0) {
    return;
  }

  await prisma.ledgerTransaction.deleteMany({
    where: {
      clientBusinessId,
      reference: {
        in: invoiceIds.map((invoiceId) => buildInvoiceLedgerReference(invoiceId)),
      },
    },
  });

  await prisma.taxRecord.deleteMany({
    where: {
      workspaceId,
      invoiceId: {
        in: invoiceIds,
      },
    },
  });

  await prisma.payment.deleteMany({
    where: {
      invoiceId: {
        in: invoiceIds,
      },
    },
  });

  await prisma.invoiceItem.deleteMany({
    where: {
      invoiceId: {
        in: invoiceIds,
      },
    },
  });

  await prisma.invoice.deleteMany({
    where: {
      id: {
        in: invoiceIds,
      },
    },
  });
}

async function createSeedInvoice(input: {
  workspaceId: number;
  clientId: number;
  clientBusinessId: number;
  invoiceNumber: string;
  paymentReference: string;
  issueDayOffset: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "PAID" | "SENT";
  notes: string;
}) {
  return prisma.invoice.create({
    data: {
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      clientBusinessId: input.clientBusinessId,
      invoiceNumber: input.invoiceNumber,
      status: input.status,
      paymentReference: input.paymentReference,
      paymentUrl: `http://localhost:3000/pay/${input.paymentReference}`,
      issueDate: buildSeedTimestamp(input.issueDayOffset, 8),
      dueDate: buildSeedTimestamp(input.issueDayOffset + 7, 8),
      paidAt:
        input.status === "PAID" ? buildSeedTimestamp(input.issueDayOffset + 8, 11) : null,
      subtotal: input.subtotal,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      sourceDocumentNumber: input.invoiceNumber,
      notes: `${NOTE_MARKER} ${input.notes}`,
      items: {
        create: [
          {
            description: `${input.invoiceNumber} consulting services`,
            quantity: 1,
            unitPrice: input.subtotal,
            taxRate: 7.5,
            lineTotal: input.totalAmount,
          },
        ],
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      paymentReference: true,
      paidAt: true,
    },
  });
}

async function createPayment(input: {
  workspaceId: number;
  invoiceId: number;
  reference: string;
  amountMinor: number;
  paidAt: Date | null;
  source: string;
}) {
  return prisma.payment.create({
    data: {
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
      provider: "MANUAL",
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: "NGN",
      status: "SUCCESS",
      paidAt: input.paidAt ?? new Date(),
      payload: {
        source: input.source,
        kind: "integrity_seed",
      },
    },
    select: {
      id: true,
      reference: true,
    },
  });
}

async function createTaxRecord(input: {
  userId: number;
  workspaceId: number;
  clientBusinessId: number;
  invoiceId: number;
  invoiceNumber: string;
  amountMinor: number;
  paidAt: Date | null;
}) {
  return prisma.taxRecord.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      invoiceId: input.invoiceId,
      kind: "INCOME",
      amountKobo: input.amountMinor,
      taxRate: 7.5,
      computedTax: Math.round(input.amountMinor * 0.075),
      netAmount: input.amountMinor - Math.round(input.amountMinor * 0.075),
      currency: "NGN",
      occurredOn: input.paidAt ?? new Date(),
      description: `Seed tax record for ${input.invoiceNumber}`,
      source: "integrity_seed",
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      sourceDocumentNumber: input.invoiceNumber,
    },
    select: {
      id: true,
    },
  });
}

async function createLedgerEntry(input: {
  clientBusinessId: number;
  invoiceId: number;
  invoiceNumber: string;
  amountMinor: number;
  paidAt: Date | null;
}) {
  return prisma.ledgerTransaction.create({
    data: {
      clientBusinessId: input.clientBusinessId,
      transactionDate: input.paidAt ?? new Date(),
      description: `Seed ledger entry for ${input.invoiceNumber}`,
      reference: buildInvoiceLedgerReference(input.invoiceId),
      direction: "MONEY_IN",
      amountMinor: input.amountMinor,
      currency: "NGN",
      vatAmountMinor: 0,
      whtAmountMinor: 0,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      sourceDocumentNumber: input.invoiceNumber,
      origin: "MANUAL",
      reviewStatus: "POSTED",
      notes: `${NOTE_MARKER} Seed ledger entry`,
    },
    select: {
      id: true,
    },
  });
}

async function createIntegrityIssue(input: {
  workspaceId: number;
  invoiceId: number | null;
  paymentId: number | null;
  ledgerTransactionId: number | null;
  taxRecordId: number | null;
  issueType: string;
  severity: "warning" | "critical";
  status: "OPEN" | "MANUAL_REVIEW";
  autoRepairable: boolean;
  summary: string;
  detailLines: string[];
  metadata: Record<string, unknown>;
  repairConfidenceScore: number;
  repairConfidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  repairRecommendation: "AUTO_FIX" | "REVIEW_AND_FIX" | "MANUAL_ONLY";
  repairReasoning: string[];
  suggestedFix: string;
  confidenceFactors?: Record<string, unknown>;
}) {
  const referenceComponent =
    typeof input.metadata.reference === "string" || typeof input.metadata.reference === "number"
      ? input.metadata.reference
      : null;
  const fingerprint = buildIssueFingerprint(input.workspaceId, input.issueType, [
    input.invoiceId,
    input.paymentId,
    input.ledgerTransactionId,
    input.taxRecordId,
    referenceComponent,
  ]);

  const metadata = toInputJsonValue({
    ...input.metadata,
    repairConfidenceScore: input.repairConfidenceScore,
    repairConfidenceLabel: input.repairConfidenceLabel,
    repairRecommendation: input.repairRecommendation,
    repairReasoning: input.repairReasoning,
    repairConfidenceFactors: input.confidenceFactors ?? null,
    suggestedFix: input.suggestedFix,
    lastConfidenceComputedAt: new Date().toISOString(),
    autoRepairEligible: input.autoRepairable,
    repairAttempted: false,
    repairSucceeded: null,
    repairFailureCount: 0,
    seededBy: "seed-integrity-issues",
  });

  await prisma.integrityIssue.upsert({
    where: {
      fingerprint,
    },
    update: {
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      ledgerTransactionId: input.ledgerTransactionId,
      taxRecordId: input.taxRecordId,
      severity: input.severity,
      status: input.status,
      autoRepairable: input.autoRepairable,
      summary: input.summary,
      details: input.detailLines.join("\n"),
      metadata,
      lastDetectedAt: new Date(),
      resolvedAt: null,
      autoRepairedAt: null,
    },
    create: {
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      ledgerTransactionId: input.ledgerTransactionId,
      taxRecordId: input.taxRecordId,
      fingerprint,
      issueType: input.issueType,
      severity: input.severity,
      status: input.status,
      autoRepairable: input.autoRepairable,
      summary: input.summary,
      details: input.detailLines.join("\n"),
      metadata,
    },
  });

  return fingerprint;
}

async function seedScenarios(context: SeedWorkspaceContext) {
  const createdScenarios: Array<{
    demoLabel: string;
    scenario: string;
    expectedIssueType: string;
    autoRepairable: boolean;
    confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
    recommendation: "AUTO_FIX" | "REVIEW_AND_FIX" | "MANUAL_ONLY";
    invoiceId: number;
    invoiceNumber: string;
    fingerprint: string;
  }> = [];

  const verificationLagInvoice = await createSeedInvoice({
    workspaceId: context.workspaceId,
    clientId: context.clientId,
    clientBusinessId: context.clientBusinessId,
    invoiceNumber: `${INVOICE_PREFIX}1001`,
    paymentReference: `${PAYMENT_PREFIX}1001`,
    issueDayOffset: -1,
    subtotal: 100000,
    taxAmount: 7500,
    totalAmount: 107500,
    status: "SENT",
    notes: "Verified payment exists but invoice remains SENT, simulating webhook/callback lag.",
  });
  const verificationLagPayment = await createPayment({
    workspaceId: context.workspaceId,
    invoiceId: verificationLagInvoice.id,
    reference: verificationLagInvoice.paymentReference ?? `${PAYMENT_PREFIX}1001`,
    amountMinor: verificationLagInvoice.totalAmount,
    paidAt: buildSeedTimestamp(0, 6),
    source: "integrity_seed_payment_verification_lag",
  });
  const verificationLagLedger = await createLedgerEntry({
    clientBusinessId: context.clientBusinessId,
    invoiceId: verificationLagInvoice.id,
    invoiceNumber: verificationLagInvoice.invoiceNumber,
    amountMinor: verificationLagInvoice.totalAmount,
    paidAt: buildSeedTimestamp(0, 6),
  });
  const verificationLagTax = await createTaxRecord({
    userId: context.userId,
    workspaceId: context.workspaceId,
    clientBusinessId: context.clientBusinessId,
    invoiceId: verificationLagInvoice.id,
    invoiceNumber: verificationLagInvoice.invoiceNumber,
    amountMinor: verificationLagInvoice.totalAmount,
    paidAt: buildSeedTimestamp(0, 6),
  });
  const verificationLagFingerprint = await createIntegrityIssue({
    workspaceId: context.workspaceId,
    invoiceId: verificationLagInvoice.id,
    paymentId: verificationLagPayment.id,
    ledgerTransactionId: verificationLagLedger.id,
    taxRecordId: verificationLagTax.id,
    issueType: "STALE_SENT_INVOICE_VERIFIED_PAYMENT",
    severity: "critical",
    status: "OPEN",
    autoRepairable: false,
    summary: `Invoice ${verificationLagInvoice.invoiceNumber} is still SENT even though a verified payment already exists.`,
    detailLines: [
      `Payment ${verificationLagPayment.reference} became successful at ${buildSeedTimestamp(0, 6).toISOString()}.`,
      "Invoice status is still SENT well after the expected webhook/callback window.",
    ],
    metadata: {
      invoiceNumber: verificationLagInvoice.invoiceNumber,
      paymentReference: verificationLagPayment.reference,
      paymentAgeMinutes: 180,
      demoLabel: "PAYMENT_VERIFICATION_FAILED",
    },
    repairConfidenceScore: 0.78,
    repairConfidenceLabel: "MEDIUM",
    repairRecommendation: "REVIEW_AND_FIX",
    repairReasoning: [
      "A verified payment exists while the invoice is still in SENT status.",
      "Reference and amount signals match, but the issue can come from callback or webhook lag.",
      "Admin review is recommended before replaying the payment confirmation flow.",
    ],
    suggestedFix:
      "Review the payment trail, then replay payment confirmation if the reference and amount still match.",
    confidenceFactors: {
      exactReferenceMatch: true,
      paymentAmountMatchesInvoice: true,
      moneyInLedgerPresent: true,
      taxRecordPresent: true,
      clientBusinessResolution: "EXPLICIT",
    },
  });
  createdScenarios.push({
    demoLabel: "PAYMENT_VERIFICATION_FAILED",
    scenario: "Verified payment lag / invoice still SENT",
    expectedIssueType: "STALE_SENT_INVOICE_VERIFIED_PAYMENT",
    autoRepairable: false,
    confidenceLabel: "MEDIUM",
    recommendation: "REVIEW_AND_FIX",
    invoiceId: verificationLagInvoice.id,
    invoiceNumber: verificationLagInvoice.invoiceNumber,
    fingerprint: verificationLagFingerprint,
  });

  const missingLedgerInvoice = await createSeedInvoice({
    workspaceId: context.workspaceId,
    clientId: context.clientId,
    clientBusinessId: context.clientBusinessId,
    invoiceNumber: `${INVOICE_PREFIX}1002`,
    paymentReference: `${PAYMENT_PREFIX}1002`,
    issueDayOffset: 1,
    subtotal: 125000,
    taxAmount: 9375,
    totalAmount: 134375,
    status: "PAID",
    notes: "Paid invoice missing MONEY_IN ledger entry.",
  });
  const missingLedgerPayment = await createPayment({
    workspaceId: context.workspaceId,
    invoiceId: missingLedgerInvoice.id,
    reference: missingLedgerInvoice.paymentReference ?? `${PAYMENT_PREFIX}1002`,
    amountMinor: missingLedgerInvoice.totalAmount,
    paidAt: missingLedgerInvoice.paidAt,
    source: "integrity_seed_missing_ledger",
  });
  const missingLedgerTax = await createTaxRecord({
    userId: context.userId,
    workspaceId: context.workspaceId,
    clientBusinessId: context.clientBusinessId,
    invoiceId: missingLedgerInvoice.id,
    invoiceNumber: missingLedgerInvoice.invoiceNumber,
    amountMinor: missingLedgerInvoice.totalAmount,
    paidAt: missingLedgerInvoice.paidAt,
  });
  const missingLedgerFingerprint = await createIntegrityIssue({
    workspaceId: context.workspaceId,
    invoiceId: missingLedgerInvoice.id,
    paymentId: missingLedgerPayment.id,
    ledgerTransactionId: null,
    taxRecordId: missingLedgerTax.id,
    issueType: "PAID_INVOICE_MISSING_LEDGER",
    severity: "critical",
    status: "OPEN",
    autoRepairable: true,
    summary: `Paid invoice ${missingLedgerInvoice.invoiceNumber} has no MONEY_IN ledger entry.`,
    detailLines: [
      `Expected a MONEY_IN ledger row with reference ${buildInvoiceLedgerReference(missingLedgerInvoice.id)}.`,
      "Client business mapping is available, so the ledger row can be auto-recreated.",
    ],
    metadata: {
      invoiceNumber: missingLedgerInvoice.invoiceNumber,
      reference: buildInvoiceLedgerReference(missingLedgerInvoice.id),
      clientBusinessId: context.clientBusinessId,
      singleActiveClientBusinessId: context.clientBusinessId,
      demoLabel: "LEDGER_MISSING",
    },
    repairConfidenceScore: 0.92,
    repairConfidenceLabel: "HIGH",
    repairRecommendation: "AUTO_FIX",
    repairReasoning: [
      "The invoice is already marked PAID.",
      "A successful payment row exists and the client-business mapping is explicit.",
      "The missing MONEY_IN ledger entry can be recreated deterministically.",
    ],
    suggestedFix:
      "Recreate the missing MONEY_IN ledger entry through the shared invoice payment chain.",
    confidenceFactors: {
      exactReferenceMatch: true,
      paymentAmountMatchesInvoice: true,
      moneyInLedgerPresent: false,
      taxRecordPresent: true,
      clientBusinessResolution: "EXPLICIT",
    },
  });
  createdScenarios.push({
    demoLabel: "LEDGER_MISSING",
    scenario: "Missing ledger entry",
    expectedIssueType: "PAID_INVOICE_MISSING_LEDGER",
    autoRepairable: true,
    confidenceLabel: "HIGH",
    recommendation: "AUTO_FIX",
    invoiceId: missingLedgerInvoice.id,
    invoiceNumber: missingLedgerInvoice.invoiceNumber,
    fingerprint: missingLedgerFingerprint,
  });

  const mismatchInvoice = await createSeedInvoice({
    workspaceId: context.workspaceId,
    clientId: context.clientId,
    clientBusinessId: context.clientBusinessId,
    invoiceNumber: `${INVOICE_PREFIX}1003`,
    paymentReference: `${PAYMENT_PREFIX}1003`,
    issueDayOffset: 2,
    subtotal: 200000,
    taxAmount: 15000,
    totalAmount: 215000,
    status: "PAID",
    notes: "Paid invoice with mismatched payment amount.",
  });
  const mismatchPayment = await createPayment({
    workspaceId: context.workspaceId,
    invoiceId: mismatchInvoice.id,
    reference: mismatchInvoice.paymentReference ?? `${PAYMENT_PREFIX}1003`,
    amountMinor: 205000,
    paidAt: mismatchInvoice.paidAt,
    source: "integrity_seed_amount_mismatch",
  });
  const mismatchLedger = await createLedgerEntry({
    clientBusinessId: context.clientBusinessId,
    invoiceId: mismatchInvoice.id,
    invoiceNumber: mismatchInvoice.invoiceNumber,
    amountMinor: mismatchInvoice.totalAmount,
    paidAt: mismatchInvoice.paidAt,
  });
  const mismatchTax = await createTaxRecord({
    userId: context.userId,
    workspaceId: context.workspaceId,
    clientBusinessId: context.clientBusinessId,
    invoiceId: mismatchInvoice.id,
    invoiceNumber: mismatchInvoice.invoiceNumber,
    amountMinor: mismatchInvoice.totalAmount,
    paidAt: mismatchInvoice.paidAt,
  });
  const mismatchFingerprint = await createIntegrityIssue({
    workspaceId: context.workspaceId,
    invoiceId: mismatchInvoice.id,
    paymentId: mismatchPayment.id,
    ledgerTransactionId: mismatchLedger.id,
    taxRecordId: mismatchTax.id,
    issueType: "AMOUNT_MISMATCH",
    severity: "critical",
    status: "MANUAL_REVIEW",
    autoRepairable: false,
    summary: `Invoice ${mismatchInvoice.invoiceNumber} has mismatched invoice, payment, or ledger amounts.`,
    detailLines: [
      `Payment ${mismatchPayment.reference} amount ${205000} does not match invoice total ${mismatchInvoice.totalAmount}.`,
      `Ledger row #${mismatchLedger.id} amount ${mismatchInvoice.totalAmount} does not match payment amount ${205000}.`,
    ],
    metadata: {
      invoiceNumber: mismatchInvoice.invoiceNumber,
      invoiceAmountMinor: mismatchInvoice.totalAmount,
      paymentIds: [mismatchPayment.id],
      ledgerEntryIds: [mismatchLedger.id],
      demoLabel: "AMOUNT_MISMATCH",
    },
    repairConfidenceScore: 0.1,
    repairConfidenceLabel: "LOW",
    repairRecommendation: "MANUAL_ONLY",
    repairReasoning: [
      "Invoice, payment, and ledger amounts do not agree.",
      "The integrity engine never auto-changes financial amounts.",
    ],
    suggestedFix: "Manual investigation required. Do not auto-change financial amounts.",
    confidenceFactors: {
      exactReferenceMatch: true,
      paymentAmountMatchesInvoice: false,
      ledgerAmountMatchesInvoice: true,
      moneyInLedgerPresent: true,
      taxRecordPresent: true,
      clientBusinessResolution: "EXPLICIT",
    },
  });
  createdScenarios.push({
    demoLabel: "AMOUNT_MISMATCH",
    scenario: "Amount mismatch",
    expectedIssueType: "AMOUNT_MISMATCH",
    autoRepairable: false,
    confidenceLabel: "LOW",
    recommendation: "MANUAL_ONLY",
    invoiceId: mismatchInvoice.id,
    invoiceNumber: mismatchInvoice.invoiceNumber,
    fingerprint: mismatchFingerprint,
  });

  const missingTaxInvoice = await createSeedInvoice({
    workspaceId: context.workspaceId,
    clientId: context.clientId,
    clientBusinessId: context.clientBusinessId,
    invoiceNumber: `${INVOICE_PREFIX}1004`,
    paymentReference: `${PAYMENT_PREFIX}1004`,
    issueDayOffset: 3,
    subtotal: 90000,
    taxAmount: 6750,
    totalAmount: 96750,
    status: "PAID",
    notes: "Paid invoice with payment and ledger but no tax record.",
  });
  const missingTaxPayment = await createPayment({
    workspaceId: context.workspaceId,
    invoiceId: missingTaxInvoice.id,
    reference: missingTaxInvoice.paymentReference ?? `${PAYMENT_PREFIX}1004`,
    amountMinor: missingTaxInvoice.totalAmount,
    paidAt: missingTaxInvoice.paidAt,
    source: "integrity_seed_missing_tax",
  });
  const missingTaxLedger = await createLedgerEntry({
    clientBusinessId: context.clientBusinessId,
    invoiceId: missingTaxInvoice.id,
    invoiceNumber: missingTaxInvoice.invoiceNumber,
    amountMinor: missingTaxInvoice.totalAmount,
    paidAt: missingTaxInvoice.paidAt,
  });
  const missingTaxFingerprint = await createIntegrityIssue({
    workspaceId: context.workspaceId,
    invoiceId: missingTaxInvoice.id,
    paymentId: missingTaxPayment.id,
    ledgerTransactionId: missingTaxLedger.id,
    taxRecordId: null,
    issueType: "PAYMENT_TAX_SYNC_MISSING",
    severity: "critical",
    status: "OPEN",
    autoRepairable: true,
    summary: `Invoice ${missingTaxInvoice.invoiceNumber} has a successful payment but no tax record.`,
    detailLines: [
      `Payment ${missingTaxPayment.reference} is marked SUCCESS for invoice #${missingTaxInvoice.invoiceNumber}.`,
      "The invoice payment flow should have created a TaxRecord but none was found.",
    ],
    metadata: {
      invoiceNumber: missingTaxInvoice.invoiceNumber,
      paymentReference: missingTaxPayment.reference,
      paymentStatus: "SUCCESS",
      demoLabel: "TAX_NOT_SYNCED",
    },
    repairConfidenceScore: 0.94,
    repairConfidenceLabel: "HIGH",
    repairRecommendation: "AUTO_FIX",
    repairReasoning: [
      "A successful payment exists and the ledger row already matches the invoice total.",
      "No tax record was created, so the shared payment flow can safely regenerate tax sync.",
    ],
    suggestedFix:
      "Rerun the shared payment confirmation flow so the missing tax record is recreated safely.",
    confidenceFactors: {
      exactReferenceMatch: true,
      paymentAmountMatchesInvoice: true,
      ledgerAmountMatchesInvoice: true,
      moneyInLedgerPresent: true,
      taxRecordPresent: false,
      clientBusinessResolution: "EXPLICIT",
    },
  });
  createdScenarios.push({
    demoLabel: "TAX_NOT_SYNCED",
    scenario: "Missing tax sync",
    expectedIssueType: "PAYMENT_TAX_SYNC_MISSING",
    autoRepairable: true,
    confidenceLabel: "HIGH",
    recommendation: "AUTO_FIX",
    invoiceId: missingTaxInvoice.id,
    invoiceNumber: missingTaxInvoice.invoiceNumber,
    fingerprint: missingTaxFingerprint,
  });

  return {
    createdScenarios,
    seededIssueCount: createdScenarios.length,
  };
}

async function main() {
  ensureSafeEnvironment();

  const context = await ensureSeedWorkspace();
  await clearExistingSeedData(context.workspaceId, context.clientBusinessId);
  const seeded = await seedScenarios(context);

  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId: context.workspaceId,
        demoUser: {
          email: SEED_USER_EMAIL,
          password: SEED_USER_PASSWORD,
        },
        seededIssueCount: seeded.seededIssueCount,
        typesCreated: seeded.createdScenarios.map((scenario) => scenario.expectedIssueType),
        scenarios: seeded.createdScenarios,
        demoChecklist: [
          "1. Log in with the demo account and open /dashboard/integrity.",
          "2. Highlight PAYMENT_VERIFICATION_FAILED as the MEDIUM-confidence review case.",
          "3. Click 'Run integrity scan' to show detection and scoring.",
          "4. Click 'Auto-fix safe issues' to repair LEDGER_MISSING and TAX_NOT_SYNCED.",
          "5. Show AMOUNT_MISMATCH remains manual-only while health score improves.",
        ],
        notes: [
          "This seed utility is development-only.",
          "Run /api/system/integrity/run?mode=scan to validate detection without mutating data.",
          "Open /dashboard/integrity with the seeded demo account to test the UI and repair actions.",
        ],
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Integrity issue seeding failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
