ALTER TABLE "BookkeepingUpload" ADD COLUMN "rawText" TEXT;
ALTER TABLE "BookkeepingUpload" ADD COLUMN "aiPayload" TEXT;
ALTER TABLE "BookkeepingUpload" ADD COLUMN "failureReason" TEXT;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookkeepingDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uploadId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "reviewedByUserId" INTEGER,
    "proposedDate" DATETIME,
    "description" TEXT,
    "reference" TEXT,
    "vendorName" TEXT,
    "suggestedCategoryName" TEXT,
    "direction" TEXT NOT NULL,
    "amountMinor" INTEGER,
    "taxAmountMinor" INTEGER,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "confidence" REAL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "aiPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    CONSTRAINT "BookkeepingDraft_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "BookkeepingUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BookkeepingDraft" (
    "id",
    "uploadId",
    "vendorId",
    "categoryId",
    "proposedDate",
    "description",
    "reference",
    "direction",
    "amountMinor",
    "currency",
    "vatAmountMinor",
    "whtAmountMinor",
    "vatTreatment",
    "whtTreatment",
    "confidence",
    "reviewStatus",
    "reviewerNote",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "uploadId",
    "vendorId",
    "categoryId",
    "proposedDate",
    "description",
    "reference",
    "direction",
    "amountMinor",
    "currency",
    "vatAmountMinor",
    "whtAmountMinor",
    "vatTreatment",
    "whtTreatment",
    "confidence",
    "reviewStatus",
    "reviewerNote",
    "createdAt",
    "updatedAt"
FROM "BookkeepingDraft";
DROP TABLE "BookkeepingDraft";
ALTER TABLE "new_BookkeepingDraft" RENAME TO "BookkeepingDraft";
CREATE INDEX "BookkeepingDraft_uploadId_reviewStatus_idx" ON "BookkeepingDraft"("uploadId", "reviewStatus");
CREATE INDEX "BookkeepingDraft_categoryId_idx" ON "BookkeepingDraft"("categoryId");
CREATE INDEX "BookkeepingDraft_vendorId_idx" ON "BookkeepingDraft"("vendorId");
CREATE INDEX "BookkeepingDraft_reviewedByUserId_idx" ON "BookkeepingDraft"("reviewedByUserId");
PRAGMA foreign_keys=ON;

