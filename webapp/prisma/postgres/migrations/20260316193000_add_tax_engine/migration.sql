-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('VAT', 'WHT', 'CIT');

-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('SALES_GOODS', 'SALES_SERVICES', 'PURCHASE_GOODS', 'PURCHASE_SERVICES', 'OPERATING_EXPENSE', 'PROFESSIONAL_SERVICE', 'RENT', 'PAYROLL', 'ASSET_PURCHASE', 'TAX_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxEvidenceStatus" AS ENUM ('UNKNOWN', 'PENDING', 'ATTACHED', 'VERIFIED', 'MISSING');

-- CreateEnum
CREATE TYPE "TaxReviewStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'OVERRIDDEN', 'REOPENED');

-- CreateEnum
CREATE TYPE "TaxPeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM', 'ALL_TIME');

-- CreateEnum
CREATE TYPE "TaxPeriodStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'READY', 'FILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaxComputationStatus" AS ENUM ('DRAFT', 'REVIEW_READY', 'FINALIZED');

-- CreateEnum
CREATE TYPE "TaxAdjustmentDirection" AS ENUM ('ADD_BACK', 'DEDUCTION', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "FilingDraftStatus" AS ENUM ('DRAFT', 'REVIEW_READY', 'READY_TO_FILE', 'FILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FilingItemStatus" AS ENUM ('PENDING', 'INCLUDED', 'EXCLUDED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "FilingEvidenceKind" AS ENUM ('SOURCE_DOCUMENT', 'NOTE', 'SUPPORT_SCHEDULE', 'BANK_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN     "filingPeriodKey" TEXT,
ADD COLUMN     "sourceDocumentNumber" TEXT,
ADD COLUMN     "taxCategory" "TaxCategory",
ADD COLUMN     "taxEvidenceStatus" "TaxEvidenceStatus" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "BookkeepingDraft" ADD COLUMN     "filingPeriodKey" TEXT,
ADD COLUMN     "taxCategory" "TaxCategory",
ADD COLUMN     "taxEvidenceStatus" "TaxEvidenceStatus" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientBusinessId" INTEGER,
ADD COLUMN     "filingPeriodKey" TEXT,
ADD COLUMN     "sourceDocumentNumber" TEXT,
ADD COLUMN     "taxCategory" "TaxCategory",
ADD COLUMN     "taxEvidenceStatus" "TaxEvidenceStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "TaxRecord" ADD COLUMN     "clientBusinessId" INTEGER,
ADD COLUMN     "filingPeriodKey" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" INTEGER,
ADD COLUMN     "sourceDocumentNumber" TEXT,
ADD COLUMN     "taxCategory" "TaxCategory",
ADD COLUMN     "taxEvidenceStatus" "TaxEvidenceStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "taxReviewStatus" "TaxReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "periodKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodType" "TaxPeriodType" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "TaxPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxComputation" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "status" "TaxComputationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "outputVatMinor" INTEGER NOT NULL DEFAULT 0,
    "inputVatMinor" INTEGER NOT NULL DEFAULT 0,
    "netVatMinor" INTEGER NOT NULL DEFAULT 0,
    "whtDeductedMinor" INTEGER NOT NULL DEFAULT 0,
    "whtSufferedMinor" INTEGER NOT NULL DEFAULT 0,
    "accountingProfitMinor" INTEGER NOT NULL DEFAULT 0,
    "addBacksMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "taxAdjustedProfitMinor" INTEGER NOT NULL DEFAULT 0,
    "rulesVersion" TEXT,
    "summaryPayload" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxComputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VATRecord" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "engineKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" INTEGER,
    "sourceDocumentId" INTEGER,
    "invoiceId" INTEGER,
    "ledgerTransactionId" INTEGER,
    "bookkeepingDraftId" INTEGER,
    "taxRecordId" INTEGER,
    "bankTransactionId" INTEGER,
    "sourceDocumentNumber" TEXT,
    "counterpartyName" TEXT,
    "taxCategory" "TaxCategory",
    "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "direction" TEXT NOT NULL,
    "basisAmountMinor" INTEGER NOT NULL,
    "vatAmountMinor" INTEGER NOT NULL,
    "totalAmountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "confidence" DOUBLE PRECISION,
    "flagsPayload" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VATRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WHTRecord" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "engineKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" INTEGER,
    "sourceDocumentId" INTEGER,
    "invoiceId" INTEGER,
    "ledgerTransactionId" INTEGER,
    "bookkeepingDraftId" INTEGER,
    "taxRecordId" INTEGER,
    "bankTransactionId" INTEGER,
    "sourceDocumentNumber" TEXT,
    "counterpartyName" TEXT,
    "counterpartyTaxId" TEXT,
    "taxCategory" "TaxCategory",
    "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "direction" TEXT NOT NULL,
    "basisAmountMinor" INTEGER NOT NULL,
    "whtRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "whtAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "confidence" DOUBLE PRECISION,
    "flagsPayload" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WHTRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxAdjustment" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "direction" "TaxAdjustmentDirection" NOT NULL,
    "label" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "sourceReference" TEXT,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingDraft" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "status" "FilingDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "title" TEXT,
    "summaryPayload" TEXT,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "readyAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingItem" (
    "id" SERIAL NOT NULL,
    "filingDraftId" INTEGER NOT NULL,
    "vatRecordId" INTEGER,
    "whtRecordId" INTEGER,
    "taxAdjustmentId" INTEGER,
    "label" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" INTEGER,
    "amountMinor" INTEGER NOT NULL,
    "taxAmountMinor" INTEGER,
    "status" "FilingItemStatus" NOT NULL DEFAULT 'PENDING',
    "flagsPayload" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingEvidence" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "filingDraftId" INTEGER,
    "taxRecordId" INTEGER,
    "bookkeepingUploadId" INTEGER,
    "vatRecordId" INTEGER,
    "whtRecordId" INTEGER,
    "label" TEXT NOT NULL,
    "evidenceKind" "FilingEvidenceKind" NOT NULL DEFAULT 'SOURCE_DOCUMENT',
    "note" TEXT,
    "url" TEXT,
    "uploadedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionLog" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "filingDraftId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "provider" TEXT,
    "action" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxPeriod_workspaceId_startDate_endDate_idx" ON "TaxPeriod"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TaxPeriod_clientBusinessId_startDate_endDate_idx" ON "TaxPeriod"("clientBusinessId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TaxPeriod_reviewedByUserId_idx" ON "TaxPeriod"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxPeriod_workspaceId_clientBusinessId_periodKey_key" ON "TaxPeriod"("workspaceId", "clientBusinessId", "periodKey");

-- CreateIndex
CREATE INDEX "TaxComputation_workspaceId_taxType_computedAt_idx" ON "TaxComputation"("workspaceId", "taxType", "computedAt");

-- CreateIndex
CREATE INDEX "TaxComputation_clientBusinessId_taxType_computedAt_idx" ON "TaxComputation"("clientBusinessId", "taxType", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxComputation_taxPeriodId_taxType_key" ON "TaxComputation"("taxPeriodId", "taxType");

-- CreateIndex
CREATE UNIQUE INDEX "VATRecord_engineKey_key" ON "VATRecord"("engineKey");

-- CreateIndex
CREATE INDEX "VATRecord_workspaceId_taxPeriodId_direction_idx" ON "VATRecord"("workspaceId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "VATRecord_clientBusinessId_taxPeriodId_direction_idx" ON "VATRecord"("clientBusinessId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "VATRecord_invoiceId_idx" ON "VATRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "VATRecord_ledgerTransactionId_idx" ON "VATRecord"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "VATRecord_bookkeepingDraftId_idx" ON "VATRecord"("bookkeepingDraftId");

-- CreateIndex
CREATE INDEX "VATRecord_taxRecordId_idx" ON "VATRecord"("taxRecordId");

-- CreateIndex
CREATE INDEX "VATRecord_bankTransactionId_idx" ON "VATRecord"("bankTransactionId");

-- CreateIndex
CREATE INDEX "VATRecord_reviewedByUserId_idx" ON "VATRecord"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WHTRecord_engineKey_key" ON "WHTRecord"("engineKey");

-- CreateIndex
CREATE INDEX "WHTRecord_workspaceId_taxPeriodId_direction_idx" ON "WHTRecord"("workspaceId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "WHTRecord_clientBusinessId_taxPeriodId_direction_idx" ON "WHTRecord"("clientBusinessId", "taxPeriodId", "direction");

-- CreateIndex
CREATE INDEX "WHTRecord_invoiceId_idx" ON "WHTRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "WHTRecord_ledgerTransactionId_idx" ON "WHTRecord"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "WHTRecord_bookkeepingDraftId_idx" ON "WHTRecord"("bookkeepingDraftId");

-- CreateIndex
CREATE INDEX "WHTRecord_taxRecordId_idx" ON "WHTRecord"("taxRecordId");

-- CreateIndex
CREATE INDEX "WHTRecord_bankTransactionId_idx" ON "WHTRecord"("bankTransactionId");

-- CreateIndex
CREATE INDEX "WHTRecord_reviewedByUserId_idx" ON "WHTRecord"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "TaxAdjustment_workspaceId_taxType_createdAt_idx" ON "TaxAdjustment"("workspaceId", "taxType", "createdAt");

-- CreateIndex
CREATE INDEX "TaxAdjustment_clientBusinessId_taxType_createdAt_idx" ON "TaxAdjustment"("clientBusinessId", "taxType", "createdAt");

-- CreateIndex
CREATE INDEX "TaxAdjustment_createdByUserId_idx" ON "TaxAdjustment"("createdByUserId");

-- CreateIndex
CREATE INDEX "FilingDraft_workspaceId_taxType_status_idx" ON "FilingDraft"("workspaceId", "taxType", "status");

-- CreateIndex
CREATE INDEX "FilingDraft_clientBusinessId_taxType_status_idx" ON "FilingDraft"("clientBusinessId", "taxType", "status");

-- CreateIndex
CREATE INDEX "FilingDraft_reviewedByUserId_idx" ON "FilingDraft"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FilingDraft_taxPeriodId_taxType_key" ON "FilingDraft"("taxPeriodId", "taxType");

-- CreateIndex
CREATE INDEX "FilingItem_filingDraftId_status_idx" ON "FilingItem"("filingDraftId", "status");

-- CreateIndex
CREATE INDEX "FilingItem_vatRecordId_idx" ON "FilingItem"("vatRecordId");

-- CreateIndex
CREATE INDEX "FilingItem_whtRecordId_idx" ON "FilingItem"("whtRecordId");

-- CreateIndex
CREATE INDEX "FilingItem_taxAdjustmentId_idx" ON "FilingItem"("taxAdjustmentId");

-- CreateIndex
CREATE INDEX "FilingEvidence_workspaceId_createdAt_idx" ON "FilingEvidence"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FilingEvidence_clientBusinessId_createdAt_idx" ON "FilingEvidence"("clientBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "FilingEvidence_filingDraftId_idx" ON "FilingEvidence"("filingDraftId");

-- CreateIndex
CREATE INDEX "FilingEvidence_taxRecordId_idx" ON "FilingEvidence"("taxRecordId");

-- CreateIndex
CREATE INDEX "FilingEvidence_bookkeepingUploadId_idx" ON "FilingEvidence"("bookkeepingUploadId");

-- CreateIndex
CREATE INDEX "FilingEvidence_vatRecordId_idx" ON "FilingEvidence"("vatRecordId");

-- CreateIndex
CREATE INDEX "FilingEvidence_whtRecordId_idx" ON "FilingEvidence"("whtRecordId");

-- CreateIndex
CREATE INDEX "FilingEvidence_uploadedByUserId_idx" ON "FilingEvidence"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "SubmissionLog_workspaceId_createdAt_idx" ON "SubmissionLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionLog_filingDraftId_createdAt_idx" ON "SubmissionLog"("filingDraftId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionLog_actorUserId_idx" ON "SubmissionLog"("actorUserId");

-- CreateIndex
CREATE INDEX "Invoice_clientBusinessId_idx" ON "Invoice"("clientBusinessId");

-- CreateIndex
CREATE INDEX "TaxRecord_clientBusinessId_occurredOn_idx" ON "TaxRecord"("clientBusinessId", "occurredOn");

-- CreateIndex
CREATE INDEX "TaxRecord_reviewedByUserId_idx" ON "TaxRecord"("reviewedByUserId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord" ADD CONSTRAINT "TaxRecord_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord" ADD CONSTRAINT "TaxRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxComputation" ADD CONSTRAINT "TaxComputation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxComputation" ADD CONSTRAINT "TaxComputation_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxComputation" ADD CONSTRAINT "TaxComputation_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_bookkeepingDraftId_fkey" FOREIGN KEY ("bookkeepingDraftId") REFERENCES "BookkeepingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRecord" ADD CONSTRAINT "VATRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_bookkeepingDraftId_fkey" FOREIGN KEY ("bookkeepingDraftId") REFERENCES "BookkeepingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHTRecord" ADD CONSTRAINT "WHTRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingDraft" ADD CONSTRAINT "FilingDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingDraft" ADD CONSTRAINT "FilingDraft_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingDraft" ADD CONSTRAINT "FilingDraft_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingDraft" ADD CONSTRAINT "FilingDraft_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingItem" ADD CONSTRAINT "FilingItem_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingItem" ADD CONSTRAINT "FilingItem_vatRecordId_fkey" FOREIGN KEY ("vatRecordId") REFERENCES "VATRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingItem" ADD CONSTRAINT "FilingItem_whtRecordId_fkey" FOREIGN KEY ("whtRecordId") REFERENCES "WHTRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingItem" ADD CONSTRAINT "FilingItem_taxAdjustmentId_fkey" FOREIGN KEY ("taxAdjustmentId") REFERENCES "TaxAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_taxRecordId_fkey" FOREIGN KEY ("taxRecordId") REFERENCES "TaxRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_bookkeepingUploadId_fkey" FOREIGN KEY ("bookkeepingUploadId") REFERENCES "BookkeepingUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_vatRecordId_fkey" FOREIGN KEY ("vatRecordId") REFERENCES "VATRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_whtRecordId_fkey" FOREIGN KEY ("whtRecordId") REFERENCES "WHTRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLog" ADD CONSTRAINT "SubmissionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLog" ADD CONSTRAINT "SubmissionLog_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLog" ADD CONSTRAINT "SubmissionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

