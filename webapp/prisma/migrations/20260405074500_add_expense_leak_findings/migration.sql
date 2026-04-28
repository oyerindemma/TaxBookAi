CREATE TABLE "ExpenseLeakFinding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "statusChangedByUserId" INTEGER,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
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
    "firstDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" DATETIME,
    "resolvedAt" DATETIME,
    "lastStatusChangedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseLeakFinding_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseLeakFinding_clientBusinessId_fkey"
        FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseLeakFinding_statusChangedByUserId_fkey"
        FOREIGN KEY ("statusChangedByUserId") REFERENCES "User" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExpenseLeakFinding_workspaceId_dedupeKey_key"
    ON "ExpenseLeakFinding"("workspaceId", "dedupeKey");

CREATE INDEX "ExpenseLeakFinding_workspaceId_status_severity_lastDetectedAt_idx"
    ON "ExpenseLeakFinding"("workspaceId", "status", "severity", "lastDetectedAt");

CREATE INDEX "ExpenseLeakFinding_workspaceId_type_status_idx"
    ON "ExpenseLeakFinding"("workspaceId", "type", "status");

CREATE INDEX "ExpenseLeakFinding_workspaceId_status_estimatedSavingsMinor_idx"
    ON "ExpenseLeakFinding"("workspaceId", "status", "estimatedSavingsMinor");

CREATE INDEX "ExpenseLeakFinding_clientBusinessId_status_severity_idx"
    ON "ExpenseLeakFinding"("clientBusinessId", "status", "severity");

CREATE INDEX "ExpenseLeakFinding_statusChangedByUserId_idx"
    ON "ExpenseLeakFinding"("statusChangedByUserId");
