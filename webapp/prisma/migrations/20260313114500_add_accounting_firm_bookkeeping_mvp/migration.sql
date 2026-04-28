-- CreateTable
CREATE TABLE "ClientBusiness" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "industry" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "state" TEXT,
    "taxIdentificationNumber" TEXT,
    "vatRegistrationNumber" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientBusiness_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientBusinessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "taxIdentificationNumber" TEXT,
    "vatRegistrationNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vendor_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientBusinessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransactionCategory_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookkeepingUpload" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientBusinessId" INTEGER NOT NULL,
    "uploadedByUserId" INTEGER,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "uploadSizeBytes" INTEGER,
    "reviewNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    CONSTRAINT "BookkeepingUpload_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingUpload_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookkeepingDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uploadId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "proposedDate" DATETIME,
    "description" TEXT,
    "reference" TEXT,
    "direction" TEXT NOT NULL,
    "amountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "confidence" REAL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookkeepingDraft_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "BookkeepingUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BookkeepingDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientBusinessId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "sourceDraftId" INTEGER,
    "createdByUserId" INTEGER,
    "transactionDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "direction" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "whtTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LedgerTransaction_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "BookkeepingDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientBusiness_workspaceId_name_key" ON "ClientBusiness"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ClientBusiness_workspaceId_status_idx" ON "ClientBusiness"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ClientBusiness_workspaceId_archivedAt_idx" ON "ClientBusiness"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_clientBusinessId_name_key" ON "Vendor"("clientBusinessId", "name");

-- CreateIndex
CREATE INDEX "Vendor_clientBusinessId_name_idx" ON "Vendor"("clientBusinessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCategory_clientBusinessId_name_key" ON "TransactionCategory"("clientBusinessId", "name");

-- CreateIndex
CREATE INDEX "TransactionCategory_clientBusinessId_type_name_idx" ON "TransactionCategory"("clientBusinessId", "type", "name");

-- CreateIndex
CREATE INDEX "BookkeepingUpload_clientBusinessId_status_createdAt_idx" ON "BookkeepingUpload"("clientBusinessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BookkeepingUpload_uploadedByUserId_idx" ON "BookkeepingUpload"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "BookkeepingDraft_uploadId_reviewStatus_idx" ON "BookkeepingDraft"("uploadId", "reviewStatus");

-- CreateIndex
CREATE INDEX "BookkeepingDraft_categoryId_idx" ON "BookkeepingDraft"("categoryId");

-- CreateIndex
CREATE INDEX "BookkeepingDraft_vendorId_idx" ON "BookkeepingDraft"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_sourceDraftId_key" ON "LedgerTransaction"("sourceDraftId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_clientBusinessId_transactionDate_idx" ON "LedgerTransaction"("clientBusinessId", "transactionDate");

-- CreateIndex
CREATE INDEX "LedgerTransaction_clientBusinessId_reviewStatus_idx" ON "LedgerTransaction"("clientBusinessId", "reviewStatus");

-- CreateIndex
CREATE INDEX "LedgerTransaction_vendorId_transactionDate_idx" ON "LedgerTransaction"("vendorId", "transactionDate");

-- CreateIndex
CREATE INDEX "LedgerTransaction_categoryId_transactionDate_idx" ON "LedgerTransaction"("categoryId", "transactionDate");
