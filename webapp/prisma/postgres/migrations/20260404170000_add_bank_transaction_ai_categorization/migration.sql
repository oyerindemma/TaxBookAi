DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'BankTransactionCategorizationFeedbackDecision'
    ) THEN
        CREATE TYPE "BankTransactionCategorizationFeedbackDecision" AS ENUM (
            'APPROVED',
            'REJECTED',
            'MANUAL_OVERRIDE'
        );
    END IF;
END $$;

ALTER TABLE "BankTransaction"
    ADD COLUMN IF NOT EXISTS "suggestedCategoryId" INTEGER,
    ADD COLUMN IF NOT EXISTS "suggestionConfidence" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "suggestionReason" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransaction_suggestedCategoryId_fkey'
    ) THEN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT "BankTransaction_suggestedCategoryId_fkey"
            FOREIGN KEY ("suggestedCategoryId") REFERENCES "TransactionCategory"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BankTransactionCategorizationFeedback" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "suggestedCategoryId" INTEGER,
    "selectedCategoryId" INTEGER,
    "decision" "BankTransactionCategorizationFeedbackDecision" NOT NULL,
    "suggestionConfidence" DOUBLE PRECISION,
    "suggestionReason" TEXT,
    "provider" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransactionCategorizationFeedback_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransactionCategorizationFeedback_workspaceId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionCategorizationFeedback"
            ADD CONSTRAINT "BankTransactionCategorizationFeedback_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransactionCategorizationFeedback_transactionId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionCategorizationFeedback"
            ADD CONSTRAINT "BankTransactionCategorizationFeedback_transactionId_fkey"
            FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransactionCategorizationFeedback_actorUserId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionCategorizationFeedback"
            ADD CONSTRAINT "BankTransactionCategorizationFeedback_actorUserId_fkey"
            FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransactionCategorizationFeedback_suggestedCategoryId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionCategorizationFeedback"
            ADD CONSTRAINT "BankTransactionCategorizationFeedback_suggestedCategoryId_fkey"
            FOREIGN KEY ("suggestedCategoryId") REFERENCES "TransactionCategory"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransactionCategorizationFeedback_selectedCategoryId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionCategorizationFeedback"
            ADD CONSTRAINT "BankTransactionCategorizationFeedback_selectedCategoryId_fkey"
            FOREIGN KEY ("selectedCategoryId") REFERENCES "TransactionCategory"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_suggestedCategoryId_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "suggestedCategoryId", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_suggestedCategoryId_idx"
    ON "BankTransaction"("suggestedCategoryId");

CREATE INDEX IF NOT EXISTS "BankTransactionCategorizationFeedback_workspaceId_createdAt_idx"
    ON "BankTransactionCategorizationFeedback"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "BankTransactionCategorizationFeedback_transactionId_createdAt_idx"
    ON "BankTransactionCategorizationFeedback"("transactionId", "createdAt");

CREATE INDEX IF NOT EXISTS "BankTransactionCategorizationFeedback_actorUserId_createdAt_idx"
    ON "BankTransactionCategorizationFeedback"("actorUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "BankTransactionCategorizationFeedback_suggestedCategoryId_idx"
    ON "BankTransactionCategorizationFeedback"("suggestedCategoryId");

CREATE INDEX IF NOT EXISTS "BankTransactionCategorizationFeedback_selectedCategoryId_idx"
    ON "BankTransactionCategorizationFeedback"("selectedCategoryId");
