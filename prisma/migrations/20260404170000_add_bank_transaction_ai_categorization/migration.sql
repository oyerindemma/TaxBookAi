ALTER TABLE "BankTransaction"
    ADD COLUMN "suggestedCategoryId" INTEGER
        REFERENCES "TransactionCategory" ("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
    ADD COLUMN "suggestionConfidence" REAL;

ALTER TABLE "BankTransaction"
    ADD COLUMN "suggestionReason" TEXT;

CREATE TABLE "BankTransactionCategorizationFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "suggestedCategoryId" INTEGER,
    "selectedCategoryId" INTEGER,
    "decision" TEXT NOT NULL,
    "suggestionConfidence" REAL,
    "suggestionReason" TEXT,
    "provider" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransactionCategorizationFeedback_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionCategorizationFeedback_transactionId_fkey"
        FOREIGN KEY ("transactionId") REFERENCES "BankTransaction" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionCategorizationFeedback_actorUserId_fkey"
        FOREIGN KEY ("actorUserId") REFERENCES "User" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionCategorizationFeedback_suggestedCategoryId_fkey"
        FOREIGN KEY ("suggestedCategoryId") REFERENCES "TransactionCategory" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransactionCategorizationFeedback_selectedCategoryId_fkey"
        FOREIGN KEY ("selectedCategoryId") REFERENCES "TransactionCategory" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BankTransaction_workspaceId_suggestedCategoryId_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "suggestedCategoryId", "transactionDate");

CREATE INDEX "BankTransaction_suggestedCategoryId_idx"
    ON "BankTransaction"("suggestedCategoryId");

CREATE INDEX "BankTransactionCategorizationFeedback_workspaceId_createdAt_idx"
    ON "BankTransactionCategorizationFeedback"("workspaceId", "createdAt");

CREATE INDEX "BankTransactionCategorizationFeedback_transactionId_createdAt_idx"
    ON "BankTransactionCategorizationFeedback"("transactionId", "createdAt");

CREATE INDEX "BankTransactionCategorizationFeedback_actorUserId_createdAt_idx"
    ON "BankTransactionCategorizationFeedback"("actorUserId", "createdAt");

CREATE INDEX "BankTransactionCategorizationFeedback_suggestedCategoryId_idx"
    ON "BankTransactionCategorizationFeedback"("suggestedCategoryId");

CREATE INDEX "BankTransactionCategorizationFeedback_selectedCategoryId_idx"
    ON "BankTransactionCategorizationFeedback"("selectedCategoryId");
