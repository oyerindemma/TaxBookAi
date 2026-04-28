-- CreateEnum
CREATE TYPE "BankStatementImportStatus" AS ENUM ('PENDING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "BankTransactionBusinessType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'OWNER_DRAW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReconciliationMatchStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "BankTransactionStatus" ADD VALUE IF NOT EXISTS 'SUGGESTED';
ALTER TYPE "BankTransactionStatus" ADD VALUE IF NOT EXISTS 'SPLIT';
ALTER TYPE "BankTransactionStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';

-- AlterEnum
ALTER TYPE "ReconciliationMatchType" ADD VALUE IF NOT EXISTS 'LEDGER_TRANSACTION';
ALTER TYPE "ReconciliationMatchType" ADD VALUE IF NOT EXISTS 'BOOKKEEPING_DRAFT';
ALTER TYPE "ReconciliationMatchType" ADD VALUE IF NOT EXISTS 'SPLIT';

-- AlterTable
ALTER TABLE "BankAccount"
ADD COLUMN "clientBusinessId" INTEGER,
ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "BankAccount"
SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;

ALTER TABLE "BankAccount"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "bankAccountId" INTEGER NOT NULL,
    "uploadedByUserId" INTEGER,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadSizeBytes" INTEGER,
    "status" "BankStatementImportStatus" NOT NULL DEFAULT 'PENDING',
    "mappingJson" TEXT,
    "rawHeaders" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "BankTransaction"
ADD COLUMN "clientBusinessId" INTEGER,
ADD COLUMN "statementImportId" INTEGER,
ADD COLUMN "uploadedByUserId" INTEGER,
ADD COLUMN "debitAmountMinor" INTEGER,
ADD COLUMN "creditAmountMinor" INTEGER,
ADD COLUMN "balanceAmountMinor" INTEGER,
ADD COLUMN "sourceRowNumber" INTEGER,
ADD COLUMN "rawRowPayload" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN "suggestedType" "BankTransactionBusinessType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "suggestedCounterparty" TEXT,
ADD COLUMN "suggestedCategoryName" TEXT,
ADD COLUMN "suggestedVatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
ADD COLUMN "suggestedWhtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
ADD COLUMN "suggestedNarrationMeaning" TEXT,
ADD COLUMN "confidenceScore" DOUBLE PRECISION,
ADD COLUMN "categorizationProvider" TEXT,
ADD COLUMN "reviewNotes" TEXT,
ADD COLUMN "matchedAt" TIMESTAMP(3),
ADD COLUMN "ignoredAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "BankTransaction"
SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;

ALTER TABLE "BankTransaction"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "LedgerTransaction"
ADD COLUMN "bankTransactionId" INTEGER;

-- AlterTable
ALTER TABLE "TaxRecord"
ADD COLUMN "bankTransactionId" INTEGER;

-- DropIndex
DROP INDEX "ReconciliationMatch_bankTransactionId_key";

-- AlterTable
ALTER TABLE "ReconciliationMatch"
ADD COLUMN "ledgerTransactionId" INTEGER,
ADD COLUMN "bookkeepingDraftId" INTEGER,
ADD COLUMN "status" "ReconciliationMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
ADD COLUMN "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "matchedAmountMinor" INTEGER,
ADD COLUMN "rationale" TEXT,
ADD COLUMN "approvedByUserId" INTEGER,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "ReconciliationMatch"
SET
  "status" = 'APPROVED',
  "score" = 1,
  "approvedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;

ALTER TABLE "ReconciliationMatch"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "BankTransactionSplitLine" (
    "id" SERIAL NOT NULL,
    "bankTransactionId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "vendorId" INTEGER,
    "categoryId" INTEGER,
    "ledgerTransactionId" INTEGER,
    "createdByUserId" INTEGER,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransactionSplitLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_clientBusinessId_name_idx" ON "BankAccount"("clientBusinessId", "name");

-- CreateIndex
CREATE INDEX "BankStatementImport_workspaceId_createdAt_idx" ON "BankStatementImport"("workspaceId", "createdAt");
CREATE INDEX "BankStatementImport_clientBusinessId_createdAt_idx" ON "BankStatementImport"("clientBusinessId", "createdAt");
CREATE INDEX "BankStatementImport_bankAccountId_createdAt_idx" ON "BankStatementImport"("bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_status_transactionDate_idx" ON "BankTransaction"("workspaceId", "status", "transactionDate");
CREATE INDEX "BankTransaction_clientBusinessId_transactionDate_idx" ON "BankTransaction"("clientBusinessId", "transactionDate");
CREATE INDEX "BankTransaction_statementImportId_sourceRowNumber_idx" ON "BankTransaction"("statementImportId", "sourceRowNumber");

-- CreateIndex
CREATE INDEX "LedgerTransaction_bankTransactionId_idx" ON "LedgerTransaction"("bankTransactionId");

-- CreateIndex
CREATE INDEX "TaxRecord_bankTransactionId_idx" ON "TaxRecord"("bankTransactionId");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_bankTransactionId_status_idx" ON "ReconciliationMatch"("bankTransactionId", "status");
CREATE INDEX "ReconciliationMatch_ledgerTransactionId_idx" ON "ReconciliationMatch"("ledgerTransactionId");
CREATE INDEX "ReconciliationMatch_bookkeepingDraftId_idx" ON "ReconciliationMatch"("bookkeepingDraftId");
CREATE INDEX "ReconciliationMatch_invoiceId_idx" ON "ReconciliationMatch"("invoiceId");
CREATE INDEX "ReconciliationMatch_taxRecordId_idx" ON "ReconciliationMatch"("taxRecordId");

-- CreateIndex
CREATE INDEX "BankTransactionSplitLine_bankTransactionId_createdAt_idx" ON "BankTransactionSplitLine"("bankTransactionId", "createdAt");
CREATE INDEX "BankTransactionSplitLine_clientBusinessId_createdAt_idx" ON "BankTransactionSplitLine"("clientBusinessId", "createdAt");
CREATE INDEX "BankTransactionSplitLine_ledgerTransactionId_idx" ON "BankTransactionSplitLine"("ledgerTransactionId");

-- AddForeignKey
ALTER TABLE "BankAccount"
ADD CONSTRAINT "BankAccount_clientBusinessId_fkey"
FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport"
ADD CONSTRAINT "BankStatementImport_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport"
ADD CONSTRAINT "BankStatementImport_clientBusinessId_fkey"
FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport"
ADD CONSTRAINT "BankStatementImport_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport"
ADD CONSTRAINT "BankStatementImport_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_clientBusinessId_fkey"
FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_statementImportId_fkey"
FOREIGN KEY ("statementImportId") REFERENCES "BankStatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction"
ADD CONSTRAINT "LedgerTransaction_bankTransactionId_fkey"
FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord"
ADD CONSTRAINT "TaxRecord_bankTransactionId_fkey"
FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch"
ADD CONSTRAINT "ReconciliationMatch_ledgerTransactionId_fkey"
FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch"
ADD CONSTRAINT "ReconciliationMatch_bookkeepingDraftId_fkey"
FOREIGN KEY ("bookkeepingDraftId") REFERENCES "BookkeepingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch"
ADD CONSTRAINT "ReconciliationMatch_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionSplitLine"
ADD CONSTRAINT "BankTransactionSplitLine_bankTransactionId_fkey"
FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionSplitLine"
ADD CONSTRAINT "BankTransactionSplitLine_clientBusinessId_fkey"
FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionSplitLine"
ADD CONSTRAINT "BankTransactionSplitLine_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionSplitLine"
ADD CONSTRAINT "BankTransactionSplitLine_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionSplitLine"
ADD CONSTRAINT "BankTransactionSplitLine_ledgerTransactionId_fkey"
FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionSplitLine"
ADD CONSTRAINT "BankTransactionSplitLine_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
