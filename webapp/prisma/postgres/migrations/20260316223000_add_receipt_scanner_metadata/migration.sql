DO $$
BEGIN
    CREATE TYPE "BookkeepingDocumentType" AS ENUM ('RECEIPT', 'INVOICE', 'CREDIT_NOTE', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "BookkeepingUploadSource" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE';
ALTER TYPE "BookkeepingUploadStatus" ADD VALUE IF NOT EXISTS 'UPLOADED';
ALTER TYPE "BookkeepingUploadStatus" ADD VALUE IF NOT EXISTS 'EXTRACTED';

ALTER TABLE "BookkeepingUpload"
    ADD COLUMN "workspaceId" INTEGER,
    ADD COLUMN "documentType" "BookkeepingDocumentType" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "fileHash" TEXT,
    ADD COLUMN "fileData" BYTEA,
    ADD COLUMN "duplicateOfUploadId" INTEGER,
    ADD COLUMN "duplicateConfidence" DOUBLE PRECISION,
    ADD COLUMN "duplicateReason" TEXT,
    ADD COLUMN "extractedAt" TIMESTAMP(3);

UPDATE "BookkeepingUpload"
SET
    "workspaceId" = "ClientBusiness"."workspaceId",
    "documentType" = CASE
        WHEN "BookkeepingUpload"."sourceType" = 'RECEIPT' THEN 'RECEIPT'::"BookkeepingDocumentType"
        WHEN "BookkeepingUpload"."sourceType" = 'INVOICE' THEN 'INVOICE'::"BookkeepingDocumentType"
        WHEN "BookkeepingUpload"."sourceType" = 'BILL' THEN 'INVOICE'::"BookkeepingDocumentType"
        ELSE 'UNKNOWN'::"BookkeepingDocumentType"
    END,
    "extractedAt" = CASE
        WHEN "BookkeepingUpload"."rawText" IS NOT NULL OR "BookkeepingUpload"."aiPayload" IS NOT NULL
            THEN "BookkeepingUpload"."updatedAt"
        ELSE NULL
    END
FROM "ClientBusiness"
WHERE "ClientBusiness"."id" = "BookkeepingUpload"."clientBusinessId";

ALTER TABLE "BookkeepingUpload"
    ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "BookkeepingUpload"
    ADD CONSTRAINT "BookkeepingUpload_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "BookkeepingUpload_duplicateOfUploadId_fkey"
        FOREIGN KEY ("duplicateOfUploadId") REFERENCES "BookkeepingUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BookkeepingUpload_workspaceId_status_createdAt_idx"
    ON "BookkeepingUpload"("workspaceId", "status", "createdAt");
CREATE INDEX "BookkeepingUpload_workspaceId_documentType_createdAt_idx"
    ON "BookkeepingUpload"("workspaceId", "documentType", "createdAt");
CREATE INDEX "BookkeepingUpload_fileHash_idx"
    ON "BookkeepingUpload"("fileHash");
CREATE INDEX "BookkeepingUpload_duplicateOfUploadId_idx"
    ON "BookkeepingUpload"("duplicateOfUploadId");

ALTER TABLE "BookkeepingDraft"
    ADD COLUMN "documentNumber" TEXT,
    ADD COLUMN "paymentMethod" TEXT,
    ADD COLUMN "subtotalMinor" INTEGER,
    ADD COLUMN "totalAmountMinor" INTEGER,
    ADD COLUMN "deductibilityHint" TEXT,
    ADD COLUMN "fieldConfidencePayload" TEXT,
    ADD COLUMN "lineItemsPayload" TEXT;

UPDATE "BookkeepingDraft"
SET "totalAmountMinor" = "amountMinor"
WHERE "totalAmountMinor" IS NULL
  AND "amountMinor" IS NOT NULL;

CREATE INDEX "BookkeepingDraft_uploadId_documentNumber_idx"
    ON "BookkeepingDraft"("uploadId", "documentNumber");
