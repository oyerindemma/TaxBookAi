-- CreateEnum
CREATE TYPE "CITWorkflowStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'READY', 'BLOCKED', 'APPROVED_FOR_EXPORT');

-- CreateEnum
CREATE TYPE "CITBlockerSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "CITAdjustmentCategory" AS ENUM ('NON_DEDUCTIBLE_EXPENSE', 'PERSONAL_EXPENSE', 'DONATION', 'DEPRECIATION_ADD_BACK', 'CAPITAL_ALLOWANCE', 'TAX_EXEMPT_INCOME', 'PRIOR_YEAR_LOSS', 'INCENTIVE_DEDUCTION', 'FX_REVALUATION', 'OTHER');

-- AlterTable
ALTER TABLE "TaxAdjustment" ADD COLUMN     "citCategory" "CITAdjustmentCategory";

-- AlterTable
ALTER TABLE "FilingEvidence" ADD COLUMN     "citPeriodId" INTEGER,
ADD COLUMN     "taxAdjustmentId" INTEGER;

-- CreateTable
CREATE TABLE "CITPeriod" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "taxPeriodId" INTEGER NOT NULL,
    "computationId" INTEGER,
    "filingDraftId" INTEGER,
    "status" "CITWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "blockerCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "evidenceNote" TEXT,
    "summaryPayload" TEXT,
    "exportedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CITPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CITBlocker" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "citPeriodId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "CITBlockerSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "href" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CITBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CITPeriod_taxPeriodId_key" ON "CITPeriod"("taxPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "CITPeriod_computationId_key" ON "CITPeriod"("computationId");

-- CreateIndex
CREATE UNIQUE INDEX "CITPeriod_filingDraftId_key" ON "CITPeriod"("filingDraftId");

-- CreateIndex
CREATE INDEX "CITPeriod_workspaceId_status_updatedAt_idx" ON "CITPeriod"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CITPeriod_clientBusinessId_status_updatedAt_idx" ON "CITPeriod"("clientBusinessId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CITPeriod_reviewedByUserId_idx" ON "CITPeriod"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "CITBlocker_workspaceId_severity_resolved_idx" ON "CITBlocker"("workspaceId", "severity", "resolved");

-- CreateIndex
CREATE INDEX "CITBlocker_clientBusinessId_severity_resolved_idx" ON "CITBlocker"("clientBusinessId", "severity", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "CITBlocker_citPeriodId_code_key" ON "CITBlocker"("citPeriodId", "code");

-- CreateIndex
CREATE INDEX "FilingEvidence_taxAdjustmentId_idx" ON "FilingEvidence"("taxAdjustmentId");

-- CreateIndex
CREATE INDEX "FilingEvidence_citPeriodId_idx" ON "FilingEvidence"("citPeriodId");

-- AddForeignKey
ALTER TABLE "CITPeriod" ADD CONSTRAINT "CITPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITPeriod" ADD CONSTRAINT "CITPeriod_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITPeriod" ADD CONSTRAINT "CITPeriod_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITPeriod" ADD CONSTRAINT "CITPeriod_computationId_fkey" FOREIGN KEY ("computationId") REFERENCES "TaxComputation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITPeriod" ADD CONSTRAINT "CITPeriod_filingDraftId_fkey" FOREIGN KEY ("filingDraftId") REFERENCES "FilingDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITPeriod" ADD CONSTRAINT "CITPeriod_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITBlocker" ADD CONSTRAINT "CITBlocker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITBlocker" ADD CONSTRAINT "CITBlocker_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CITBlocker" ADD CONSTRAINT "CITBlocker_citPeriodId_fkey" FOREIGN KEY ("citPeriodId") REFERENCES "CITPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_taxAdjustmentId_fkey" FOREIGN KEY ("taxAdjustmentId") REFERENCES "TaxAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingEvidence" ADD CONSTRAINT "FilingEvidence_citPeriodId_fkey" FOREIGN KEY ("citPeriodId") REFERENCES "CITPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

