PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "bankAccountId" INTEGER NOT NULL,
    "statementImportId" INTEGER,
    "uploadedByUserId" INTEGER,
    "categoryId" INTEGER,
    "matchedLedgerTransactionId" INTEGER,
    "matchedInvoiceId" INTEGER,
    "transactionDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "debitAmountMinor" INTEGER,
    "creditAmountMinor" INTEGER,
    "balanceAmountMinor" INTEGER,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CSV_IMPORT',
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "reviewStatus" TEXT NOT NULL DEFAULT 'IMPORTED',
    "fingerprintHash" TEXT,
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
    "reviewedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "matchedAt" DATETIME,
    "ignoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "BankStatementImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_matchedLedgerTransactionId_fkey" FOREIGN KEY ("matchedLedgerTransactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_matchedInvoiceId_fkey" FOREIGN KEY ("matchedInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_BankTransaction" (
    "id",
    "workspaceId",
    "clientBusinessId",
    "bankAccountId",
    "statementImportId",
    "uploadedByUserId",
    "categoryId",
    "matchedLedgerTransactionId",
    "matchedInvoiceId",
    "transactionDate",
    "description",
    "reference",
    "amount",
    "debitAmountMinor",
    "creditAmountMinor",
    "balanceAmountMinor",
    "type",
    "source",
    "status",
    "reviewStatus",
    "fingerprintHash",
    "sourceRowNumber",
    "rawRowPayload",
    "currency",
    "suggestedType",
    "suggestedCounterparty",
    "suggestedCategoryName",
    "suggestedVatTreatment",
    "suggestedWhtTreatment",
    "suggestedNarrationMeaning",
    "confidenceScore",
    "categorizationProvider",
    "reviewNotes",
    "reviewedAt",
    "reviewedByUserId",
    "matchedAt",
    "ignoredAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "clientBusinessId",
    "bankAccountId",
    "statementImportId",
    "uploadedByUserId",
    NULL,
    "matchedLedgerTransactionId",
    "matchedInvoiceId",
    "transactionDate",
    "description",
    "reference",
    "amount",
    "debitAmountMinor",
    "creditAmountMinor",
    "balanceAmountMinor",
    "type",
    CASE
        WHEN COALESCE("rawRowPayload", '') LIKE '%manual-entry%' THEN 'MANUAL'
        ELSE 'CSV_IMPORT'
    END,
    "status",
    CASE
        WHEN "status" IN ('MATCHED', 'SPLIT') THEN 'POSTED'
        WHEN "status" = 'IGNORED' THEN 'REVIEWED'
        WHEN "status" = 'REVIEW_REQUIRED' THEN 'PENDING_REVIEW'
        WHEN COALESCE("rawRowPayload", '') LIKE '%manual-entry%' THEN 'PENDING_REVIEW'
        ELSE 'IMPORTED'
    END,
    NULL,
    "sourceRowNumber",
    "rawRowPayload",
    "currency",
    "suggestedType",
    "suggestedCounterparty",
    "suggestedCategoryName",
    "suggestedVatTreatment",
    "suggestedWhtTreatment",
    "suggestedNarrationMeaning",
    "confidenceScore",
    "categorizationProvider",
    "reviewNotes",
    CASE
        WHEN "status" IN ('MATCHED', 'SPLIT') THEN COALESCE("matchedAt", "updatedAt", "createdAt")
        WHEN "status" = 'IGNORED' THEN COALESCE("ignoredAt", "updatedAt", "createdAt")
        ELSE NULL
    END,
    CASE
        WHEN "status" IN ('MATCHED', 'SPLIT', 'IGNORED') THEN "uploadedByUserId"
        ELSE NULL
    END,
    "matchedAt",
    "ignoredAt",
    "createdAt",
    "updatedAt"
FROM "BankTransaction";

DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";

CREATE INDEX "BankTransaction_workspaceId_transactionDate_idx" ON "BankTransaction"("workspaceId", "transactionDate");
CREATE INDEX "BankTransaction_workspaceId_status_transactionDate_idx" ON "BankTransaction"("workspaceId", "status", "transactionDate");
CREATE INDEX "BankTransaction_workspaceId_reviewStatus_transactionDate_idx" ON "BankTransaction"("workspaceId", "reviewStatus", "transactionDate");
CREATE INDEX "BankTransaction_workspaceId_source_transactionDate_idx" ON "BankTransaction"("workspaceId", "source", "transactionDate");
CREATE INDEX "BankTransaction_workspaceId_categoryId_transactionDate_idx" ON "BankTransaction"("workspaceId", "categoryId", "transactionDate");
CREATE INDEX "BankTransaction_bankAccountId_transactionDate_idx" ON "BankTransaction"("bankAccountId", "transactionDate");
CREATE INDEX "BankTransaction_clientBusinessId_transactionDate_idx" ON "BankTransaction"("clientBusinessId", "transactionDate");
CREATE INDEX "BankTransaction_categoryId_idx" ON "BankTransaction"("categoryId");
CREATE INDEX "BankTransaction_reviewedByUserId_transactionDate_idx" ON "BankTransaction"("reviewedByUserId", "transactionDate");
CREATE INDEX "BankTransaction_statementImportId_sourceRowNumber_idx" ON "BankTransaction"("statementImportId", "sourceRowNumber");
CREATE INDEX "BankTransaction_matchedLedgerTransactionId_idx" ON "BankTransaction"("matchedLedgerTransactionId");
CREATE INDEX "BankTransaction_matchedInvoiceId_idx" ON "BankTransaction"("matchedInvoiceId");
CREATE UNIQUE INDEX "BankTransaction_workspaceId_bankAccountId_fingerprintHash_key" ON "BankTransaction"("workspaceId", "bankAccountId", "fingerprintHash");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
