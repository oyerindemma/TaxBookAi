-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "periodKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxPeriod_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxPeriod_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxComputation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "taxType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "outputVatMinor" INTEGER NOT NULL DEFAULT 0,
    "inputVatMinor" INTEGER NOT NULL DEFAULT 0,
    "netVatMinor" INTEGER NOT NULL DEFAULT 0,
    "whtDeductedMinor" INTEGER NOT NULL DEFAULT 0,
    "whtSufferedMinor" INTEGER NOT NULL DEFAULT 0,
    "accountingProfitMinor" INTEGER NOT NULL DEFAULT 0,
    "addBacksMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "taxAdjustedProfitMinor" INTEGER NOT NULL DEFAULT 0,
    "rulesVersion" TEXT,
    "summaryPayload" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxComputation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxComputation_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxComputation_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VATRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "engineKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" INTEGER,
    "sourceDocumentId" INTEGER,
    "invoiceId" INTEGER,
    "ledgerTransactionId" INTEGER,
    "bookkeepingDraftId" INTEGER,
    "taxRecordId" INTEGER,
    "bankTransactionId" INTEGER,
    "sourceDocumentNumber" TEXT,
    "counterpartyName" TEXT,
    "taxCategory" TEXT,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "direction" TEXT NOT NULL,
    "basisAmountMinor" INTEGER NOT NULL,
    "vatAmountMinor" INTEGER NOT NULL,
    "totalAmountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "confidence" REAL,
    "flagsPayload" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VATRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_bookkeepingDraftId_fkey" FOREIGN KEY ("bookkeepingDraftId") REFERENCES "BookkeepingDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VATRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WHTRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "engineKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" INTEGER,
    "sourceDocumentId" INTEGER,
    "invoiceId" INTEGER,
    "ledgerTransactionId" INTEGER,
    "bookkeepingDraftId" INTEGER,
    "taxRecordId" INTEGER,
    "bankTransactionId" INTEGER,
    "sourceDocumentNumber" TEXT,
    "counterpartyName" TEXT,
    "counterpartyTaxId" TEXT,
    "taxCategory" TEXT,
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "direction" TEXT NOT NULL,
    "basisAmountMinor" INTEGER NOT NULL,
    "whtRate" REAL NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "confidence" REAL,
    "flagsPayload" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WHTRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_bookkeepingDraftId_fkey" FOREIGN KEY ("bookkeepingDraftId") REFERENCES "BookkeepingDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WHTRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "taxType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "sourceReference" TEXT,
    "createdByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxAdjustment_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxAdjustment_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilingDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "taxType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "title" TEXT,
    "summaryPayload" TEXT,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "readyAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilingDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingDraft_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingDraft_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingDraft_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilingItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filingDraftId" INTEGER NOT NULL,
    "vatRecordId" INTEGER,
    "whtRecordId" INTEGER,
    "taxAdjustmentId" INTEGER,
    "label" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" INTEGER,
    "amountMinor" INTEGER NOT NULL,
    "taxAmountMinor" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "flagsPayload" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilingItem_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingItem_vatRecordId_fkey" FOREIGN KEY ("vatRecordId") REFERENCES "VATRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingItem_whtRecordId_fkey" FOREIGN KEY ("whtRecordId") REFERENCES "WHTRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingItem_taxAdjustmentId_fkey" FOREIGN KEY ("taxAdjustmentId") REFERENCES "TaxAdjustment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilingEvidence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "filingDraftId" INTEGER,
    "taxRecordId" INTEGER,
    "bookkeepingUploadId" INTEGER,
    "vatRecordId" INTEGER,
    "whtRecordId" INTEGER,
    "label" TEXT NOT NULL,
    "evidenceKind" TEXT NOT NULL DEFAULT 'SOURCE_DOCUMENT',
    "note" TEXT,
    "url" TEXT,
    "uploadedByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilingEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_bookkeepingUploadId_fkey" FOREIGN KEY ("bookkeepingUploadId") REFERENCES "BookkeepingUpload" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_vatRecordId_fkey" FOREIGN KEY ("vatRecordId") REFERENCES "VATRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_whtRecordId_fkey" FOREIGN KEY ("whtRecordId") REFERENCES "WHTRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubmissionLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "filingDraftId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "provider" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubmissionLog_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubmissionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LedgerTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientBusinessId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "bankTransactionId" INTEGER,
    "sourceDraftId" INTEGER,
    "createdByUserId" INTEGER,
    "transactionDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "direction" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "taxCategory" TEXT,
    "taxEvidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "filingPeriodKey" TEXT,
    "sourceDocumentNumber" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LedgerTransaction_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "BookkeepingDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LedgerTransaction" ("amountMinor", "bankTransactionId", "categoryId", "clientBusinessId", "createdAt", "createdByUserId", "currency", "description", "direction", "id", "notes", "origin", "reference", "reviewStatus", "sourceDraftId", "transactionDate", "updatedAt", "vatAmountMinor", "vatTreatment", "vendorId", "whtAmountMinor", "whtTreatment") SELECT "amountMinor", "bankTransactionId", "categoryId", "clientBusinessId", "createdAt", "createdByUserId", "currency", "description", "direction", "id", "notes", "origin", "reference", "reviewStatus", "sourceDraftId", "transactionDate", "updatedAt", "vatAmountMinor", "vatTreatment", "vendorId", "whtAmountMinor", "whtTreatment" FROM "LedgerTransaction";
DROP TABLE "LedgerTransaction";
ALTER TABLE "new_LedgerTransaction" RENAME TO "LedgerTransaction";
CREATE UNIQUE INDEX "LedgerTransaction_sourceDraftId_key" ON "LedgerTransaction"("sourceDraftId");
CREATE INDEX "LedgerTransaction_clientBusinessId_transactionDate_idx" ON "LedgerTransaction"("clientBusinessId", "transactionDate");
CREATE INDEX "LedgerTransaction_clientBusinessId_reviewStatus_idx" ON "LedgerTransaction"("clientBusinessId", "reviewStatus");
CREATE INDEX "LedgerTransaction_vendorId_transactionDate_idx" ON "LedgerTransaction"("vendorId", "transactionDate");
CREATE INDEX "LedgerTransaction_categoryId_transactionDate_idx" ON "LedgerTransaction"("categoryId", "transactionDate");
CREATE INDEX "LedgerTransaction_bankTransactionId_idx" ON "LedgerTransaction"("bankTransactionId");
CREATE TABLE "new_BookkeepingDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uploadId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "reviewedByUserId" INTEGER,
    "proposedDate" DATETIME,
    "description" TEXT,
    "reference" TEXT,
    "documentNumber" TEXT,
    "vendorName" TEXT,
    "suggestedCategoryName" TEXT,
    "paymentMethod" TEXT,
    "direction" TEXT NOT NULL,
    "subtotalMinor" INTEGER,
    "amountMinor" INTEGER,
    "totalAmountMinor" INTEGER,
    "taxAmountMinor" INTEGER,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "taxCategory" TEXT,
    "taxEvidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "filingPeriodKey" TEXT,
    "confidence" REAL,
    "deductibilityHint" TEXT,
    "fieldConfidencePayload" TEXT,
    "lineItemsPayload" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "aiPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    CONSTRAINT "BookkeepingDraft_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "BookkeepingUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BookkeepingDraft" ("aiPayload", "amountMinor", "approvedAt", "categoryId", "confidence", "createdAt", "currency", "deductibilityHint", "description", "direction", "documentNumber", "fieldConfidencePayload", "id", "lineItemsPayload", "paymentMethod", "proposedDate", "reference", "rejectedAt", "reviewStatus", "reviewedAt", "reviewedByUserId", "reviewerNote", "subtotalMinor", "suggestedCategoryName", "taxAmountMinor", "taxRate", "totalAmountMinor", "updatedAt", "uploadId", "vatAmountMinor", "vatTreatment", "vendorId", "vendorName", "whtAmountMinor", "whtTreatment") SELECT "aiPayload", "amountMinor", "approvedAt", "categoryId", "confidence", "createdAt", "currency", "deductibilityHint", "description", "direction", "documentNumber", "fieldConfidencePayload", "id", "lineItemsPayload", "paymentMethod", "proposedDate", "reference", "rejectedAt", "reviewStatus", "reviewedAt", "reviewedByUserId", "reviewerNote", "subtotalMinor", "suggestedCategoryName", "taxAmountMinor", "taxRate", "totalAmountMinor", "updatedAt", "uploadId", "vatAmountMinor", "vatTreatment", "vendorId", "vendorName", "whtAmountMinor", "whtTreatment" FROM "BookkeepingDraft";
DROP TABLE "BookkeepingDraft";
ALTER TABLE "new_BookkeepingDraft" RENAME TO "BookkeepingDraft";
CREATE INDEX "BookkeepingDraft_uploadId_reviewStatus_idx" ON "BookkeepingDraft"("uploadId", "reviewStatus");
CREATE INDEX "BookkeepingDraft_uploadId_documentNumber_idx" ON "BookkeepingDraft"("uploadId", "documentNumber");
CREATE INDEX "BookkeepingDraft_categoryId_idx" ON "BookkeepingDraft"("categoryId");
CREATE INDEX "BookkeepingDraft_vendorId_idx" ON "BookkeepingDraft"("vendorId");
CREATE INDEX "BookkeepingDraft_reviewedByUserId_idx" ON "BookkeepingDraft"("reviewedByUserId");
CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "recurringInvoiceId" INTEGER,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentReference" TEXT,
    "paymentUrl" TEXT,
    "paidAt" DATETIME,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "taxCategory" TEXT,
    "taxEvidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "filingPeriodKey" TEXT,
    "sourceDocumentNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("clientId", "createdAt", "dueDate", "id", "invoiceNumber", "issueDate", "notes", "paidAt", "paymentReference", "paymentUrl", "recurringInvoiceId", "status", "subtotal", "taxAmount", "totalAmount", "updatedAt", "workspaceId") SELECT "clientId", "createdAt", "dueDate", "id", "invoiceNumber", "issueDate", "notes", "paidAt", "paymentReference", "paymentUrl", "recurringInvoiceId", "status", "subtotal", "taxAmount", "totalAmount", "updatedAt", "workspaceId" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_paymentReference_key" ON "Invoice"("paymentReference");
CREATE INDEX "Invoice_workspaceId_createdAt_idx" ON "Invoice"("workspaceId", "createdAt");
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX "Invoice_clientBusinessId_idx" ON "Invoice"("clientBusinessId");
CREATE INDEX "Invoice_recurringInvoiceId_idx" ON "Invoice"("recurringInvoiceId");
CREATE INDEX "Invoice_workspaceId_paymentReference_idx" ON "Invoice"("workspaceId", "paymentReference");
CREATE UNIQUE INDEX "Invoice_workspaceId_invoiceNumber_key" ON "Invoice"("workspaceId", "invoiceNumber");
CREATE TABLE "new_TaxRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER,
    "clientBusinessId" INTEGER,
    "invoiceId" INTEGER,
    "bankTransactionId" INTEGER,
    "categoryId" INTEGER,
    "kind" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "computedTax" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "occurredOn" DATETIME NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "aiMetadata" TEXT,
    "vendorName" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "taxCategory" TEXT,
    "taxEvidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "filingPeriodKey" TEXT,
    "sourceDocumentNumber" TEXT,
    "taxReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaxRecord" ("aiMetadata", "amountKobo", "bankTransactionId", "categoryId", "computedTax", "createdAt", "currency", "description", "id", "invoiceId", "kind", "netAmount", "occurredOn", "recurring", "source", "taxRate", "updatedAt", "userId", "vendorName", "workspaceId") SELECT "aiMetadata", "amountKobo", "bankTransactionId", "categoryId", "computedTax", "createdAt", "currency", "description", "id", "invoiceId", "kind", "netAmount", "occurredOn", "recurring", "source", "taxRate", "updatedAt", "userId", "vendorName", "workspaceId" FROM "TaxRecord";
DROP TABLE "TaxRecord";
ALTER TABLE "new_TaxRecord" RENAME TO "TaxRecord";
CREATE INDEX "TaxRecord_userId_occurredOn_idx" ON "TaxRecord"("userId", "occurredOn");
CREATE INDEX "TaxRecord_workspaceId_occurredOn_idx" ON "TaxRecord"("workspaceId", "occurredOn");
CREATE INDEX "TaxRecord_clientBusinessId_occurredOn_idx" ON "TaxRecord"("clientBusinessId", "occurredOn");
CREATE INDEX "TaxRecord_categoryId_idx" ON "TaxRecord"("categoryId");
CREATE INDEX "TaxRecord_bankTransactionId_idx" ON "TaxRecord"("bankTransactionId");
CREATE INDEX "TaxRecord_reviewedByUserId_idx" ON "TaxRecord"("reviewedByUserId");
CREATE UNIQUE INDEX "TaxRecord_invoiceId_key" ON "TaxRecord"("invoiceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaxPeriod_workspaceId_startDate_endDate_idx" ON "TaxPeriod"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TaxPeriod_clientBusinessId_startDate_endDate_idx" ON "TaxPeriod"("clientBusinessId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TaxPeriod_reviewedByUserId_idx" ON "TaxPeriod"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxPeriod_workspaceId_clientBusinessId_periodKey_key" ON "TaxPeriod"("workspaceId", "clientBusinessId", "periodKey");

-- CreateIndex
CREATE INDEX "TaxComputation_workspaceId_taxType_computedAt_idx" ON "TaxComputation"("workspaceId", "taxType", "computedAt");

-- CreateIndex
CREATE INDEX "TaxComputation_clientBusinessId_taxType_computedAt_idx" ON "TaxComputation"("clientBusinessId", "taxType", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxComputation_taxPeriodId_taxType_key" ON "TaxComputation"("taxPeriodId", "taxType");

-- CreateIndex
CREATE UNIQUE INDEX "VATRecord_engineKey_key" ON "VATRecord"("engineKey");

-- CreateIndex
CREATE INDEX "VATRecord_workspaceId_taxPeriodId_direction_idx" ON "VATRecord"("workspaceId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "VATRecord_clientBusinessId_taxPeriodId_direction_idx" ON "VATRecord"("clientBusinessId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "VATRecord_invoiceId_idx" ON "VATRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "VATRecord_ledgerTransactionId_idx" ON "VATRecord"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "VATRecord_bookkeepingDraftId_idx" ON "VATRecord"("bookkeepingDraftId");

-- CreateIndex
CREATE INDEX "VATRecord_taxRecordId_idx" ON "VATRecord"("taxRecordId");

-- CreateIndex
CREATE INDEX "VATRecord_bankTransactionId_idx" ON "VATRecord"("bankTransactionId");

-- CreateIndex
CREATE INDEX "VATRecord_reviewedByUserId_idx" ON "VATRecord"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WHTRecord_engineKey_key" ON "WHTRecord"("engineKey");

-- CreateIndex
CREATE INDEX "WHTRecord_workspaceId_taxPeriodId_direction_idx" ON "WHTRecord"("workspaceId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "WHTRecord_clientBusinessId_taxPeriodId_direction_idx" ON "WHTRecord"("clientBusinessId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "WHTRecord_invoiceId_idx" ON "WHTRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "WHTRecord_ledgerTransactionId_idx" ON "WHTRecord"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "WHTRecord_bookkeepingDraftId_idx" ON "WHTRecord"("bookkeepingDraftId");

-- CreateIndex
CREATE INDEX "WHTRecord_taxRecordId_idx" ON "WHTRecord"("taxRecordId");

-- CreateIndex
CREATE INDEX "WHTRecord_bankTransactionId_idx" ON "WHTRecord"("bankTransactionId");

-- CreateIndex
CREATE INDEX "WHTRecord_reviewedByUserId_idx" ON "WHTRecord"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "TaxAdjustment_workspaceId_taxType_createdAt_idx" ON "TaxAdjustment"("workspaceId", "taxType", "createdAt");

-- CreateIndex
CREATE INDEX "TaxAdjustment_clientBusinessId_taxType_createdAt_idx" ON "TaxAdjustment"("clientBusinessId", "taxType", "createdAt");

-- CreateIndex
CREATE INDEX "TaxAdjustment_createdByUserId_idx" ON "TaxAdjustment"("createdByUserId");

-- CreateIndex
CREATE INDEX "FilingDraft_workspaceId_taxType_status_idx" ON "FilingDraft"("workspaceId", "taxType", "status");

-- CreateIndex
CREATE INDEX "FilingDraft_clientBusinessId_taxType_status_idx" ON "FilingDraft"("clientBusinessId", "taxType", "status");

-- CreateIndex
CREATE INDEX "FilingDraft_reviewedByUserId_idx" ON "FilingDraft"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FilingDraft_taxPeriodId_taxType_key" ON "FilingDraft"("taxPeriodId", "taxType");

-- CreateIndex
CREATE INDEX "FilingItem_filingDraftId_status_idx" ON "FilingItem"("filingDraftId", "status");

-- CreateIndex
CREATE INDEX "FilingItem_vatRecordId_idx" ON "FilingItem"("vatRecordId");

-- CreateIndex
CREATE INDEX "FilingItem_whtRecordId_idx" ON "FilingItem"("whtRecordId");

-- CreateIndex
CREATE INDEX "FilingItem_taxAdjustmentId_idx" ON "FilingItem"("taxAdjustmentId");

-- CreateIndex
CREATE INDEX "FilingEvidence_workspaceId_createdAt_idx" ON "FilingEvidence"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FilingEvidence_clientBusinessId_createdAt_idx" ON "FilingEvidence"("clientBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "FilingEvidence_filingDraftId_idx" ON "FilingEvidence"("filingDraftId");

-- CreateIndex
CREATE INDEX "FilingEvidence_taxRecordId_idx" ON "FilingEvidence"("taxRecordId");

-- CreateIndex
CREATE INDEX "FilingEvidence_bookkeepingUploadId_idx" ON "FilingEvidence"("bookkeepingUploadId");

-- CreateIndex
CREATE INDEX "FilingEvidence_vatRecordId_idx" ON "FilingEvidence"("vatRecordId");

-- CreateIndex
CREATE INDEX "FilingEvidence_whtRecordId_idx" ON "FilingEvidence"("whtRecordId");

-- CreateIndex
CREATE INDEX "FilingEvidence_uploadedByUserId_idx" ON "FilingEvidence"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "SubmissionLog_workspaceId_createdAt_idx" ON "SubmissionLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionLog_filingDraftId_createdAt_idx" ON "SubmissionLog"("filingDraftId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionLog_actorUserId_idx" ON "SubmissionLog"("actorUserId");

