-- CreateEnum
CREATE TYPE "BankTransactionAccountingPostingStatus" AS ENUM ('UNPOSTED', 'READY_TO_POST', 'POSTED');

-- AlterTable
ALTER TABLE "BankTransaction"
ADD COLUMN "accountingPostingStatus" "BankTransactionAccountingPostingStatus" NOT NULL DEFAULT 'UNPOSTED';

-- AlterTable
ALTER TABLE "JournalEntry"
ADD COLUMN "sourceBankTransactionId" INTEGER;

-- Backfill existing records
UPDATE "BankTransaction"
SET "accountingPostingStatus" = CASE
  WHEN "reviewStatus" = 'POSTED' THEN 'POSTED'::"BankTransactionAccountingPostingStatus"
  WHEN "reviewStatus" = 'REVIEWED' AND "postingReadiness" = 'READY_TO_POST'
    THEN 'READY_TO_POST'::"BankTransactionAccountingPostingStatus"
  ELSE 'UNPOSTED'::"BankTransactionAccountingPostingStatus"
END;

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_accountingPostingStatus_transa_idx"
ON "BankTransaction"("workspaceId", "accountingPostingStatus", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_sourceBankTransactionId_key"
ON "JournalEntry"("sourceBankTransactionId");

-- CreateIndex
CREATE INDEX "JournalEntry_workspaceId_sourceBankTransactionId_idx"
ON "JournalEntry"("workspaceId", "sourceBankTransactionId");

-- AddForeignKey
ALTER TABLE "JournalEntry"
ADD CONSTRAINT "JournalEntry_sourceBankTransactionId_fkey"
FOREIGN KEY ("sourceBankTransactionId") REFERENCES "BankTransaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
