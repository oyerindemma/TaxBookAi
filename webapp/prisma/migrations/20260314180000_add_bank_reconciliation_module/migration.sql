-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "bankAccountId" INTEGER NOT NULL,
    "uploadedByUserId" INTEGER,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadSizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mappingJson" TEXT,
    "rawHeaders" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankStatementImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankStatementImport_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankStatementImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankStatementImport_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransactionSplitLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bankTransactionId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "ledgerTransactionId" INTEGER,
    "createdByUserId" INTEGER,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransactionSplitLine_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionSplitLine_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionSplitLine_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionSplitLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionSplitLine_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionSplitLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankAccount_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BankAccount" ("accountNumber", "bankName", "createdAt", "currency", "id", "name", "updatedAt", "workspaceId") SELECT "accountNumber", "bankName", "createdAt", "currency", "id", "name", "createdAt", "workspaceId" FROM "BankAccount";
DROP TABLE "BankAccount";
ALTER TABLE "new_BankAccount" RENAME TO "BankAccount";
CREATE INDEX "BankAccount_workspaceId_name_idx" ON "BankAccount"("workspaceId", "name");
CREATE INDEX "BankAccount_clientBusinessId_name_idx" ON "BankAccount"("clientBusinessId", "name");
CREATE TABLE "new_BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "bankAccountId" INTEGER NOT NULL,
    "statementImportId" INTEGER,
    "uploadedByUserId" INTEGER,
    "transactionDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "debitAmountMinor" INTEGER,
    "creditAmountMinor" INTEGER,
    "balanceAmountMinor" INTEGER,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "sourceRowNumber" INTEGER,
    "rawRowPayload" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "suggestedType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "suggestedCounterparty" TEXT,
    "suggestedCategoryName" TEXT,
    "suggestedVatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "suggestedWhtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "suggestedNarrationMeaning" TEXT,
    "confidenceScore" REAL,
    "categorizationProvider" TEXT,
    "reviewNotes" TEXT,
    "matchedAt" DATETIME,
    "ignoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "BankStatementImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("amount", "bankAccountId", "createdAt", "description", "id", "reference", "status", "transactionDate", "type", "updatedAt", "workspaceId") SELECT "amount", "bankAccountId", "createdAt", "description", "id", "reference", "status", "transactionDate", "type", "createdAt", "workspaceId" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE INDEX "BankTransaction_workspaceId_transactionDate_idx" ON "BankTransaction"("workspaceId", "transactionDate");
CREATE INDEX "BankTransaction_workspaceId_status_transactionDate_idx" ON "BankTransaction"("workspaceId", "status", "transactionDate");
CREATE INDEX "BankTransaction_bankAccountId_transactionDate_idx" ON "BankTransaction"("bankAccountId", "transactionDate");
CREATE INDEX "BankTransaction_clientBusinessId_transactionDate_idx" ON "BankTransaction"("clientBusinessId", "transactionDate");
CREATE INDEX "BankTransaction_statementImportId_sourceRowNumber_idx" ON "BankTransaction"("statementImportId", "sourceRowNumber");
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
INSERT INTO "new_LedgerTransaction" ("amountMinor", "categoryId", "clientBusinessId", "createdAt", "createdByUserId", "currency", "description", "direction", "id", "notes", "origin", "reference", "reviewStatus", "sourceDraftId", "transactionDate", "updatedAt", "vatAmountMinor", "vatTreatment", "vendorId", "whtAmountMinor", "whtTreatment") SELECT "amountMinor", "categoryId", "clientBusinessId", "createdAt", "createdByUserId", "currency", "description", "direction", "id", "notes", "origin", "reference", "reviewStatus", "sourceDraftId", "transactionDate", "updatedAt", "vatAmountMinor", "vatTreatment", "vendorId", "whtAmountMinor", "whtTreatment" FROM "LedgerTransaction";
DROP TABLE "LedgerTransaction";
ALTER TABLE "new_LedgerTransaction" RENAME TO "LedgerTransaction";
CREATE UNIQUE INDEX "LedgerTransaction_sourceDraftId_key" ON "LedgerTransaction"("sourceDraftId");
CREATE INDEX "LedgerTransaction_clientBusinessId_transactionDate_idx" ON "LedgerTransaction"("clientBusinessId", "transactionDate");
CREATE INDEX "LedgerTransaction_clientBusinessId_reviewStatus_idx" ON "LedgerTransaction"("clientBusinessId", "reviewStatus");
CREATE INDEX "LedgerTransaction_vendorId_transactionDate_idx" ON "LedgerTransaction"("vendorId", "transactionDate");
CREATE INDEX "LedgerTransaction_categoryId_transactionDate_idx" ON "LedgerTransaction"("categoryId", "transactionDate");
CREATE INDEX "LedgerTransaction_bankTransactionId_idx" ON "LedgerTransaction"("bankTransactionId");
CREATE TABLE "new_ReconciliationMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "bankTransactionId" INTEGER NOT NULL,
    "ledgerTransactionId" INTEGER,
    "bookkeepingDraftId" INTEGER,
    "invoiceId" INTEGER,
    "taxRecordId" INTEGER,
    "matchType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "score" REAL NOT NULL DEFAULT 0,
    "matchedAmountMinor" INTEGER,
    "rationale" TEXT,
    "approvedByUserId" INTEGER,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReconciliationMatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationMatch_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationMatch_bookkeepingDraftId_fkey" FOREIGN KEY ("bookkeepingDraftId") REFERENCES "BookkeepingDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationMatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationMatch_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationMatch_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReconciliationMatch" ("bankTransactionId", "createdAt", "id", "invoiceId", "matchType", "taxRecordId", "updatedAt", "workspaceId") SELECT "bankTransactionId", "createdAt", "id", "invoiceId", "matchType", "taxRecordId", "createdAt", "workspaceId" FROM "ReconciliationMatch";
DROP TABLE "ReconciliationMatch";
ALTER TABLE "new_ReconciliationMatch" RENAME TO "ReconciliationMatch";
CREATE INDEX "ReconciliationMatch_bankTransactionId_status_idx" ON "ReconciliationMatch"("bankTransactionId", "status");
CREATE INDEX "ReconciliationMatch_workspaceId_createdAt_idx" ON "ReconciliationMatch"("workspaceId", "createdAt");
CREATE INDEX "ReconciliationMatch_ledgerTransactionId_idx" ON "ReconciliationMatch"("ledgerTransactionId");
CREATE INDEX "ReconciliationMatch_bookkeepingDraftId_idx" ON "ReconciliationMatch"("bookkeepingDraftId");
CREATE INDEX "ReconciliationMatch_invoiceId_idx" ON "ReconciliationMatch"("invoiceId");
CREATE INDEX "ReconciliationMatch_taxRecordId_idx" ON "ReconciliationMatch"("taxRecordId");
CREATE TABLE "new_TaxRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaxRecord" ("aiMetadata", "amountKobo", "categoryId", "computedTax", "createdAt", "currency", "description", "id", "invoiceId", "kind", "netAmount", "occurredOn", "recurring", "source", "taxRate", "updatedAt", "userId", "vendorName", "workspaceId") SELECT "aiMetadata", "amountKobo", "categoryId", "computedTax", "createdAt", "currency", "description", "id", "invoiceId", "kind", "netAmount", "occurredOn", "recurring", "source", "taxRate", "updatedAt", "userId", "vendorName", "workspaceId" FROM "TaxRecord";
DROP TABLE "TaxRecord";
ALTER TABLE "new_TaxRecord" RENAME TO "TaxRecord";
CREATE INDEX "TaxRecord_userId_occurredOn_idx" ON "TaxRecord"("userId", "occurredOn");
CREATE INDEX "TaxRecord_workspaceId_occurredOn_idx" ON "TaxRecord"("workspaceId", "occurredOn");
CREATE INDEX "TaxRecord_categoryId_idx" ON "TaxRecord"("categoryId");
CREATE INDEX "TaxRecord_bankTransactionId_idx" ON "TaxRecord"("bankTransactionId");
CREATE UNIQUE INDEX "TaxRecord_invoiceId_key" ON "TaxRecord"("invoiceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BankStatementImport_workspaceId_createdAt_idx" ON "BankStatementImport"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "BankStatementImport_clientBusinessId_createdAt_idx" ON "BankStatementImport"("clientBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "BankStatementImport_bankAccountId_createdAt_idx" ON "BankStatementImport"("bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "BankTransactionSplitLine_bankTransactionId_createdAt_idx" ON "BankTransactionSplitLine"("bankTransactionId", "createdAt");

-- CreateIndex
CREATE INDEX "BankTransactionSplitLine_clientBusinessId_createdAt_idx" ON "BankTransactionSplitLine"("clientBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "BankTransactionSplitLine_ledgerTransactionId_idx" ON "BankTransactionSplitLine"("ledgerTransactionId");
