DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'WorkspaceAlertType'
    ) THEN
        CREATE TYPE "WorkspaceAlertType" AS ENUM (
            'DUPLICATE_TRANSACTION',
            'UNUSUAL_SPIKE',
            'MISSING_EVIDENCE',
            'TAX_DUE_SOON',
            'UNRESOLVED_REVIEW_ITEMS',
            'FILING_BLOCKER'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'WorkspaceAlertSeverity'
    ) THEN
        CREATE TYPE "WorkspaceAlertSeverity" AS ENUM (
            'INFO',
            'WARNING',
            'CRITICAL'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'WorkspaceAlertStatus'
    ) THEN
        CREATE TYPE "WorkspaceAlertStatus" AS ENUM (
            'OPEN',
            'SNOOZED',
            'RESOLVED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WorkspaceAlert" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "statusChangedByUserId" INTEGER,
    "type" "WorkspaceAlertType" NOT NULL,
    "severity" "WorkspaceAlertSeverity" NOT NULL DEFAULT 'INFO',
    "status" "WorkspaceAlertStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "explanation" TEXT,
    "recommendedActionLabel" TEXT,
    "recommendedActionHref" TEXT,
    "primaryRecordType" TEXT,
    "primaryRecordId" INTEGER,
    "primaryRecordHref" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "sourceRecordsPayload" TEXT,
    "metadataPayload" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastStatusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceAlert_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'WorkspaceAlert_workspaceId_fkey'
    ) THEN
        ALTER TABLE "WorkspaceAlert"
            ADD CONSTRAINT "WorkspaceAlert_workspaceId_fkey"
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
        WHERE conname = 'WorkspaceAlert_clientBusinessId_fkey'
    ) THEN
        ALTER TABLE "WorkspaceAlert"
            ADD CONSTRAINT "WorkspaceAlert_clientBusinessId_fkey"
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
        WHERE conname = 'WorkspaceAlert_statusChangedByUserId_fkey'
    ) THEN
        ALTER TABLE "WorkspaceAlert"
            ADD CONSTRAINT "WorkspaceAlert_statusChangedByUserId_fkey"
            FOREIGN KEY ("statusChangedByUserId") REFERENCES "User"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceAlert_workspaceId_dedupeKey_key"
    ON "WorkspaceAlert"("workspaceId", "dedupeKey");

CREATE INDEX IF NOT EXISTS "WorkspaceAlert_workspaceId_status_severity_lastDetectedAt_idx"
    ON "WorkspaceAlert"("workspaceId", "status", "severity", "lastDetectedAt");

CREATE INDEX IF NOT EXISTS "WorkspaceAlert_workspaceId_type_status_idx"
    ON "WorkspaceAlert"("workspaceId", "type", "status");

CREATE INDEX IF NOT EXISTS "WorkspaceAlert_clientBusinessId_status_severity_idx"
    ON "WorkspaceAlert"("clientBusinessId", "status", "severity");

CREATE INDEX IF NOT EXISTS "WorkspaceAlert_statusChangedByUserId_idx"
    ON "WorkspaceAlert"("statusChangedByUserId");
