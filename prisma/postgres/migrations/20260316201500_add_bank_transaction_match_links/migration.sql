ALTER TABLE "BankTransaction"
ADD COLUMN "matchedLedgerTransactionId" INTEGER,
ADD COLUMN "matchedInvoiceId" INTEGER;

ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_matchedLedgerTransactionId_fkey"
FOREIGN KEY ("matchedLedgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_matchedInvoiceId_fkey"
FOREIGN KEY ("matchedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BankTransaction_matchedLedgerTransactionId_idx"
ON "BankTransaction"("matchedLedgerTransactionId");

CREATE INDEX "BankTransaction_matchedInvoiceId_idx"
ON "BankTransaction"("matchedInvoiceId");
