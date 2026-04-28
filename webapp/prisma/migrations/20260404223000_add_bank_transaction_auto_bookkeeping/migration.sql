ALTER TABLE "BankTransaction"
    ADD COLUMN "possibleDuplicateOfTransactionId" INTEGER
        REFERENCES "BankTransaction" ("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD COLUMN "normalizedDescription" TEXT;

ALTER TABLE "BankTransaction"
    ADD COLUMN "normalizedMerchantName" TEXT;

ALTER TABLE "BankTransaction"
    ADD COLUMN "autoBookkeepingConfidence" REAL;

ALTER TABLE "BankTransaction"
    ADD COLUMN "autoBookkeepingReason" TEXT;

ALTER TABLE "BankTransaction"
    ADD COLUMN "autoBookkeepingProvider" TEXT;

ALTER TABLE "BankTransaction"
    ADD COLUMN "autoBookkeepingProcessedAt" DATETIME;

ALTER TABLE "BankTransaction"
    ADD COLUMN "postingReadiness" TEXT NOT NULL DEFAULT 'NOT_READY';

ALTER TABLE "BankTransaction"
    ADD COLUMN "duplicateConfidence" REAL;

ALTER TABLE "BankTransaction"
    ADD COLUMN "duplicateReason" TEXT;

ALTER TABLE "BankTransaction"
    ADD COLUMN "suspiciousPatternScore" REAL;

ALTER TABLE "BankTransaction"
    ADD COLUMN "suspiciousPatternReason" TEXT;

CREATE TABLE "BankTransactionBookkeepingFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "suggestedCategoryId" INTEGER,
    "selectedCategoryId" INTEGER,
    "suggestedVatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "selectedVatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "suggestedWhtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "selectedWhtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "suggestedConfidence" REAL,
    "duplicateConfidence" REAL,
    "suspiciousPatternScore" REAL,
    "postingReadiness" TEXT NOT NULL DEFAULT 'NOT_READY',
    "decision" TEXT NOT NULL,
    "provider" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransactionBookkeepingFeedback_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionBookkeepingFeedback_transactionId_fkey"
        FOREIGN KEY ("transactionId") REFERENCES "BankTransaction" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionBookkeepingFeedback_actorUserId_fkey"
        FOREIGN KEY ("actorUserId") REFERENCES "User" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionBookkeepingFeedback_suggestedCategoryId_fkey"
        FOREIGN KEY ("suggestedCategoryId") REFERENCES "TransactionCategory" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionBookkeepingFeedback_selectedCategoryId_fkey"
        FOREIGN KEY ("selectedCategoryId") REFERENCES "TransactionCategory" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BankTransaction_workspaceId_postingReadiness_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "postingReadiness", "transactionDate");

CREATE INDEX "BankTransaction_workspaceId_autoBookkeepingConfidence_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "autoBookkeepingConfidence", "transactionDate");

CREATE INDEX "BankTransaction_workspaceId_normalizedMerchantName_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "normalizedMerchantName", "transactionDate");

CREATE INDEX "BankTransaction_possibleDuplicateOfTransactionId_idx"
    ON "BankTransaction"("possibleDuplicateOfTransactionId");

CREATE INDEX "BankTransactionBookkeepingFeedback_workspaceId_createdAt_idx"
    ON "BankTransactionBookkeepingFeedback"("workspaceId", "createdAt");

CREATE INDEX "BankTransactionBookkeepingFeedback_transactionId_createdAt_idx"
    ON "BankTransactionBookkeepingFeedback"("transactionId", "createdAt");

CREATE INDEX "BankTransactionBookkeepingFeedback_actorUserId_createdAt_idx"
    ON "BankTransactionBookkeepingFeedback"("actorUserId", "createdAt");

CREATE INDEX "BankTransactionBookkeepingFeedback_suggestedCategoryId_idx"
    ON "BankTransactionBookkeepingFeedback"("suggestedCategoryId");

CREATE INDEX "BankTransactionBookkeepingFeedback_selectedCategoryId_idx"
    ON "BankTransactionBookkeepingFeedback"("selectedCategoryId");
