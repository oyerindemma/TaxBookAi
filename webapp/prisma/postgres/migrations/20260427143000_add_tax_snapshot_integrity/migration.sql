ALTER TABLE "TaxSnapshot"
ADD COLUMN "estimatedTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "transactionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "categorizedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'incomplete';

UPDATE "TaxSnapshot"
SET "estimatedTax" = "taxPayable"
WHERE "estimatedTax" = 0;

ALTER TABLE "BankTransaction"
ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "snapshotId" TEXT;

ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "TaxSnapshot"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TaxSnapshot_workspaceId_status_createdAt_idx"
ON "TaxSnapshot"("workspaceId", "status", "createdAt");

CREATE INDEX "BankTransaction_snapshotId_idx"
ON "BankTransaction"("snapshotId");

CREATE INDEX "BankTransaction_workspaceId_locked_transactionDate_idx"
ON "BankTransaction"("workspaceId", "locked", "transactionDate");
