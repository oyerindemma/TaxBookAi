DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'BankTransactionTaxTreatmentSource'
    ) THEN
        CREATE TYPE "BankTransactionTaxTreatmentSource" AS ENUM (
            'UNSET',
            'SUGGESTED',
            'MANUAL'
        );
    END IF;
END $$;

ALTER TABLE "BankTransaction"
    ADD COLUMN IF NOT EXISTS "vatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS "whtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "whtRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "vatAmountMinor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "whtAmountMinor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "taxTreatmentSource" "BankTransactionTaxTreatmentSource" NOT NULL DEFAULT 'UNSET';

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_vatTreatment_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "vatTreatment", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_whtTreatment_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "whtTreatment", "transactionDate");

CREATE INDEX IF NOT EXISTS "BankTransaction_workspaceId_taxTreatmentSource_transactionDate_idx"
    ON "BankTransaction"("workspaceId", "taxTreatmentSource", "transactionDate");
