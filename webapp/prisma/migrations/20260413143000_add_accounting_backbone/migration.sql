-- CreateEnum
CREATE TYPE "AccountingAccountClass" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "accountClass" "AccountingAccountClass" NOT NULL,
    "description" TEXT,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "memo" TEXT,
    "source" "JournalEntrySource" NOT NULL DEFAULT 'MANUAL',
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "journalEntryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "sourceTransactionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalLine_debit_nonnegative_check" CHECK ("debit" >= 0),
    CONSTRAINT "JournalLine_credit_nonnegative_check" CHECK ("credit" >= 0),
    CONSTRAINT "JournalLine_single_sided_amount_check" CHECK ((CASE WHEN "debit" > 0 THEN 1 ELSE 0 END + CASE WHEN "credit" > 0 THEN 1 ELSE 0 END) = 1),
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_workspaceId_name_key" ON "ChartOfAccount"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_workspaceId_code_key" ON "ChartOfAccount"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_workspaceId_accountClass_isActive_idx" ON "ChartOfAccount"("workspaceId", "accountClass", "isActive");

-- CreateIndex
CREATE INDEX "ChartOfAccount_workspaceId_isSystemDefault_isActive_idx" ON "ChartOfAccount"("workspaceId", "isSystemDefault", "isActive");

-- CreateIndex
CREATE INDEX "JournalEntry_workspaceId_entryDate_idx" ON "JournalEntry"("workspaceId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_workspaceId_status_entryDate_idx" ON "JournalEntry"("workspaceId", "status", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_createdByUserId_entryDate_idx" ON "JournalEntry"("createdByUserId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalLine_journalEntryId_lineNumber_key" ON "JournalLine"("journalEntryId", "lineNumber");

-- CreateIndex
CREATE INDEX "JournalLine_workspaceId_journalEntryId_idx" ON "JournalLine"("workspaceId", "journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_workspaceId_accountId_idx" ON "JournalLine"("workspaceId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_sourceTransactionId_idx" ON "JournalLine"("sourceTransactionId");

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
