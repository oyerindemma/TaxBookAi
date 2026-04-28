ALTER TABLE "BankTransaction"
    ADD COLUMN "vatTreatment" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "BankTransaction"
    ADD COLUMN "whtTreatment" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "BankTransaction"
    ADD COLUMN "vatRate" REAL NOT NULL DEFAULT 0;

ALTER TABLE "BankTransaction"
    ADD COLUMN "whtRate" REAL NOT NULL DEFAULT 0;

ALTER TABLE "BankTransaction"
    ADD COLUMN "vatAmountMinor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BankTransaction"
    ADD COLUMN "whtAmountMinor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BankTransaction"
    ADD COLUMN "taxTreatmentSource" TEXT NOT NULL DEFAULT 'UNSET';

CREATE INDEX "BankTransaction_workspaceId_vatTreatment_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "vatTreatment", "transactionDate");

CREATE INDEX "BankTransaction_workspaceId_whtTreatment_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "whtTreatment", "transactionDate");

CREATE INDEX "BankTransaction_workspaceId_taxTreatmentSource_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "taxTreatmentSource", "transactionDate");
