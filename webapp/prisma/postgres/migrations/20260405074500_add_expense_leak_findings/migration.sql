DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'ExpenseLeakFindingType'
    ) THEN
        CREATE TYPE "ExpenseLeakFindingType" AS ENUM (
            'RECURRING_SPEND',
            'DUPLICATE_VENDOR_CHARGE',
            'MONTH_OVER_MONTH_SPIKE'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'ExpenseLeakFindingSeverity'
    ) THEN
        CREATE TYPE "ExpenseLeakFindingSeverity" AS ENUM (
            'INFO',
            'WARNING',
            'CRITICAL'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'ExpenseLeakFindingStatus'
    ) THEN
        CREATE TYPE "ExpenseLeakFindingStatus" AS ENUM (
            'OPEN',
            'DISMISSED',
            'RESOLVED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ExpenseLeakFinding" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "statusChangedByUserId" INTEGER,
    "type" "ExpenseLeakFindingType" NOT NULL,
    "severity" "ExpenseLeakFindingSeverity" NOT NULL DEFAULT 'INFO',
    "status" "ExpenseLeakFindingStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT,
    "estimatedSavingsMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "recommendedActionLabel" TEXT,
    "recommendedActionHref" TEXT,
    "primaryRecordType" TEXT,
    "primaryRecordId" INTEGER,
    "primaryRecordHref" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "evidencePayload" TEXT,
    "metadataPayload" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastStatusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseLeakFinding_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ExpenseLeakFinding_workspaceId_fkey'
    ) THEN
        ALTER TABLE "ExpenseLeakFinding"
            ADD CONSTRAINT "ExpenseLeakFinding_workspaceId_fkey"
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
        WHERE conname = 'ExpenseLeakFinding_clientBusinessId_fkey'
    ) THEN
        ALTER TABLE "ExpenseLeakFinding"
            ADD CONSTRAINT "ExpenseLeakFinding_clientBusinessId_fkey"
            FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ExpenseLeakFinding_statusChangedByUserId_fkey'
    ) THEN
        ALTER TABLE "ExpenseLeakFinding"
            ADD CONSTRAINT "ExpenseLeakFinding_statusChangedByUserId_fkey"
            FOREIGN KEY ("statusChangedByUserId") REFERENCES "User"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseLeakFinding_workspaceId_dedupeKey_key"
    ON "ExpenseLeakFinding"("workspaceId", "dedupeKey");

CREATE INDEX IF NOT EXISTS "ExpenseLeakFinding_workspaceId_status_severity_lastDetectedAt_idx"
    ON "ExpenseLeakFinding"("workspaceId", "status", "severity", "lastDetectedAt");

CREATE INDEX IF NOT EXISTS "ExpenseLeakFinding_workspaceId_type_status_idx"
    ON "ExpenseLeakFinding"("workspaceId", "type", "status");

CREATE INDEX IF NOT EXISTS "ExpenseLeakFinding_workspaceId_status_estimatedSavingsMinor_idx"
    ON "ExpenseLeakFinding"("workspaceId", "status", "estimatedSavingsMinor");

CREATE INDEX IF NOT EXISTS "ExpenseLeakFinding_clientBusinessId_status_severity_idx"
    ON "ExpenseLeakFinding"("clientBusinessId", "status", "severity");

CREATE INDEX IF NOT EXISTS "ExpenseLeakFinding_statusChangedByUserId_idx"
    ON "ExpenseLeakFinding"("statusChangedByUserId");
