-- CreateEnum
CREATE TYPE "ClientBusinessStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LedgerCategoryType" AS ENUM ('INCOME', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('MONEY_IN', 'MONEY_OUT', 'JOURNAL');

-- CreateEnum
CREATE TYPE "TransactionOrigin" AS ENUM ('MANUAL', 'AI_DRAFT', 'IMPORT');

-- CreateEnum
CREATE TYPE "TransactionReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'POSTED');

-- CreateEnum
CREATE TYPE "VatTreatment" AS ENUM ('NONE', 'INPUT', 'OUTPUT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "WhtTreatment" AS ENUM ('NONE', 'PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "BookkeepingUploadSource" AS ENUM ('RECEIPT', 'BILL', 'INVOICE', 'BANK_STATEMENT', 'CSV', 'OTHER');

-- CreateEnum
CREATE TYPE "BookkeepingUploadStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DraftReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- CreateTable
CREATE TABLE "ClientBusiness" (
    "id" SERIAL NOT NULL,
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
    "status" "ClientBusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" SERIAL NOT NULL,
    "clientBusinessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "taxIdentificationNumber" TEXT,
    "vatRegistrationNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" SERIAL NOT NULL,
    "clientBusinessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "LedgerCategoryType" NOT NULL DEFAULT 'EXPENSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookkeepingUpload" (
    "id" SERIAL NOT NULL,
    "clientBusinessId" INTEGER NOT NULL,
    "uploadedByUserId" INTEGER,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "sourceType" "BookkeepingUploadSource" NOT NULL DEFAULT 'OTHER',
    "status" "BookkeepingUploadStatus" NOT NULL DEFAULT 'QUEUED',
    "uploadSizeBytes" INTEGER,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "BookkeepingUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookkeepingDraft" (
    "id" SERIAL NOT NULL,
    "uploadId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "proposedDate" TIMESTAMP(3),
    "description" TEXT,
    "reference" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "amountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "DraftReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookkeepingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" SERIAL NOT NULL,
    "clientBusinessId" INTEGER NOT NULL,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "sourceDraftId" INTEGER,
    "createdByUserId" INTEGER,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "origin" "TransactionOrigin" NOT NULL DEFAULT 'MANUAL',
    "reviewStatus" "TransactionReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "ClientBusiness" ADD CONSTRAINT "ClientBusiness_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookkeepingUpload" ADD CONSTRAINT "BookkeepingUpload_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookkeepingUpload" ADD CONSTRAINT "BookkeepingUpload_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookkeepingDraft" ADD CONSTRAINT "BookkeepingDraft_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "BookkeepingUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookkeepingDraft" ADD CONSTRAINT "BookkeepingDraft_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookkeepingDraft" ADD CONSTRAINT "BookkeepingDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "BookkeepingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
