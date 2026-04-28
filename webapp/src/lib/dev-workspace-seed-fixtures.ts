import type {
  BankTransactionPostingReadiness,
  BankTransactionReviewStatus,
  BankTransactionStatus,
  BankTransactionType,
  LedgerCategoryType,
  LedgerDirection,
  TaxCategory,
  TaxEvidenceStatus,
  TaxReviewStatus,
  TransactionReviewStatus,
  VatTreatment,
  WhtTreatment,
} from "@prisma/client";

export const DEV_WORKSPACE_SEED_SOURCE = "phase2_dev_seed";
export const DEV_WORKSPACE_SEED_REFERENCE_PREFIX = "P2SEED";
export const DEV_WORKSPACE_SEED_ENGINE_PREFIX = "phase2-dev-seed";
export const DEV_WORKSPACE_SEED_TAG = "[PHASE2_DEV_SEED]";

export type DevSeedClientBusiness = {
  key: string;
  name: string;
  legalName: string;
  industry: string;
  state: string;
  country: string;
  taxIdentificationNumber: string;
  vatRegistrationNumber: string;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  notes: string;
};

export type DevSeedBankAccount = {
  key: string;
  businessKey: string;
  name: string;
  bankName: string;
  accountNumber: string;
  currency: string;
};

export type DevSeedVendor = {
  key: string;
  businessKey: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  taxIdentificationNumber?: string | null;
  vatRegistrationNumber?: string | null;
  notes?: string | null;
};

export type DevSeedTransactionCategory = {
  businessKey: string;
  name: string;
  type: LedgerCategoryType;
};

export type DevSeedExpenseCategory = {
  name: string;
};

export type DevSeedBookkeepingUpload = {
  key: string;
  businessKey: string;
  fileName: string;
  sourceType: "RECEIPT" | "BANK_STATEMENT" | "CSV" | "OTHER";
  documentType: "RECEIPT" | "INVOICE" | "UNKNOWN";
  status:
    | "UPLOADED"
    | "READY_FOR_REVIEW"
    | "APPROVED"
    | "PARTIALLY_APPROVED"
    | "PROCESSING";
  rawText?: string | null;
  reviewNotes?: string | null;
};

export type DevSeedTransaction = {
  key: string;
  businessKey: string;
  accountKey: string;
  vendorKey?: string | null;
  categoryName?: string | null;
  expenseCategoryName?: string | null;
  description: string;
  reference: string;
  type: BankTransactionType;
  amountMinor: number;
  monthOffset: number;
  day: number;
  hour?: number;
  status: BankTransactionStatus;
  reviewStatus: BankTransactionReviewStatus;
  postingReadiness: BankTransactionPostingReadiness;
  suggestedCounterparty?: string | null;
  suggestedCategoryName?: string | null;
  normalizedMerchantName?: string | null;
  reviewNotes?: string | null;
  suggestedVatTreatment?: VatTreatment;
  suggestedWhtTreatment?: WhtTreatment;
  vatTreatment?: VatTreatment;
  whtTreatment?: WhtTreatment;
  vatRate?: number;
  whtRate?: number;
  taxCategory?: TaxCategory | null;
  taxEvidenceStatus?: TaxEvidenceStatus;
  taxReviewStatus?: TaxReviewStatus;
  createLedger?: boolean;
  ledgerDirection?: LedgerDirection;
  ledgerReviewStatus?: TransactionReviewStatus;
  createTaxRecord?: boolean;
  createVatRecord?: boolean;
  createWhtRecord?: boolean;
  duplicateOfKey?: string | null;
  duplicateConfidence?: number | null;
  duplicateReason?: string | null;
  suspiciousPatternScore?: number | null;
  suspiciousPatternReason?: string | null;
  confidenceScore?: number | null;
  suggestionConfidence?: number | null;
  suggestionReason?: string | null;
  autoBookkeepingConfidence?: number | null;
  autoBookkeepingReason?: string | null;
  recurring?: boolean;
};

export type DevWorkspaceSeedFixture = {
  clientBusinesses: DevSeedClientBusiness[];
  bankAccounts: DevSeedBankAccount[];
  vendors: DevSeedVendor[];
  transactionCategories: DevSeedTransactionCategory[];
  expenseCategories: DevSeedExpenseCategory[];
  uploads: DevSeedBookkeepingUpload[];
  transactions: DevSeedTransaction[];
};

function toMinor(naira: number) {
  return Math.round(naira * 100);
}

function clampDay(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(day, lastDay));
}

export function buildFixtureDate(input: {
  monthOffset: number;
  day: number;
  hour?: number;
  minute?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const base = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + input.monthOffset,
      1,
      input.hour ?? 11,
      input.minute ?? 0,
      0,
      0
    )
  );
  const safeDay = clampDay(base.getUTCFullYear(), base.getUTCMonth(), input.day);
  base.setUTCDate(safeDay);
  return base;
}

export function buildPhase2DevWorkspaceFixture(now = new Date()): DevWorkspaceSeedFixture {
  const clientBusinesses: DevSeedClientBusiness[] = [
    {
      key: "lagos_ops",
      name: "Lagos Ops Ltd",
      legalName: "Lagos Operations Limited",
      industry: "Technology Services",
      state: "Lagos",
      country: "Nigeria",
      taxIdentificationNumber: "TIN-P2SEED-001",
      vatRegistrationNumber: "VAT-P2SEED-001",
      defaultCurrency: "NGN",
      fiscalYearStartMonth: 1,
      notes: `${DEV_WORKSPACE_SEED_TAG} Primary operating business with recurring spend, tax exposure, and review work.`,
    },
    {
      key: "retail_hub",
      name: "Retail Hub Stores",
      legalName: "Retail Hub Stores Limited",
      industry: "Retail",
      state: "Abuja FCT",
      country: "Nigeria",
      taxIdentificationNumber: "TIN-P2SEED-002",
      vatRegistrationNumber: "VAT-P2SEED-002",
      defaultCurrency: "NGN",
      fiscalYearStartMonth: 1,
      notes: `${DEV_WORKSPACE_SEED_TAG} Secondary business with sales, inventory, and review edge cases.`,
    },
  ];

  const bankAccounts: DevSeedBankAccount[] = [
    {
      key: "lagos_ops_main",
      businessKey: "lagos_ops",
      name: "Main Operations Account",
      bankName: "Sterling Bank",
      accountNumber: "P2SEED-001-OPS",
      currency: "NGN",
    },
    {
      key: "lagos_ops_tax",
      businessKey: "lagos_ops",
      name: "Tax Holding Account",
      bankName: "GTBank",
      accountNumber: "P2SEED-002-TAX",
      currency: "NGN",
    },
    {
      key: "retail_hub_main",
      businessKey: "retail_hub",
      name: "Retail Collections Account",
      bankName: "Access Bank",
      accountNumber: "P2SEED-003-RTL",
      currency: "NGN",
    },
  ];

  const vendors: DevSeedVendor[] = [
    {
      key: "aws",
      businessKey: "lagos_ops",
      name: "Amazon Web Services",
      email: "billing@amazonaws.com",
      notes: `${DEV_WORKSPACE_SEED_TAG} Cloud infrastructure vendor.`,
    },
    {
      key: "mtn",
      businessKey: "lagos_ops",
      name: "MTN Nigeria",
      phone: "+2348030000000",
      notes: `${DEV_WORKSPACE_SEED_TAG} Recurring internet provider.`,
    },
    {
      key: "google_ads",
      businessKey: "lagos_ops",
      name: "Google Ads",
      notes: `${DEV_WORKSPACE_SEED_TAG} Marketing channel used to trigger a spend spike.`,
    },
    {
      key: "microsoft",
      businessKey: "lagos_ops",
      name: "Microsoft 365",
      notes: `${DEV_WORKSPACE_SEED_TAG} Duplicate vendor charge scenario.`,
    },
    {
      key: "contractor_collective",
      businessKey: "lagos_ops",
      name: "Contractor Collective",
      taxIdentificationNumber: "TIN-CONT-P2SEED-01",
      notes: `${DEV_WORKSPACE_SEED_TAG} WHT payable scenario.`,
    },
    {
      key: "urban_rentals",
      businessKey: "retail_hub",
      name: "Urban Rentals",
      notes: `${DEV_WORKSPACE_SEED_TAG} Pending rent review scenario.`,
    },
    {
      key: "prime_wholesale",
      businessKey: "retail_hub",
      name: "Prime Wholesale",
      vatRegistrationNumber: "VAT-PWH-P2SEED",
      notes: `${DEV_WORKSPACE_SEED_TAG} Inventory supplier.`,
    },
    {
      key: "swift_logistics",
      businessKey: "retail_hub",
      name: "Swift Logistics",
      notes: `${DEV_WORKSPACE_SEED_TAG} Baseline logistics spend.`,
    },
  ];

  const transactionCategories: DevSeedTransactionCategory[] = [
    { businessKey: "lagos_ops", name: "Revenue", type: "INCOME" },
    { businessKey: "lagos_ops", name: "Operations", type: "EXPENSE" },
    { businessKey: "lagos_ops", name: "Marketing", type: "EXPENSE" },
    { businessKey: "lagos_ops", name: "Professional fees", type: "EXPENSE" },
    { businessKey: "lagos_ops", name: "Rent and utilities", type: "EXPENSE" },
    { businessKey: "lagos_ops", name: "Software", type: "EXPENSE" },
    { businessKey: "retail_hub", name: "Revenue", type: "INCOME" },
    { businessKey: "retail_hub", name: "Cost of sales", type: "EXPENSE" },
    { businessKey: "retail_hub", name: "Operations", type: "EXPENSE" },
    { businessKey: "retail_hub", name: "Travel and logistics", type: "EXPENSE" },
    { businessKey: "retail_hub", name: "Rent and utilities", type: "EXPENSE" },
  ];

  const expenseCategories: DevSeedExpenseCategory[] = [
    { name: "Marketing" },
    { name: "Software" },
    { name: "Professional Services" },
    { name: "Utilities" },
    { name: "Inventory" },
    { name: "Rent" },
    { name: "Logistics" },
  ];

  const uploads: DevSeedBookkeepingUpload[] = [
    {
      key: "lagos_ops_march_upload",
      businessKey: "lagos_ops",
      fileName: "P2 Seed March receipts.pdf",
      sourceType: "RECEIPT",
      documentType: "RECEIPT",
      status: "APPROVED",
      reviewNotes: "Seeded receipts pack for March activity.",
    },
    {
      key: "retail_hub_april_upload",
      businessKey: "retail_hub",
      fileName: "P2 Seed Retail statements.csv",
      sourceType: "CSV",
      documentType: "UNKNOWN",
      status: "READY_FOR_REVIEW",
      reviewNotes: "Seeded CSV statement for review workflow.",
    },
  ];

  const transactions: DevSeedTransaction[] = [
    {
      key: "google_ads_jan",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "google_ads",
      categoryName: "Marketing",
      expenseCategoryName: "Marketing",
      description: "Google Ads campaign spend",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-GA-01`,
      type: "DEBIT",
      amountMinor: toMinor(320000),
      monthOffset: -3,
      day: 7,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Google Ads",
      normalizedMerchantName: "google ads",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
      recurring: true,
    },
    {
      key: "mtn_jan",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "mtn",
      categoryName: "Rent and utilities",
      expenseCategoryName: "Utilities",
      description: "MTN broadband renewal",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-MTN-01`,
      type: "DEBIT",
      amountMinor: toMinor(180000),
      monthOffset: -3,
      day: 26,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "MTN Nigeria",
      normalizedMerchantName: "mtn nigeria",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "OPERATING_EXPENSE",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
      recurring: true,
    },
    {
      key: "google_ads_feb",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "google_ads",
      categoryName: "Marketing",
      expenseCategoryName: "Marketing",
      description: "Google Ads campaign spend",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-GA-02`,
      type: "DEBIT",
      amountMinor: toMinor(340000),
      monthOffset: -2,
      day: 6,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Google Ads",
      normalizedMerchantName: "google ads",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
      recurring: true,
    },
    {
      key: "mtn_feb",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "mtn",
      categoryName: "Rent and utilities",
      expenseCategoryName: "Utilities",
      description: "MTN broadband renewal",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-MTN-02`,
      type: "DEBIT",
      amountMinor: toMinor(182000),
      monthOffset: -2,
      day: 25,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "MTN Nigeria",
      normalizedMerchantName: "mtn nigeria",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "OPERATING_EXPENSE",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
      recurring: true,
    },
    {
      key: "lagos_revenue_prev",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      categoryName: "Revenue",
      description: "Client payment - platform implementation",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-REV-03`,
      type: "CREDIT",
      amountMinor: toMinor(4800000),
      monthOffset: -1,
      day: 18,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Enterprise client",
      normalizedMerchantName: "enterprise client",
      vatTreatment: "OUTPUT",
      suggestedVatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_IN",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "retail_revenue_prev",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      categoryName: "Revenue",
      description: "Retail collections settlement",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-RTL-03`,
      type: "CREDIT",
      amountMinor: toMinor(3600000),
      monthOffset: -1,
      day: 20,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Retail customers",
      normalizedMerchantName: "retail customers",
      vatTreatment: "OUTPUT",
      suggestedVatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "SALES_GOODS",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_IN",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "contractor_prev",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_tax",
      vendorKey: "contractor_collective",
      categoryName: "Professional fees",
      expenseCategoryName: "Professional Services",
      description: "Contractor payout - product team",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-CON-03`,
      type: "DEBIT",
      amountMinor: toMinor(800000),
      monthOffset: -1,
      day: 19,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Contractor Collective",
      normalizedMerchantName: "contractor collective",
      vatTreatment: "NONE",
      suggestedVatTreatment: "NONE",
      whtTreatment: "PAYABLE",
      suggestedWhtTreatment: "PAYABLE",
      whtRate: 0.05,
      taxCategory: "PROFESSIONAL_SERVICE",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createWhtRecord: true,
    },
    {
      key: "aws_prev",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "aws",
      categoryName: "Software",
      expenseCategoryName: "Software",
      description: "AWS infrastructure bill",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-AWS-03`,
      type: "DEBIT",
      amountMinor: toMinor(500000),
      monthOffset: -1,
      day: 7,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Amazon Web Services",
      normalizedMerchantName: "amazon web services",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "google_ads_mar",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "google_ads",
      categoryName: "Marketing",
      expenseCategoryName: "Marketing",
      description: "Google Ads campaign spend",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-GA-03`,
      type: "DEBIT",
      amountMinor: toMinor(360000),
      monthOffset: -1,
      day: 6,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Google Ads",
      normalizedMerchantName: "google ads",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
      recurring: true,
    },
    {
      key: "mtn_mar",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "mtn",
      categoryName: "Rent and utilities",
      expenseCategoryName: "Utilities",
      description: "MTN broadband renewal",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-MTN-03`,
      type: "DEBIT",
      amountMinor: toMinor(185000),
      monthOffset: -1,
      day: 27,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "MTN Nigeria",
      normalizedMerchantName: "mtn nigeria",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "OPERATING_EXPENSE",
      taxEvidenceStatus: "PENDING",
      taxReviewStatus: "UNREVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
      recurring: true,
    },
    {
      key: "retail_inventory_prev",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      vendorKey: "prime_wholesale",
      categoryName: "Cost of sales",
      expenseCategoryName: "Inventory",
      description: "Prime Wholesale inventory restock",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-INV-03`,
      type: "DEBIT",
      amountMinor: toMinor(1450000),
      monthOffset: -1,
      day: 14,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Prime Wholesale",
      normalizedMerchantName: "prime wholesale",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "PURCHASE_GOODS",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "logistics_prev",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      vendorKey: "swift_logistics",
      categoryName: "Travel and logistics",
      expenseCategoryName: "Logistics",
      description: "Swift Logistics distribution run",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-LOG-03`,
      type: "DEBIT",
      amountMinor: toMinor(240000),
      monthOffset: -1,
      day: 12,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Swift Logistics",
      normalizedMerchantName: "swift logistics",
      vatTreatment: "NONE",
      suggestedVatTreatment: "NONE",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      taxCategory: "OPERATING_EXPENSE",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
    },
    {
      key: "lagos_revenue_current",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      categoryName: "Revenue",
      description: "Client payment - monthly platform retainer",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-REV-04`,
      type: "CREDIT",
      amountMinor: toMinor(6500000),
      monthOffset: 0,
      day: 2,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Enterprise client",
      normalizedMerchantName: "enterprise client",
      vatTreatment: "OUTPUT",
      suggestedVatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_IN",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "retail_revenue_current",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      categoryName: "Revenue",
      description: "Retail collections settlement",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-RTL-04`,
      type: "CREDIT",
      amountMinor: toMinor(4200000),
      monthOffset: 0,
      day: 3,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Retail customers",
      normalizedMerchantName: "retail customers",
      vatTreatment: "OUTPUT",
      suggestedVatTreatment: "OUTPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "SALES_GOODS",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_IN",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "contractor_current",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_tax",
      vendorKey: "contractor_collective",
      categoryName: "Professional fees",
      expenseCategoryName: "Professional Services",
      description: "Contractor payout - product team",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-CON-04`,
      type: "DEBIT",
      amountMinor: toMinor(1200000),
      monthOffset: 0,
      day: 4,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Contractor Collective",
      normalizedMerchantName: "contractor collective",
      vatTreatment: "NONE",
      suggestedVatTreatment: "NONE",
      whtTreatment: "PAYABLE",
      suggestedWhtTreatment: "PAYABLE",
      whtRate: 0.05,
      taxCategory: "PROFESSIONAL_SERVICE",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createWhtRecord: true,
    },
    {
      key: "aws_current",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "aws",
      categoryName: "Software",
      expenseCategoryName: "Software",
      description: "AWS infrastructure bill",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-AWS-04`,
      type: "DEBIT",
      amountMinor: toMinor(650000),
      monthOffset: 0,
      day: 1,
      status: "MATCHED",
      reviewStatus: "POSTED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Amazon Web Services",
      normalizedMerchantName: "amazon web services",
      vatTreatment: "INPUT",
      suggestedVatTreatment: "INPUT",
      whtTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      vatRate: 0.075,
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      taxReviewStatus: "REVIEWED",
      createLedger: true,
      ledgerDirection: "MONEY_OUT",
      ledgerReviewStatus: "POSTED",
      createTaxRecord: true,
      createVatRecord: true,
    },
    {
      key: "google_ads_current",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "google_ads",
      categoryName: "Marketing",
      expenseCategoryName: "Marketing",
      description: "Google Ads campaign acceleration",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-GA-04`,
      type: "DEBIT",
      amountMinor: toMinor(2150000),
      monthOffset: 0,
      day: 5,
      status: "UNMATCHED",
      reviewStatus: "PENDING_REVIEW",
      postingReadiness: "REVIEW_REQUIRED",
      suggestedCounterparty: "Google Ads",
      suggestedCategoryName: "Marketing",
      normalizedMerchantName: "google ads",
      suggestedVatTreatment: "INPUT",
      suggestedWhtTreatment: "NONE",
      reviewNotes: "Large jump from last month. Confirm campaign approval before posting.",
      suspiciousPatternScore: 0.97,
      suspiciousPatternReason: "Spend on Google Ads is materially above the recent monthly average.",
      confidenceScore: 0.92,
      suggestionConfidence: 0.94,
      suggestionReason: "Previous Google Ads charges map to Marketing.",
      autoBookkeepingConfidence: 0.88,
      autoBookkeepingReason: "Historical merchant mapping strongly suggests a marketing expense.",
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "PENDING",
      taxReviewStatus: "UNREVIEWED",
      createTaxRecord: true,
      recurring: true,
    },
    {
      key: "microsoft_dup_a",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "microsoft",
      categoryName: "Software",
      expenseCategoryName: "Software",
      description: "Microsoft 365 annual subscription",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-MS-04A`,
      type: "DEBIT",
      amountMinor: toMinor(450000),
      monthOffset: 0,
      day: 3,
      status: "REVIEW_REQUIRED",
      reviewStatus: "PENDING_REVIEW",
      postingReadiness: "REVIEW_REQUIRED",
      suggestedCounterparty: "Microsoft 365",
      suggestedCategoryName: "Software",
      normalizedMerchantName: "microsoft 365",
      suggestedVatTreatment: "INPUT",
      suggestedWhtTreatment: "NONE",
      reviewNotes: "Potential duplicate subscription debit. Keep one and void the extra charge if confirmed.",
      duplicateConfidence: 0.96,
      duplicateReason: "Two Microsoft subscription debits landed within one day for nearly identical amounts.",
      confidenceScore: 0.89,
      suggestionConfidence: 0.9,
      suggestionReason: "Recurring software charge matches Microsoft 365 history.",
      autoBookkeepingConfidence: 0.86,
      autoBookkeepingReason: "Recurring software merchant detected, but duplicate review is still required.",
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "PENDING",
      taxReviewStatus: "UNREVIEWED",
      createTaxRecord: true,
    },
    {
      key: "microsoft_dup_b",
      businessKey: "lagos_ops",
      accountKey: "lagos_ops_main",
      vendorKey: "microsoft",
      categoryName: "Software",
      expenseCategoryName: "Software",
      description: "Microsoft 365 annual subscription",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-MS-04B`,
      type: "DEBIT",
      amountMinor: toMinor(452500),
      monthOffset: 0,
      day: 4,
      status: "REVIEW_REQUIRED",
      reviewStatus: "FLAGGED",
      postingReadiness: "REVIEW_REQUIRED",
      suggestedCounterparty: "Microsoft 365",
      suggestedCategoryName: "Software",
      normalizedMerchantName: "microsoft 365",
      suggestedVatTreatment: "INPUT",
      suggestedWhtTreatment: "NONE",
      reviewNotes: "Flagged after duplicate check. Confirm whether bank reversed one of the charges.",
      duplicateOfKey: "microsoft_dup_a",
      duplicateConfidence: 0.96,
      duplicateReason: "Pair matches another Microsoft debit within the duplicate alert threshold.",
      confidenceScore: 0.87,
      suggestionConfidence: 0.88,
      suggestionReason: "Recurring software charge matches Microsoft 365 history.",
      autoBookkeepingConfidence: 0.8,
      autoBookkeepingReason: "Merchant and category match prior software charges, but duplicate review takes priority.",
      taxCategory: "PURCHASE_SERVICES",
      taxEvidenceStatus: "MISSING",
      taxReviewStatus: "REOPENED",
      createTaxRecord: true,
    },
    {
      key: "retail_rent_open",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      vendorKey: "urban_rentals",
      categoryName: "Rent and utilities",
      expenseCategoryName: "Rent",
      description: "Urban Rentals monthly rent",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-RNT-04`,
      type: "DEBIT",
      amountMinor: toMinor(900000),
      monthOffset: 0,
      day: 4,
      status: "UNMATCHED",
      reviewStatus: "IMPORTED",
      postingReadiness: "NOT_READY",
      suggestedCounterparty: "Urban Rentals",
      suggestedCategoryName: "Rent and utilities",
      normalizedMerchantName: "urban rentals",
      suggestedVatTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      reviewNotes: "New rent invoice imported. Attach lease invoice before posting.",
      confidenceScore: 0.74,
      suggestionConfidence: 0.79,
      suggestionReason: "Merchant name suggests the rent and utilities category.",
      autoBookkeepingConfidence: 0.7,
      autoBookkeepingReason: "Rent-like merchant detected but supporting evidence is missing.",
      taxCategory: "RENT",
      taxEvidenceStatus: "MISSING",
      taxReviewStatus: "UNREVIEWED",
      createTaxRecord: true,
    },
    {
      key: "retail_cash_flagged",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      categoryName: "Operations",
      expenseCategoryName: "Logistics",
      description: "ATM cash withdrawal",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-CSH-04`,
      type: "DEBIT",
      amountMinor: toMinor(420000),
      monthOffset: 0,
      day: 2,
      status: "REVIEW_REQUIRED",
      reviewStatus: "FLAGGED",
      postingReadiness: "REVIEW_REQUIRED",
      suggestedCounterparty: "Cash withdrawal",
      suggestedCategoryName: "Operations",
      normalizedMerchantName: "cash withdrawal",
      suggestedVatTreatment: "NONE",
      suggestedWhtTreatment: "NONE",
      reviewNotes: "Flagged because purpose and supporting documents are still unclear.",
      suspiciousPatternScore: 0.81,
      suspiciousPatternReason: "Cash withdrawal exceeded the normal operating threshold for this business.",
      confidenceScore: 0.52,
      suggestionConfidence: 0.55,
      suggestionReason: "Low-confidence operations guess pending manual review.",
      taxCategory: "OPERATING_EXPENSE",
      taxEvidenceStatus: "MISSING",
      taxReviewStatus: "REOPENED",
      createTaxRecord: true,
    },
    {
      key: "review_ready_chairs",
      businessKey: "retail_hub",
      accountKey: "retail_hub_main",
      categoryName: "Operations",
      expenseCategoryName: "Logistics",
      description: "Store fixtures and chairs",
      reference: `${DEV_WORKSPACE_SEED_REFERENCE_PREFIX}-OPS-04`,
      type: "DEBIT",
      amountMinor: toMinor(310000),
      monthOffset: 0,
      day: 1,
      status: "SUGGESTED",
      reviewStatus: "REVIEWED",
      postingReadiness: "READY_TO_POST",
      suggestedCounterparty: "Store supplier",
      suggestedCategoryName: "Operations",
      normalizedMerchantName: "store supplier",
      suggestedVatTreatment: "INPUT",
      suggestedWhtTreatment: "NONE",
      reviewNotes: "Reviewed and ready for posting once the batch approval is triggered.",
      confidenceScore: 0.9,
      suggestionConfidence: 0.91,
      suggestionReason: "Category matches prior operations supply charges.",
      autoBookkeepingConfidence: 0.85,
      autoBookkeepingReason: "High confidence operations expense based on merchant pattern.",
      taxCategory: "OPERATING_EXPENSE",
      taxEvidenceStatus: "ATTACHED",
      taxReviewStatus: "REVIEWED",
      createTaxRecord: true,
    },
  ];

  return {
    clientBusinesses,
    bankAccounts,
    vendors,
    transactionCategories,
    expenseCategories,
    uploads,
    transactions: transactions
      .slice()
      .sort(
        (left, right) =>
          buildFixtureDate({
            monthOffset: left.monthOffset,
            day: left.day,
            hour: left.hour,
            now,
          }).getTime() -
          buildFixtureDate({
            monthOffset: right.monthOffset,
            day: right.day,
            hour: right.hour,
            now,
          }).getTime()
      ),
  };
}
