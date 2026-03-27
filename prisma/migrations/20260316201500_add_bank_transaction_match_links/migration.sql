PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "bankAccountId" INTEGER NOT NULL,
    "statementImportId" INTEGER,
    "uploadedByUserId" INTEGER,
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
    CONSTRAINT "BankTransaction_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_matchedLedgerTransactionId_fkey" FOREIGN KEY ("matchedLedgerTransactionId") REFERENCES "LedgerTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_matchedInvoiceId_fkey" FOREIGN KEY ("matchedInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_BankTransaction" (
    "id",
    "workspaceId",
    "clientBusinessId",
    "bankAccountId",
    "statementImportId",
    "uploadedByUserId",
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
    "status",
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
    NULL,
    "transactionDate",
    "description",
    "reference",
    "amount",
    "debitAmountMinor",
    "creditAmountMinor",
    "balanceAmountMinor",
    "type",
    "status",
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
    "matchedAt",
    "ignoredAt",
    "createdAt",
    "updatedAt"
FROM "BankTransaction";

DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";

CREATE INDEX "BankTransaction_workspaceId_transactionDate_idx" ON "BankTransaction"("workspaceId", "transactionDate");
CREATE INDEX "BankTransaction_workspaceId_status_transactionDate_idx" ON "BankTransaction"("workspaceId", "status", "transactionDate");
CREATE INDEX "BankTransaction_bankAccountId_transactionDate_idx" ON "BankTransaction"("bankAccountId", "transactionDate");
CREATE INDEX "BankTransaction_clientBusinessId_transactionDate_idx" ON "BankTransaction"("clientBusinessId", "transactionDate");
CREATE INDEX "BankTransaction_statementImportId_sourceRowNumber_idx" ON "BankTransaction"("statementImportId", "sourceRowNumber");
CREATE INDEX "BankTransaction_matchedLedgerTransactionId_idx" ON "BankTransaction"("matchedLedgerTransactionId");
CREATE INDEX "BankTransaction_matchedInvoiceId_idx" ON "BankTransaction"("matchedInvoiceId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
