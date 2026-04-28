-- CreateEnum
CREATE TYPE "PaymentIntegrationProvider" AS ENUM ('PAYSTACK');

-- CreateEnum
CREATE TYPE "PaymentProviderConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "PaymentGatewayEventType" AS ENUM ('CHARGE_SUCCESS', 'CHARGE_FAILED', 'TRANSFER_SUCCESS', 'TRANSFER_FAILED', 'REFUND', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentGatewayEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentSettlementStatus" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentTransactionCandidateKind" AS ENUM ('CUSTOMER_PAYMENT', 'SETTLEMENT_PAYOUT', 'PROCESSOR_FEE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentTransactionCandidateStatus" AS ENUM ('PENDING_REVIEW', 'READY_TO_RECONCILE', 'RECONCILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentTaxSuggestionSource" AS ENUM ('NONE', 'INVOICE', 'PAYMENT_ACTIVITY', 'SETTLEMENT_RULE');

-- CreateTable
CREATE TABLE "PaymentProviderConnection" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "provider" "PaymentIntegrationProvider" NOT NULL,
    "status" "PaymentProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "defaultClientBusinessId" INTEGER,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoCreateCandidates" BOOLEAN NOT NULL DEFAULT true,
    "settlementSyncWindowDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "metadata" JSONB,
    "lastWebhookAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncCompletedAt" TIMESTAMP(3),
    "lastSettlementSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "paymentId" INTEGER,
    "provider" "PaymentIntegrationProvider" NOT NULL,
    "eventType" "PaymentGatewayEventType" NOT NULL,
    "status" "PaymentGatewayEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "dedupeKey" TEXT NOT NULL,
    "externalEventId" TEXT,
    "reference" TEXT,
    "amountMinor" INTEGER,
    "feesAmountMinor" INTEGER,
    "netAmountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSettlement" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "provider" "PaymentIntegrationProvider" NOT NULL,
    "externalSettlementId" TEXT NOT NULL,
    "status" "PaymentSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "settlementDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "grossAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "feesAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "netAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "bankCode" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumberMasked" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransactionCandidate" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "invoiceId" INTEGER,
    "suggestedInvoiceId" INTEGER,
    "paymentId" INTEGER,
    "bankTransactionId" INTEGER,
    "suggestedBankTransactionId" INTEGER,
    "sourceEventId" INTEGER,
    "sourceSettlementId" INTEGER,
    "provider" "PaymentIntegrationProvider" NOT NULL,
    "kind" "PaymentTransactionCandidateKind" NOT NULL,
    "status" "PaymentTransactionCandidateStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "externalReference" TEXT,
    "description" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "feesAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "netAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedVatTreatment" "VatTreatment" NOT NULL DEFAULT 'NONE',
    "suggestedWhtTreatment" "WhtTreatment" NOT NULL DEFAULT 'NONE',
    "taxSuggestionSource" "PaymentTaxSuggestionSource" NOT NULL DEFAULT 'NONE',
    "taxSuggestionReason" TEXT,
    "invoiceMatchScore" DOUBLE PRECISION,
    "bankMatchScore" DOUBLE PRECISION,
    "reconciliationReason" TEXT,
    "metadata" JSONB,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransactionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConnection_workspaceId_provider_key" ON "PaymentProviderConnection"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "PaymentProviderConnection_workspaceId_status_provider_idx" ON "PaymentProviderConnection"("workspaceId", "status", "provider");

-- CreateIndex
CREATE INDEX "PaymentProviderConnection_defaultClientBusinessId_idx" ON "PaymentProviderConnection"("defaultClientBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderEvent_connectionId_dedupeKey_key" ON "PaymentProviderEvent"("connectionId", "dedupeKey");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_workspaceId_status_occurredAt_idx" ON "PaymentProviderEvent"("workspaceId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_connectionId_eventType_occurredAt_idx" ON "PaymentProviderEvent"("connectionId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_invoiceId_idx" ON "PaymentProviderEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_paymentId_idx" ON "PaymentProviderEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_reference_idx" ON "PaymentProviderEvent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_connectionId_externalSettlementId_key" ON "PaymentSettlement"("connectionId", "externalSettlementId");

-- CreateIndex
CREATE INDEX "PaymentSettlement_workspaceId_status_settlementDate_idx" ON "PaymentSettlement"("workspaceId", "status", "settlementDate");

-- CreateIndex
CREATE INDEX "PaymentSettlement_connectionId_settlementDate_idx" ON "PaymentSettlement"("connectionId", "settlementDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransactionCandidate_sourceEventId_key" ON "PaymentTransactionCandidate"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransactionCandidate_sourceSettlementId_key" ON "PaymentTransactionCandidate"("sourceSettlementId");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_workspaceId_status_occurredAt_idx" ON "PaymentTransactionCandidate"("workspaceId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_connectionId_kind_status_idx" ON "PaymentTransactionCandidate"("connectionId", "kind", "status");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_workspaceId_externalReference_idx" ON "PaymentTransactionCandidate"("workspaceId", "externalReference");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_clientBusinessId_occurredAt_idx" ON "PaymentTransactionCandidate"("clientBusinessId", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_invoiceId_idx" ON "PaymentTransactionCandidate"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_suggestedInvoiceId_idx" ON "PaymentTransactionCandidate"("suggestedInvoiceId");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_bankTransactionId_idx" ON "PaymentTransactionCandidate"("bankTransactionId");

-- CreateIndex
CREATE INDEX "PaymentTransactionCandidate_suggestedBankTransactionId_idx" ON "PaymentTransactionCandidate"("suggestedBankTransactionId");

-- AddForeignKey
ALTER TABLE "PaymentProviderConnection" ADD CONSTRAINT "PaymentProviderConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderConnection" ADD CONSTRAINT "PaymentProviderConnection_defaultClientBusinessId_fkey" FOREIGN KEY ("defaultClientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSettlement" ADD CONSTRAINT "PaymentSettlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSettlement" ADD CONSTRAINT "PaymentSettlement_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_suggestedInvoiceId_fkey" FOREIGN KEY ("suggestedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_suggestedBankTransactionI_fkey" FOREIGN KEY ("suggestedBankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "PaymentProviderEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransactionCandidate" ADD CONSTRAINT "PaymentTransactionCandidate_sourceSettlementId_fkey" FOREIGN KEY ("sourceSettlementId") REFERENCES "PaymentSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
