DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankTransactionSource') THEN
        CREATE TYPE "BankTransactionSource" AS ENUM ('CSV_IMPORT', 'MANUAL');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankTransactionReviewStatus') THEN
        CREATE TYPE "BankTransactionReviewStatus" AS ENUM (
            'IMPORTED',
            'PENDING_REVIEW',
            'REVIEWED',
            'POSTED',
            'FLAGGED'
        );
    END IF;
END $$;

ALTER TABLE "BankTransaction"
    ADD COLUMN IF NOT EXISTS "categoryId" INTEGER,
    ADD COLUMN IF NOT EXISTS "source" "BankTransactionSource" NOT NULL DEFAULT 'CSV_IMPORT',
    ADD COLUMN IF NOT EXISTS "fingerprintHash" TEXT,
    ADD COLUMN IF NOT EXISTS "reviewStatus" "BankTransactionReviewStatus" NOT NULL DEFAULT 'IMPORTED',
    ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reviewedByUserId" INTEGER;

UPDATE "BankTransaction"
SET "source" = CASE
    WHEN COALESCE("rawRowPayload", '') ILIKE '%manual-entry%' THEN 'MANUAL'::"BankTransactionSource"
    ELSE 'CSV_IMPORT'::"BankTransactionSource"
END
WHERE "source" = 'CSV_IMPORT';

UPDATE "BankTransaction"
SET
    "reviewStatus" = CASE
        WHEN "status" IN ('MATCHED', 'SPLIT') THEN 'POSTED'::"BankTransactionReviewStatus"
        WHEN "status" = 'IGNORED' THEN 'REVIEWED'::"BankTransactionReviewStatus"
        WHEN "status" = 'REVIEW_REQUIRED' THEN 'PENDING_REVIEW'::"BankTransactionReviewStatus"
        WHEN "source" = 'MANUAL' THEN 'PENDING_REVIEW'::"BankTransactionReviewStatus"
        ELSE 'IMPORTED'::"BankTransactionReviewStatus"
    END,
    "reviewedAt" = CASE
        WHEN "status" IN ('MATCHED', 'SPLIT') THEN COALESCE("matchedAt", "updatedAt", "createdAt")
        WHEN "status" = 'IGNORED' THEN COALESCE("ignoredAt", "updatedAt", "createdAt")
        ELSE "reviewedAt"
    END,
    "reviewedByUserId" = CASE
        WHEN "status" IN ('MATCHED', 'SPLIT', 'IGNORED') THEN COALESCE("reviewedByUserId", "uploadedByUserId")
        ELSE "reviewedByUserId"
    END;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransaction_categoryId_fkey'
    ) THEN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT "BankTransaction_categoryId_fkey"
            FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BankTransaction_reviewedByUserId_fkey'
    ) THEN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT "BankTransaction_reviewedByUserId_fkey"
            FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_reviewStatus_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "reviewStatus", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_source_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "source", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_categoryId_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "categoryId", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_categoryId_idx"
    ON "BankTransaction"("categoryId");

CREATE INDEX IF NOT EXISTS "BankTransaction_reviewedByUserId_transactionDate_idx"
    ON "BankTransaction"("reviewedByUserId", "transactionDate");

CREATE UNIQUE INDEX IF NOT EXISTS "BankTransaction_workspaceId_bankAccountId_fingerprintHash_key"
    ON "BankTransaction"("workspaceId", "bankAccountId", "fingerprintHash");
