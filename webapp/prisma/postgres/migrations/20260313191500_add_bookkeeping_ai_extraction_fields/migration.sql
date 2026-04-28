ALTER TYPE "BookkeepingUploadStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "BookkeepingUpload"
ADD COLUMN "rawText" TEXT,
ADD COLUMN "aiPayload" TEXT,
ADD COLUMN "failureReason" TEXT;

ALTER TABLE "BookkeepingDraft"
ADD COLUMN "reviewedByUserId" INTEGER,
ADD COLUMN "vendorName" TEXT,
ADD COLUMN "suggestedCategoryName" TEXT,
ADD COLUMN "taxAmountMinor" INTEGER,
ADD COLUMN "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "aiPayload" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3);

ALTER TABLE "BookkeepingDraft"
ADD CONSTRAINT "BookkeepingDraft_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BookkeepingDraft_reviewedByUserId_idx" ON "BookkeepingDraft"("reviewedByUserId");
