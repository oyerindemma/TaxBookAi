import bcrypt from "bcryptjs";
import type {
  InvoiceStatus,
  PaymentProvider,
  Prisma,
  PrismaClient,
  TaxCategory,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";
import type { DeploymentStage } from "@/lib/env";
import {
  isProductionDemoRouteAllowed,
  secureCompareText,
} from "@/lib/security-guards";

export const BETA_DEMO_EMAIL =
  process.env.DEMO_EMAIL?.trim().toLowerCase() || "demo@taxbook.ai";
export const BETA_DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || "demo123";
export const BETA_DEMO_FULL_NAME =
  process.env.DEMO_FULL_NAME?.trim() || "TaxBook AI Demo";
export const BETA_DEMO_WORKSPACE_NAME =
  process.env.DEMO_WORKSPACE_NAME?.trim() || "Demo Workspace";
export const BETA_DEMO_BUSINESS_NAME =
  process.env.DEMO_BUSINESS_NAME?.trim() || "Demo Workspace";

const DEFAULT_APP_URL = process.env.APP_URL?.trim() || "http://localhost:3000";
const DEFAULT_CURRENCY = "NGN";
const DEFAULT_PASSWORD_ROUNDS = 12;
const DEFAULT_EXPENSE_CATEGORIES = [
  "Office",
  "Software",
  "Utilities",
  "Marketing",
  "Transport",
  "Rent",
  "Miscellaneous",
] as const;
const DEFAULT_TRANSACTION_CATEGORIES = [
  { name: "Revenue", type: "INCOME" },
  { name: "Operations", type: "EXPENSE" },
  { name: "Professional fees", type: "EXPENSE" },
  { name: "Tax and compliance", type: "EXPENSE" },
] as const;

type DemoDb = PrismaClient;

type BetaDemoClientSeed = {
  key: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
};

type BetaInvoiceSeed = {
  code: string;
  clientKey: string;
  description: string;
  status: InvoiceStatus;
  issueDaysAgo: number;
  dueDaysOffset: number;
  paidDaysAgo?: number;
  paidHoursAgo?: number;
  subtotal: number;
  taxRate: number;
  vatTreatment: VatTreatment;
  whtTreatment: WhtTreatment;
  taxCategory: TaxCategory;
  paymentReference: string | null;
  paymentProvider?: PaymentProvider;
  paymentAmountMinor?: number;
  paymentHoursAgo?: number;
  paymentDaysAgo?: number;
  createPayment: boolean;
  createLedger: boolean;
  ledgerAmountMinor?: number;
  ledgerHoursAgo?: number;
  ledgerDaysAgo?: number;
  createTaxRecord: boolean;
  createVatRecord: boolean;
  createWhtRecord: boolean;
  notes: string;
  scenario:
    | "HEALTHY"
    | "PAID_MISSING_PAYMENT"
    | "PAID_MISSING_LEDGER"
    | "PAYMENT_NOT_PAID_REVIEW"
    | "TAX_NOT_SYNCED"
    | "AMOUNT_MISMATCH";
};

type SeedWorkspaceContext = {
  userId: number;
  workspaceId: number;
  clientBusinessId: number;
  clientIdsByKey: Record<string, number>;
  taxPeriodId: number;
};

export type BetaDemoPrimaryScenario = {
  scenario: BetaInvoiceSeed["scenario"];
  invoiceId: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  paymentReference: string | null;
  expectedSignals: string[];
};

export type BetaDemoSeedResult = {
  email: string;
  password: string;
  userId: number;
  workspaceId: number;
  workspaceName: string;
  businessProfileId: number;
  clientBusinessId: number;
  withIssues: boolean;
  invoiceCounts: {
    total: number;
    paid: number;
    sent: number;
    overdue: number;
  };
  paymentCount: number;
  ledgerCount: number;
  taxRecordCount: number;
  vatRecordCount: number;
  whtRecordCount: number;
  primaryScenarios: BetaDemoPrimaryScenario[];
};

type BetaDemoSeedInput = {
  withIssues?: boolean;
};

function parseBooleanEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function getDemoDeploymentStage(): DeploymentStage {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development") {
    return vercelEnv;
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}

export function isBetaDemoModeEnabled() {
  return parseBooleanEnv("DEMO_MODE") === true;
}

export function isDemoRouteAllowed() {
  return isProductionDemoRouteAllowed({
    deploymentStage: getDemoDeploymentStage(),
    demoModeEnabled: isBetaDemoModeEnabled(),
    accessSecretConfigured: Boolean(process.env.DEMO_ACCESS_SECRET?.trim()),
  });
}

export function resolveDemoRouteAccess(input: {
  requestUrl: string;
  headers: Headers;
  providedSecret?: string | null;
}) {
  if (getDemoDeploymentStage() !== "production") {
    return { ok: true as const };
  }

  const requiredSecret = process.env.DEMO_ACCESS_SECRET?.trim();
  if (!isDemoRouteAllowed() || !requiredSecret) {
    return {
      ok: false as const,
      status: 403,
      error: "Demo access is disabled in production.",
    };
  }

  const url = new URL(input.requestUrl);
  const headerSecret =
    input.headers.get("x-demo-secret")?.trim() ||
    input.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    null;
  const providedSecret =
    input.providedSecret?.trim() ||
    url.searchParams.get("secret")?.trim() ||
    headerSecret;

  if (!secureCompareText(providedSecret, requiredSecret)) {
    return {
      ok: false as const,
      status: 403,
      error: "Invalid demo access secret.",
    };
  }

  return { ok: true as const };
}

function buildAppUrl() {
  try {
    return new URL(DEFAULT_APP_URL).toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

function buildInvoiceDateFromDaysAgo(daysAgo: number, hour = 9) {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() - daysAgo);
  return value;
}

function buildInvoiceDateFromDaysOffset(daysOffset: number, hour = 17) {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + daysOffset);
  return value;
}

function buildInvoiceDateFromHoursAgo(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
}

function buildInvoiceTotal(subtotal: number, taxRate: number) {
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  return {
    taxAmount,
    totalAmount: subtotal + taxAmount,
  };
}

function buildInvoicePaymentUrl(reference: string | null) {
  return reference ? `${buildAppUrl()}/pay/${encodeURIComponent(reference)}` : null;
}

function buildInvoiceLedgerReference(invoiceId: number) {
  return `INVOICE:${invoiceId}`;
}

function buildCurrentMonthPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = new Date(year, now.getMonth(), 1, 0, 0, 0, 0);
  const endDate = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);
  const label = startDate.toLocaleString("en-NG", {
    month: "long",
    year: "numeric",
  });

  return {
    periodKey: `${year}-${String(month).padStart(2, "0")}`,
    label,
    startDate,
    endDate,
    year,
    month,
  };
}

function getBetaClients(): BetaDemoClientSeed[] {
  return [
    {
      key: "zenith",
      name: "Zainab Okafor",
      companyName: "Zenith Retail Ltd",
      email: "finance@zenith-retail.demo",
      phone: "+2348001110001",
      address: "Victoria Island, Lagos",
      taxId: "TIN-DEMO-1001",
    },
    {
      key: "greenline",
      name: "Ifeanyi Udeh",
      companyName: "Greenline Logistics",
      email: "ops@greenline-logistics.demo",
      phone: "+2348001110002",
      address: "Ikeja, Lagos",
      taxId: "TIN-DEMO-1002",
    },
    {
      key: "nova",
      name: "Tola Akinyemi",
      companyName: "Nova Advisory",
      email: "accounts@nova-advisory.demo",
      phone: "+2348001110003",
      address: "Lekki Phase 1, Lagos",
      taxId: "TIN-DEMO-1003",
    },
    {
      key: "palmtech",
      name: "Adaeze Nnamani",
      companyName: "Palmtech Studios",
      email: "billing@palmtech.demo",
      phone: "+2348001110004",
      address: "Yaba, Lagos",
      taxId: "TIN-DEMO-1004",
    },
  ];
}

function getHealthyInvoiceSeeds(): BetaInvoiceSeed[] {
  return [
    {
      code: "1001",
      clientKey: "zenith",
      description: "Monthly bookkeeping retainer",
      status: "PAID",
      issueDaysAgo: 24,
      dueDaysOffset: -12,
      paidDaysAgo: 10,
      subtotal: 180_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1001",
      paymentProvider: "PAYSTACK",
      createPayment: true,
      createLedger: true,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: false,
      notes: "Healthy paid invoice for recurring bookkeeping services.",
      scenario: "HEALTHY",
    },
    {
      code: "1002",
      clientKey: "greenline",
      description: "Quarterly tax advisory package",
      status: "PAID",
      issueDaysAgo: 21,
      dueDaysOffset: -8,
      paidDaysAgo: 7,
      subtotal: 240_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "RECEIVABLE",
      taxCategory: "PROFESSIONAL_SERVICE",
      paymentReference: "BETA-PAY-1002",
      paymentProvider: "PAYSTACK",
      createPayment: true,
      createLedger: true,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: true,
      notes: "Healthy paid invoice with VAT and WHT support.",
      scenario: "HEALTHY",
    },
    {
      code: "1003",
      clientKey: "nova",
      description: "Monthly compliance review",
      status: "SENT",
      issueDaysAgo: 5,
      dueDaysOffset: 7,
      subtotal: 150_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1003",
      paymentProvider: "PAYSTACK",
      createPayment: false,
      createLedger: false,
      createTaxRecord: false,
      createVatRecord: false,
      createWhtRecord: false,
      notes: "Healthy sent invoice waiting for customer payment.",
      scenario: "HEALTHY",
    },
    {
      code: "1004",
      clientKey: "palmtech",
      description: "Annual bookkeeping cleanup",
      status: "OVERDUE",
      issueDaysAgo: 18,
      dueDaysOffset: -4,
      subtotal: 110_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1004",
      paymentProvider: "PAYSTACK",
      createPayment: false,
      createLedger: false,
      createTaxRecord: false,
      createVatRecord: false,
      createWhtRecord: false,
      notes: "Healthy overdue invoice used for collections follow-up.",
      scenario: "HEALTHY",
    },
    {
      code: "1005",
      clientKey: "zenith",
      description: "Payroll tax filing support",
      status: "PAID",
      issueDaysAgo: 16,
      dueDaysOffset: -9,
      paidDaysAgo: 5,
      subtotal: 130_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "PAYROLL",
      paymentReference: "BETA-PAY-1005",
      paymentProvider: "PAYSTACK",
      createPayment: true,
      createLedger: true,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: false,
      notes: "Healthy paid payroll support invoice.",
      scenario: "HEALTHY",
    },
    {
      code: "1010",
      clientKey: "greenline",
      description: "Management reporting pack",
      status: "PAID",
      issueDaysAgo: 12,
      dueDaysOffset: -5,
      paidDaysAgo: 3,
      subtotal: 210_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1010",
      paymentProvider: "PAYSTACK",
      createPayment: true,
      createLedger: true,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: false,
      notes: "Healthy paid reporting invoice.",
      scenario: "HEALTHY",
    },
    {
      code: "1011",
      clientKey: "nova",
      description: "Board-ready finance pack",
      status: "SENT",
      issueDaysAgo: 2,
      dueDaysOffset: 10,
      subtotal: 165_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1011",
      paymentProvider: "PAYSTACK",
      createPayment: false,
      createLedger: false,
      createTaxRecord: false,
      createVatRecord: false,
      createWhtRecord: false,
      notes: "Healthy sent invoice still within terms.",
      scenario: "HEALTHY",
    },
    {
      code: "1012",
      clientKey: "palmtech",
      description: "Cash-flow review workshop",
      status: "OVERDUE",
      issueDaysAgo: 14,
      dueDaysOffset: -2,
      subtotal: 95_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1012",
      paymentProvider: "PAYSTACK",
      createPayment: false,
      createLedger: false,
      createTaxRecord: false,
      createVatRecord: false,
      createWhtRecord: false,
      notes: "Healthy overdue invoice for collections demo.",
      scenario: "HEALTHY",
    },
  ];
}

function getIssueInvoiceSeeds(): BetaInvoiceSeed[] {
  return [
    {
      code: "1006",
      clientKey: "zenith",
      description: "Paid invoice missing payment row",
      status: "PAID",
      issueDaysAgo: 11,
      dueDaysOffset: -4,
      paidDaysAgo: 2,
      subtotal: 175_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1006",
      paymentProvider: "PAYSTACK",
      createPayment: false,
      createLedger: true,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: false,
      notes: "Deliberate integrity issue: invoice is paid but the payment row is missing.",
      scenario: "PAID_MISSING_PAYMENT",
    },
    {
      code: "1007",
      clientKey: "greenline",
      description: "Paid invoice missing ledger row",
      status: "PAID",
      issueDaysAgo: 9,
      dueDaysOffset: -3,
      paidDaysAgo: 1,
      subtotal: 225_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1007",
      paymentProvider: "PAYSTACK",
      createPayment: true,
      createLedger: false,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: false,
      notes: "Deliberate integrity issue: payment exists but the MONEY_IN ledger row is missing.",
      scenario: "PAID_MISSING_LEDGER",
    },
    {
      code: "1008",
      clientKey: "nova",
      description: "Successful payment review lag",
      status: "SENT",
      issueDaysAgo: 3,
      dueDaysOffset: -1,
      paidHoursAgo: 2,
      subtotal: 140_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: null,
      paymentProvider: "PAYSTACK",
      paymentAmountMinor: 155_500,
      paymentHoursAgo: 2,
      createPayment: true,
      createLedger: true,
      ledgerAmountMinor: 150_500,
      ledgerHoursAgo: 2,
      createTaxRecord: true,
      createVatRecord: true,
      createWhtRecord: false,
      notes:
        "Deliberate integrity issue: payment is successful but invoice state and amounts still require review.",
      scenario: "PAYMENT_NOT_PAID_REVIEW",
    },
    {
      code: "1009",
      clientKey: "palmtech",
      description: "Tax sync missing after payment",
      status: "PAID",
      issueDaysAgo: 8,
      dueDaysOffset: -2,
      paidDaysAgo: 1,
      subtotal: 160_000,
      taxRate: 7.5,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      paymentReference: "BETA-PAY-1009",
      paymentProvider: "PAYSTACK",
      createPayment: true,
      createLedger: true,
      createTaxRecord: false,
      createVatRecord: false,
      createWhtRecord: false,
      notes: "Deliberate integrity issue: payment and ledger are present but tax sync never completed.",
      scenario: "TAX_NOT_SYNCED",
    },
  ];
}

async function createWorkspaceSkeleton(
  tx: Prisma.TransactionClient,
  userId: number
) {
  const workspace = await tx.workspace.create({
    data: {
      name: BETA_DEMO_WORKSPACE_NAME,
      members: {
        create: {
          userId,
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
          businessName: BETA_DEMO_BUSINESS_NAME,
          businessType: "Accounting practice",
          industry: "Professional services",
          country: "Nigeria",
          state: "Lagos",
          defaultCurrency: DEFAULT_CURRENCY,
          onboardingCompletedAt: new Date(),
        },
      },
    },
    select: {
      id: true,
      businessProfile: {
        select: {
          id: true,
        },
      },
    },
  });

  await tx.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      workspaceId: workspace.id,
      name,
    })),
  });

  return workspace;
}

async function ensureDemoUser(
  tx: Prisma.TransactionClient
) {
  const passwordHash = await bcrypt.hash(BETA_DEMO_PASSWORD, DEFAULT_PASSWORD_ROUNDS);

  return tx.user.upsert({
    where: { email: BETA_DEMO_EMAIL },
    update: {
      password: passwordHash,
      fullName: BETA_DEMO_FULL_NAME,
      role: "USER",
    },
    create: {
      email: BETA_DEMO_EMAIL,
      password: passwordHash,
      fullName: BETA_DEMO_FULL_NAME,
      role: "USER",
    },
    select: {
      id: true,
    },
  });
}

async function clearExistingDemoWorkspaces(
  tx: Prisma.TransactionClient,
  userId: number
) {
  const existing = await tx.workspaceMember.findMany({
    where: {
      userId,
      workspace: {
        name: BETA_DEMO_WORKSPACE_NAME,
      },
    },
    select: {
      workspaceId: true,
    },
  });

  if (existing.length === 0) {
    return;
  }

  await tx.workspace.deleteMany({
    where: {
      id: {
        in: existing.map((item) => item.workspaceId),
      },
    },
  });
}

async function createClientBusiness(
  tx: Prisma.TransactionClient,
  workspaceId: number
) {
  const clientBusiness = await tx.clientBusiness.create({
    data: {
      workspaceId,
      name: "Demo Operations",
      legalName: "Demo Operations Ltd",
      industry: "Professional services",
      country: "Nigeria",
      state: "Lagos",
      taxIdentificationNumber: "TIN-DEMO-OPS-001",
      vatRegistrationNumber: "VAT-DEMO-OPS-001",
      defaultCurrency: DEFAULT_CURRENCY,
      notes:
        "Dedicated beta-test business used to demonstrate invoice, payment, ledger, and tax workflows.",
    },
    select: {
      id: true,
    },
  });

  await tx.transactionCategory.createMany({
    data: DEFAULT_TRANSACTION_CATEGORIES.map((category) => ({
      clientBusinessId: clientBusiness.id,
      name: category.name,
      type: category.type,
    })),
  });

  return clientBusiness;
}

async function createClients(
  tx: Prisma.TransactionClient,
  workspaceId: number
) {
  const created: Record<string, number> = {};

  for (const client of getBetaClients()) {
    const record = await tx.client.create({
      data: {
        workspaceId,
        name: client.name,
        companyName: client.companyName,
        email: client.email,
        phone: client.phone,
        address: client.address,
        taxId: client.taxId,
        notes: "Seeded beta demo client for onboarding and collections walkthroughs.",
      },
      select: {
        id: true,
      },
    });
    created[client.key] = record.id;
  }

  return created;
}

async function createTaxPeriod(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  clientBusinessId: number
) {
  const currentPeriod = buildCurrentMonthPeriod();

  const taxPeriod = await tx.taxPeriod.create({
    data: {
      workspaceId,
      clientBusinessId,
      periodKey: currentPeriod.periodKey,
      label: currentPeriod.label,
      periodType: "MONTHLY",
      startDate: currentPeriod.startDate,
      endDate: currentPeriod.endDate,
      year: currentPeriod.year,
      month: currentPeriod.month,
      currency: DEFAULT_CURRENCY,
      status: "IN_REVIEW",
    },
    select: {
      id: true,
    },
  });

  return taxPeriod.id;
}

async function createInvoice(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: number;
    clientId: number;
    clientBusinessId: number;
    definition: BetaInvoiceSeed;
  }
) {
  const { taxAmount, totalAmount } = buildInvoiceTotal(
    input.definition.subtotal,
    input.definition.taxRate
  );
  const issueDate = buildInvoiceDateFromDaysAgo(input.definition.issueDaysAgo, 9);
  const dueDate = buildInvoiceDateFromDaysOffset(input.definition.dueDaysOffset, 17);
  const paidAt =
    input.definition.paidHoursAgo !== undefined
      ? buildInvoiceDateFromHoursAgo(input.definition.paidHoursAgo)
      : input.definition.paidDaysAgo !== undefined
        ? buildInvoiceDateFromDaysAgo(input.definition.paidDaysAgo, 12)
        : null;

  return tx.invoice.create({
    data: {
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      clientBusinessId: input.clientBusinessId,
      invoiceNumber: `DEMO-${input.definition.code}`,
      status: input.definition.status,
      paymentReference: input.definition.paymentReference,
      paymentUrl: buildInvoicePaymentUrl(input.definition.paymentReference),
      paidAt,
      issueDate,
      dueDate,
      subtotal: input.definition.subtotal,
      taxAmount,
      totalAmount,
      vatTreatment: input.definition.vatTreatment,
      whtTreatment: input.definition.whtTreatment,
      taxCategory: input.definition.taxCategory,
      taxEvidenceStatus: "VERIFIED",
      filingPeriodKey: buildCurrentMonthPeriod().periodKey,
      sourceDocumentNumber: `DEMO-${input.definition.code}`,
      notes: `[BETA_DEMO] ${input.definition.notes}`,
      items: {
        create: [
          {
            description: input.definition.description,
            quantity: 1,
            unitPrice: input.definition.subtotal,
            taxRate: input.definition.taxRate,
            lineTotal: totalAmount,
          },
        ],
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      paymentReference: true,
      paidAt: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      vatTreatment: true,
      whtTreatment: true,
      taxCategory: true,
      sourceDocumentNumber: true,
      issueDate: true,
    },
  });
}

async function createPaymentForInvoice(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: number;
    invoiceId: number;
    reference: string;
    amountMinor: number;
    paidAt: Date;
    provider: PaymentProvider;
    scenario: BetaInvoiceSeed["scenario"];
  }
) {
  return tx.payment.create({
    data: {
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
      provider: input.provider,
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: DEFAULT_CURRENCY,
      status: "SUCCESS",
      providerTransactionId: `demo_tx_${input.reference.toLowerCase()}`,
      paidAt: input.paidAt,
      payload: {
        kind: "beta_demo_seed",
        scenario: input.scenario,
      },
    },
    select: {
      id: true,
      reference: true,
    },
  });
}

async function createLedgerForInvoice(
  tx: Prisma.TransactionClient,
  input: {
    clientBusinessId: number;
    invoiceId: number;
    invoiceNumber: string;
    amountMinor: number;
    transactionDate: Date;
  }
) {
  return tx.ledgerTransaction.create({
    data: {
      clientBusinessId: input.clientBusinessId,
      transactionDate: input.transactionDate,
      description: `Invoice payment received for ${input.invoiceNumber}`,
      reference: buildInvoiceLedgerReference(input.invoiceId),
      direction: "MONEY_IN",
      amountMinor: input.amountMinor,
      currency: DEFAULT_CURRENCY,
      vatAmountMinor: 0,
      whtAmountMinor: 0,
      vatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      sourceDocumentNumber: input.invoiceNumber,
      origin: "MANUAL",
      reviewStatus: "POSTED",
      notes: "[BETA_DEMO] Seeded ledger income entry.",
    },
    select: {
      id: true,
    },
  });
}

async function createTaxArtifactsForInvoice(
  tx: Prisma.TransactionClient,
  input: {
    userId: number;
    workspaceId: number;
    clientBusinessId: number;
    taxPeriodId: number;
    clientName: string;
    invoice: Awaited<ReturnType<typeof createInvoice>>;
    scenario: BetaInvoiceSeed["scenario"];
    createVatRecord: boolean;
    createWhtRecord: boolean;
  }
) {
  const taxRate =
    input.invoice.totalAmount > 0
      ? Number(((input.invoice.taxAmount / input.invoice.totalAmount) * 100).toFixed(2))
      : 0;

  const taxRecord = await tx.taxRecord.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      clientBusinessId: input.clientBusinessId,
      invoiceId: input.invoice.id,
      kind: "INCOME",
      amountKobo: input.invoice.totalAmount,
      taxRate,
      computedTax: input.invoice.taxAmount,
      netAmount: input.invoice.subtotal,
      currency: DEFAULT_CURRENCY,
      occurredOn: input.invoice.paidAt ?? input.invoice.issueDate,
      description: `Invoice #${input.invoice.invoiceNumber}`,
      source: "beta_demo_seed",
      vendorName: input.clientName,
      recurring: false,
      vatTreatment: input.invoice.vatTreatment,
      whtTreatment: input.invoice.whtTreatment,
      taxCategory: input.invoice.taxCategory,
      taxEvidenceStatus: "VERIFIED",
      filingPeriodKey: buildCurrentMonthPeriod().periodKey,
      sourceDocumentNumber: input.invoice.sourceDocumentNumber,
      aiMetadata: JSON.stringify({
        scenario: input.scenario,
        source: "seed-beta",
      }),
    },
    select: {
      id: true,
    },
  });

  if (input.createVatRecord) {
    await tx.vATRecord.create({
      data: {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId,
        taxPeriodId: input.taxPeriodId,
        engineKey: `beta-vat-${input.invoice.invoiceNumber.toLowerCase()}`,
        sourceType: "INVOICE",
        sourceRecordId: input.invoice.id,
        invoiceId: input.invoice.id,
        taxRecordId: taxRecord.id,
        sourceDocumentNumber: input.invoice.sourceDocumentNumber,
        counterpartyName: input.clientName,
        taxCategory: input.invoice.taxCategory,
        vatTreatment: input.invoice.vatTreatment,
        direction: "OUTPUT",
        basisAmountMinor: input.invoice.subtotal,
        vatAmountMinor: input.invoice.taxAmount,
        totalAmountMinor: input.invoice.totalAmount,
        currency: DEFAULT_CURRENCY,
        confidence: 0.98,
        flagsPayload: JSON.stringify({
          scenario: input.scenario,
          seeded: true,
        }),
        reviewed: true,
        reviewedAt: new Date(),
      },
    });
  }

  if (input.createWhtRecord && input.invoice.whtTreatment !== "NONE") {
    const whtRate = 5;
    const whtAmountMinor = Math.round(input.invoice.subtotal * (whtRate / 100));

    await tx.wHTRecord.create({
      data: {
        workspaceId: input.workspaceId,
        clientBusinessId: input.clientBusinessId,
        taxPeriodId: input.taxPeriodId,
        engineKey: `beta-wht-${input.invoice.invoiceNumber.toLowerCase()}`,
        sourceType: "INVOICE",
        sourceRecordId: input.invoice.id,
        invoiceId: input.invoice.id,
        taxRecordId: taxRecord.id,
        sourceDocumentNumber: input.invoice.sourceDocumentNumber,
        counterpartyName: input.clientName,
        counterpartyTaxId: null,
        taxCategory: input.invoice.taxCategory,
        whtTreatment: input.invoice.whtTreatment,
        direction: "RECEIVABLE",
        basisAmountMinor: input.invoice.subtotal,
        whtRate,
        whtAmountMinor,
        currency: DEFAULT_CURRENCY,
        confidence: 0.9,
        flagsPayload: JSON.stringify({
          scenario: input.scenario,
          seeded: true,
        }),
        reviewed: true,
        reviewedAt: new Date(),
      },
    });
  }

  return taxRecord.id;
}

function buildPrimaryScenarioSignals(definition: BetaInvoiceSeed) {
  switch (definition.scenario) {
    case "PAID_MISSING_PAYMENT":
      return [
        "invoice.status = PAID",
        "no Payment row exists",
        "ledger and tax rows already exist",
      ];
    case "PAID_MISSING_LEDGER":
      return [
        "invoice.status = PAID",
        "successful payment row exists",
        "no MONEY_IN ledger row exists",
      ];
    case "PAYMENT_NOT_PAID_REVIEW":
      return [
        "successful payment exists",
        "invoice remains SENT",
        "amount signals conflict, so review is required",
      ];
    case "TAX_NOT_SYNCED":
      return [
        "invoice.status = PAID",
        "payment and ledger rows exist",
        "tax record is missing",
      ];
    case "AMOUNT_MISMATCH":
      return [
        "invoice total differs from payment or ledger amount",
        "manual investigation is required",
      ];
    default:
      return [];
  }
}

export async function seedBetaDemoAccount(
  db: DemoDb,
  input: BetaDemoSeedInput = {}
): Promise<BetaDemoSeedResult> {
  const withIssues = input.withIssues ?? isBetaDemoModeEnabled();

  return db.$transaction(
    async (tx) => {
      const user = await ensureDemoUser(tx);
      await clearExistingDemoWorkspaces(tx, user.id);

      const workspace = await createWorkspaceSkeleton(tx, user.id);
      const clientBusiness = await createClientBusiness(tx, workspace.id);
      const clientIdsByKey = await createClients(tx, workspace.id);
      const taxPeriodId = await createTaxPeriod(tx, workspace.id, clientBusiness.id);

      const context: SeedWorkspaceContext = {
        userId: user.id,
        workspaceId: workspace.id,
        clientBusinessId: clientBusiness.id,
        clientIdsByKey,
        taxPeriodId,
      };

      const clientLookup = new Map(
        getBetaClients().map((client) => [client.key, client])
      );
      const definitions = [
        ...getHealthyInvoiceSeeds(),
        ...(withIssues ? getIssueInvoiceSeeds() : []),
      ];

      let paidCount = 0;
      let sentCount = 0;
      let overdueCount = 0;
      let paymentCount = 0;
      let ledgerCount = 0;
      let taxRecordCount = 0;
      let vatRecordCount = 0;
      let whtRecordCount = 0;
      const primaryScenarios: BetaDemoPrimaryScenario[] = [];

      for (const definition of definitions) {
        const clientId = context.clientIdsByKey[definition.clientKey];
        const client = clientLookup.get(definition.clientKey);
        if (!clientId || !client) {
          throw new Error(`Missing demo client mapping for ${definition.clientKey}.`);
        }

        const invoice = await createInvoice(tx, {
          workspaceId: context.workspaceId,
          clientId,
          clientBusinessId: context.clientBusinessId,
          definition,
        });

        if (invoice.status === "PAID") paidCount += 1;
        if (invoice.status === "SENT") sentCount += 1;
        if (invoice.status === "OVERDUE") overdueCount += 1;

        const paymentReference =
          definition.paymentReference ?? `BETA-ALT-PAY-${definition.code}`;

        if (definition.createPayment) {
          const paymentTimestamp =
            definition.paymentHoursAgo !== undefined
              ? buildInvoiceDateFromHoursAgo(definition.paymentHoursAgo)
              : definition.paymentDaysAgo !== undefined
                ? buildInvoiceDateFromDaysAgo(definition.paymentDaysAgo, 12)
                : invoice.paidAt ?? new Date();

          await createPaymentForInvoice(tx, {
            workspaceId: context.workspaceId,
            invoiceId: invoice.id,
            reference: paymentReference,
            amountMinor: definition.paymentAmountMinor ?? invoice.totalAmount,
            paidAt: paymentTimestamp,
            provider: definition.paymentProvider ?? "PAYSTACK",
            scenario: definition.scenario,
          });
          paymentCount += 1;
        }

        if (definition.createLedger) {
          const ledgerTimestamp =
            definition.ledgerHoursAgo !== undefined
              ? buildInvoiceDateFromHoursAgo(definition.ledgerHoursAgo)
              : definition.ledgerDaysAgo !== undefined
                ? buildInvoiceDateFromDaysAgo(definition.ledgerDaysAgo, 13)
                : invoice.paidAt ?? new Date();

          await createLedgerForInvoice(tx, {
            clientBusinessId: context.clientBusinessId,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amountMinor: definition.ledgerAmountMinor ?? invoice.totalAmount,
            transactionDate: ledgerTimestamp,
          });
          ledgerCount += 1;
        }

        if (definition.createTaxRecord) {
          await createTaxArtifactsForInvoice(tx, {
            userId: context.userId,
            workspaceId: context.workspaceId,
            clientBusinessId: context.clientBusinessId,
            taxPeriodId: context.taxPeriodId,
            clientName: client.companyName,
            invoice,
            scenario: definition.scenario,
            createVatRecord: definition.createVatRecord,
            createWhtRecord: definition.createWhtRecord,
          });

          taxRecordCount += 1;
          if (definition.createVatRecord) {
            vatRecordCount += 1;
          }
          if (definition.createWhtRecord && definition.whtTreatment !== "NONE") {
            whtRecordCount += 1;
          }
        }

        if (definition.scenario !== "HEALTHY") {
          primaryScenarios.push({
            scenario: definition.scenario,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: definition.status,
            paymentReference: definition.paymentReference ?? paymentReference,
            expectedSignals: buildPrimaryScenarioSignals(definition),
          });
        }

        const hasAmountMismatch =
          (definition.createPayment &&
            (definition.paymentAmountMinor ?? invoice.totalAmount) !== invoice.totalAmount) ||
          (definition.createLedger &&
            (definition.ledgerAmountMinor ?? invoice.totalAmount) !== invoice.totalAmount);

        if (
          hasAmountMismatch &&
          !primaryScenarios.some(
            (scenario) =>
              scenario.scenario === "AMOUNT_MISMATCH" && scenario.invoiceId === invoice.id
          )
        ) {
          primaryScenarios.push({
            scenario: "AMOUNT_MISMATCH",
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: definition.status,
            paymentReference: definition.paymentReference ?? paymentReference,
            expectedSignals: buildPrimaryScenarioSignals({
              ...definition,
              scenario: "AMOUNT_MISMATCH",
            }),
          });
        }
      }

      return {
        email: BETA_DEMO_EMAIL,
        password: BETA_DEMO_PASSWORD,
        userId: context.userId,
        workspaceId: context.workspaceId,
        workspaceName: BETA_DEMO_WORKSPACE_NAME,
        businessProfileId: workspace.businessProfile?.id ?? 0,
        clientBusinessId: context.clientBusinessId,
        withIssues,
        invoiceCounts: {
          total: definitions.length,
          paid: paidCount,
          sent: sentCount,
          overdue: overdueCount,
        },
        paymentCount,
        ledgerCount,
        taxRecordCount,
        vatRecordCount,
        whtRecordCount,
        primaryScenarios,
      };
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    }
  );
}
