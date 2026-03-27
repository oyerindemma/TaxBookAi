PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BookkeepingUpload" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER NOT NULL,
    "uploadedByUserId" INTEGER,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'OTHER',
    "documentType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploadSizeBytes" INTEGER,
    "fileHash" TEXT,
    "fileData" BLOB,
    "reviewNotes" TEXT,
    "rawText" TEXT,
    "aiPayload" TEXT,
    "failureReason" TEXT,
    "duplicateOfUploadId" INTEGER,
    "duplicateConfidence" REAL,
    "duplicateReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "extractedAt" DATETIME,
    "reviewedAt" DATETIME,
    CONSTRAINT "BookkeepingUpload_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingUpload_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingUpload_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingUpload_duplicateOfUploadId_fkey" FOREIGN KEY ("duplicateOfUploadId") REFERENCES "BookkeepingUpload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_BookkeepingUpload" (
    "id",
    "workspaceId",
    "clientBusinessId",
    "uploadedByUserId",
    "fileName",
    "fileType",
    "sourceType",
    "documentType",
    "status",
    "uploadSizeBytes",
    "reviewNotes",
    "rawText",
    "aiPayload",
    "failureReason",
    "createdAt",
    "updatedAt",
    "extractedAt",
    "reviewedAt"
)
SELECT
    "BookkeepingUpload"."id",
    "ClientBusiness"."workspaceId",
    "BookkeepingUpload"."clientBusinessId",
    "BookkeepingUpload"."uploadedByUserId",
    "BookkeepingUpload"."fileName",
    "BookkeepingUpload"."fileType",
    "BookkeepingUpload"."sourceType",
    CASE
        WHEN "BookkeepingUpload"."sourceType" = 'RECEIPT' THEN 'RECEIPT'
        WHEN "BookkeepingUpload"."sourceType" = 'INVOICE' THEN 'INVOICE'
        WHEN "BookkeepingUpload"."sourceType" = 'BILL' THEN 'INVOICE'
        ELSE 'UNKNOWN'
    END,
    "BookkeepingUpload"."status",
    "BookkeepingUpload"."uploadSizeBytes",
    "BookkeepingUpload"."reviewNotes",
    "BookkeepingUpload"."rawText",
    "BookkeepingUpload"."aiPayload",
    "BookkeepingUpload"."failureReason",
    "BookkeepingUpload"."createdAt",
    "BookkeepingUpload"."updatedAt",
    CASE
        WHEN "BookkeepingUpload"."rawText" IS NOT NULL OR "BookkeepingUpload"."aiPayload" IS NOT NULL
            THEN "BookkeepingUpload"."updatedAt"
        ELSE NULL
    END,
    "BookkeepingUpload"."reviewedAt"
FROM "BookkeepingUpload"
INNER JOIN "ClientBusiness"
ON "ClientBusiness"."id" = "BookkeepingUpload"."clientBusinessId";

DROP TABLE "BookkeepingUpload";
ALTER TABLE "new_BookkeepingUpload" RENAME TO "BookkeepingUpload";

CREATE INDEX "BookkeepingUpload_workspaceId_status_createdAt_idx" ON "BookkeepingUpload"("workspaceId", "status", "createdAt");
CREATE INDEX "BookkeepingUpload_workspaceId_documentType_createdAt_idx" ON "BookkeepingUpload"("workspaceId", "documentType", "createdAt");
CREATE INDEX "BookkeepingUpload_clientBusinessId_status_createdAt_idx" ON "BookkeepingUpload"("clientBusinessId", "status", "createdAt");
CREATE INDEX "BookkeepingUpload_uploadedByUserId_idx" ON "BookkeepingUpload"("uploadedByUserId");
CREATE INDEX "BookkeepingUpload_fileHash_idx" ON "BookkeepingUpload"("fileHash");
CREATE INDEX "BookkeepingUpload_duplicateOfUploadId_idx" ON "BookkeepingUpload"("duplicateOfUploadId");

ALTER TABLE "BookkeepingDraft" ADD COLUMN "documentNumber" TEXT;
ALTER TABLE "BookkeepingDraft" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "BookkeepingDraft" ADD COLUMN "subtotalMinor" INTEGER;
ALTER TABLE "BookkeepingDraft" ADD COLUMN "totalAmountMinor" INTEGER;
ALTER TABLE "BookkeepingDraft" ADD COLUMN "deductibilityHint" TEXT;
ALTER TABLE "BookkeepingDraft" ADD COLUMN "fieldConfidencePayload" TEXT;
ALTER TABLE "BookkeepingDraft" ADD COLUMN "lineItemsPayload" TEXT;

UPDATE "BookkeepingDraft"
SET "totalAmountMinor" = "amountMinor"
WHERE "totalAmountMinor" IS NULL
  AND "amountMinor" IS NOT NULL;

CREATE INDEX "BookkeepingDraft_uploadId_documentNumber_idx" ON "BookkeepingDraft"("uploadId", "documentNumber");

PRAGMA foreign_keys=ON;
