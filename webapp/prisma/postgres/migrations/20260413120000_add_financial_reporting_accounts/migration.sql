-- CreateEnum
CREATE TYPE "CashflowActivityType" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

-- AlterTable
ALTER TABLE "TransactionCategory"
ADD COLUMN "cashflowActivity" "CashflowActivityType" NOT NULL DEFAULT 'OPERATING',
ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE INDEX "TransactionCategory_clientBusinessId_cashflowActivity_type_idx"
ON "TransactionCategory"("clientBusinessId", "cashflowActivity", "type");

-- CreateIndex
CREATE INDEX "TransactionCategory_clientBusinessId_code_idx"
ON "TransactionCategory"("clientBusinessId", "code");
