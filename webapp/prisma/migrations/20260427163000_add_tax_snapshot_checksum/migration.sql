ALTER TABLE "TaxSnapshot"
ADD COLUMN "txCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "txChecksum" TEXT NOT NULL DEFAULT '';

UPDATE "TaxSnapshot"
SET "txCount" = "transactionCount"
WHERE "txCount" = 0;

CREATE INDEX "TaxSnapshot_workspaceId_txChecksum_idx"
ON "TaxSnapshot"("workspaceId", "txChecksum");
