DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'BankTransactionPostingReadiness'
    ) THEN
        CREATE TYPE "BankTransactionPostingReadiness" AS ENUM (
            'NOT_READY',
            'REVIEW_REQUIRED',
            'READY_TO_POST'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'BankTransactionBookkeepingFeedbackDecision'
    ) THEN
        CREATE TYPE "BankTransactionBookkeepingFeedbackDecision" AS ENUM (
            'APPROVED',
            'REJECTED',
            'MANUAL_OVERRIDE'
        );
    END IF;
END $$;

ALTER TABLE "BankTransaction"
    ADD COLUMN IF NOT EXISTS "possibleDuplicateOfTransactionId" INTEGER,
    ADD COLUMN IF NOT EXISTS "normalizedDescription" TEXT,
    ADD COLUMN IF NOT EXISTS "normalizedMerchantName" TEXT,
    ADD COLUMN IF NOT EXISTS "autoBookkeepingConfidence" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "autoBookkeepingReason" TEXT,
    ADD COLUMN IF NOT EXISTS "autoBookkeepingProvider" TEXT,
    ADD COLUMN IF NOT EXISTS "autoBookkeepingProcessedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "postingReadiness" "BankTransactionPostingReadiness" NOT NULL DEFAULT 'NOT_READY',
    ADD COLUMN IF NOT EXISTS "duplicateConfidence" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "duplicateReason" TEXT,
    ADD COLUMN IF NOT EXISTS "suspiciousPatternScore" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "suspiciousPatternReason" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransaction_possibleDuplicateOfTransactionId_fkey'
    ) THEN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT "BankTransaction_possibleDuplicateOfTransactionId_fkey"
            FOREIGN KEY ("possibleDuplicateOfTransactionId") REFERENCES "BankTransaction"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BankTransactionBookkeepingFeedback" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "suggestedCategoryId" INTEGER,
    "selectedCategoryId" INTEGER,
    "suggestedVatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "selectedVatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "suggestedWhtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "selectedWhtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "suggestedConfidence" DOUBLE PRECISION,
    "duplicateConfidence" DOUBLE PRECISION,
    "suspiciousPatternScore" DOUBLE PRECISION,
    "postingReadiness" "BankTransactionPostingReadiness" NOT NULL DEFAULT 'NOT_READY',
    "decision" "BankTransactionBookkeepingFeedbackDecision" NOT NULL,
    "provider" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransactionBookkeepingFeedback_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransactionBookkeepingFeedback_workspaceId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionBookkeepingFeedback"
            ADD CONSTRAINT "BankTransactionBookkeepingFeedback_workspaceId_fkey"
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
        WHERE conname = 'BankTransactionBookkeepingFeedback_transactionId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionBookkeepingFeedback"
            ADD CONSTRAINT "BankTransactionBookkeepingFeedback_transactionId_fkey"
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
        WHERE conname = 'BankTransactionBookkeepingFeedback_actorUserId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionBookkeepingFeedback"
            ADD CONSTRAINT "BankTransactionBookkeepingFeedback_actorUserId_fkey"
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
        WHERE conname = 'BankTransactionBookkeepingFeedback_suggestedCategoryId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionBookkeepingFeedback"
            ADD CONSTRAINT "BankTransactionBookkeepingFeedback_suggestedCategoryId_fkey"
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
        WHERE conname = 'BankTransactionBookkeepingFeedback_selectedCategoryId_fkey'
    ) THEN
        ALTER TABLE "BankTransactionBookkeepingFeedback"
            ADD CONSTRAINT "BankTransactionBookkeepingFeedback_selectedCategoryId_fkey"
            FOREIGN KEY ("selectedCategoryId") REFERENCES "TransactionCategory"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_postingReadiness_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "postingReadiness", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_autoBookkeepingConfidence_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "autoBookkeepingConfidence", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_normalizedMerchantName_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "normalizedMerchantName", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_possibleDuplicateOfTransactionId_idx"
    ON "BankTransaction"("possibleDuplicateOfTransactionId");

CREATE INDEX IF NOT EXISTS "BankTransactionBookkeepingFeedback_workspaceId_createdAt_idx"
    ON "BankTransactionBookkeepingFeedback"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "BankTransactionBookkeepingFeedback_transactionId_createdAt_idx"
    ON "BankTransactionBookkeepingFeedback"("transactionId", "createdAt");

CREATE INDEX IF NOT EXISTS "BankTransactionBookkeepingFeedback_actorUserId_createdAt_idx"
    ON "BankTransactionBookkeepingFeedback"("actorUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "BankTransactionBookkeepingFeedback_suggestedCategoryId_idx"
    ON "BankTransactionBookkeepingFeedback"("suggestedCategoryId");

CREATE INDEX IF NOT EXISTS "BankTransactionBookkeepingFeedback_selectedCategoryId_idx"
    ON "BankTransactionBookkeepingFeedback"("selectedCategoryId");
