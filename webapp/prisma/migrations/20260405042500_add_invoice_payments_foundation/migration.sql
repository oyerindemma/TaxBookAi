DO $$
BEGIN
    CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'STUB', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "reference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerTransactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reference_key" ON "Payment"("reference");
CREATE INDEX IF NOT EXISTS "Payment_workspaceId_status_idx" ON "Payment"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Payment_workspaceId_invoiceId_idx" ON "Payment"("workspaceId", "invoiceId");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_createdAt_idx" ON "Payment"("invoiceId", "createdAt");

DO $$
BEGIN
    ALTER TABLE "Payment"
        ADD CONSTRAINT "Payment_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "Payment"
        ADD CONSTRAINT "Payment_invoiceId_fkey"
        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
