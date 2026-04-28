CREATE TABLE IF NOT EXISTS "Account" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" SERIAL NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "workspaceId" INTEGER NOT NULL,
    "sourceBankTransactionId" INTEGER,
    "sourceLedgerTransactionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "transactionId" INTEGER;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "accountId" INTEGER;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "debit" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "credit" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Account_workspaceId_name_key" ON "Account"("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "Account_workspaceId_type_idx" ON "Account"("workspaceId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_sourceBankTransactionId_key" ON "Transaction"("sourceBankTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_sourceLedgerTransactionId_key" ON "Transaction"("sourceLedgerTransactionId");
CREATE INDEX IF NOT EXISTS "Transaction_workspaceId_status_date_idx" ON "Transaction"("workspaceId", "status", "date");
CREATE INDEX IF NOT EXISTS "Transaction_workspaceId_date_idx" ON "Transaction"("workspaceId", "date");
CREATE INDEX IF NOT EXISTS "JournalEntry_transactionId_idx" ON "JournalEntry"("transactionId");
CREATE INDEX IF NOT EXISTS "JournalEntry_accountId_idx" ON "JournalEntry"("accountId");

DO $$
BEGIN
    ALTER TABLE "Account"
        ADD CONSTRAINT "Account_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "Transaction"
        ADD CONSTRAINT "Transaction_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "Transaction"
        ADD CONSTRAINT "Transaction_sourceBankTransactionId_fkey"
        FOREIGN KEY ("sourceBankTransactionId") REFERENCES "BankTransaction"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "Transaction"
        ADD CONSTRAINT "Transaction_sourceLedgerTransactionId_fkey"
        FOREIGN KEY ("sourceLedgerTransactionId") REFERENCES "LedgerTransaction"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "JournalEntry"
        ADD CONSTRAINT "JournalEntry_transactionId_fkey"
        FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "JournalEntry"
        ADD CONSTRAINT "JournalEntry_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "Account"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
