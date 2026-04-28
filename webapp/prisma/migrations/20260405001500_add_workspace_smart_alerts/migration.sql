CREATE TABLE "WorkspaceAlert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "statusChangedByUserId" INTEGER,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
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
    "firstDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozedUntil" DATETIME,
    "resolvedAt" DATETIME,
    "lastStatusChangedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceAlert_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceAlert_clientBusinessId_fkey"
        FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceAlert_statusChangedByUserId_fkey"
        FOREIGN KEY ("statusChangedByUserId") REFERENCES "User" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkspaceAlert_workspaceId_dedupeKey_key"
    ON "WorkspaceAlert"("workspaceId", "dedupeKey");

CREATE INDEX "WorkspaceAlert_workspaceId_status_severity_lastDetectedAt_idx"
    ON "WorkspaceAlert"("workspaceId", "status", "severity", "lastDetectedAt");

CREATE INDEX "WorkspaceAlert_workspaceId_type_status_idx"
    ON "WorkspaceAlert"("workspaceId", "type", "status");

CREATE INDEX "WorkspaceAlert_clientBusinessId_status_severity_idx"
    ON "WorkspaceAlert"("clientBusinessId", "status", "severity");

CREATE INDEX "WorkspaceAlert_statusChangedByUserId_idx"
    ON "WorkspaceAlert"("statusChangedByUserId");
