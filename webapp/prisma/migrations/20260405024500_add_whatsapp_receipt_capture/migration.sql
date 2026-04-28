-- CreateEnum
CREATE TYPE "BookkeepingIngestionChannel" AS ENUM ('DIRECT_UPLOAD', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "WhatsAppReceiptProvider" AS ENUM ('GENERIC_WEBHOOK', 'META_CLOUD_API');

-- CreateEnum
CREATE TYPE "WhatsAppReceiptConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "WhatsAppReceiptMessageStatus" AS ENUM ('RECEIVED', 'IGNORED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppReceiptMediaKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- AlterTable
ALTER TABLE "BookkeepingUpload" ADD COLUMN     "ingestionChannel" "BookkeepingIngestionChannel" NOT NULL DEFAULT 'DIRECT_UPLOAD';

-- CreateTable
CREATE TABLE "WhatsAppReceiptConnection" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "defaultClientBusinessId" INTEGER,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "provider" "WhatsAppReceiptProvider" NOT NULL,
    "status" "WhatsAppReceiptConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "webhookInboxKey" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneNumber" TEXT,
    "normalizedDisplayPhoneNumber" TEXT,
    "autoProcess" BOOLEAN NOT NULL DEFAULT true,
    "metadataPayload" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastVerificationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppReceiptConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppReceiptSenderMapping" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "senderPhoneNumber" TEXT NOT NULL,
    "normalizedSenderPhoneNumber" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppReceiptSenderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppReceiptMessage" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "clientBusinessId" INTEGER,
    "senderMappingId" INTEGER,
    "bookkeepingUploadId" INTEGER,
    "provider" "WhatsAppReceiptProvider" NOT NULL,
    "status" "WhatsAppReceiptMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "mediaKind" "WhatsAppReceiptMediaKind" NOT NULL,
    "externalEventId" TEXT,
    "externalMessageId" TEXT NOT NULL,
    "externalMediaId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "senderPhoneNumber" TEXT NOT NULL,
    "normalizedSenderPhoneNumber" TEXT NOT NULL,
    "senderName" TEXT,
    "recipientPhoneNumber" TEXT,
    "normalizedRecipientPhoneNumber" TEXT,
    "phoneNumberId" TEXT,
    "caption" TEXT,
    "textBody" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "downloadUrl" TEXT,
    "mediaSha256" TEXT,
    "failureReason" TEXT,
    "processingNotes" TEXT,
    "metadataPayload" TEXT,
    "rawPayload" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppReceiptMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookkeepingUpload_workspaceId_ingestionChannel_createdAt_idx" ON "BookkeepingUpload"("workspaceId", "ingestionChannel", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptConnection_workspaceId_status_updatedAt_idx" ON "WhatsAppReceiptConnection"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptConnection_defaultClientBusinessId_idx" ON "WhatsAppReceiptConnection"("defaultClientBusinessId");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptConnection_createdByUserId_idx" ON "WhatsAppReceiptConnection"("createdByUserId");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptConnection_updatedByUserId_idx" ON "WhatsAppReceiptConnection"("updatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptConnection_provider_webhookInboxKey_key" ON "WhatsAppReceiptConnection"("provider", "webhookInboxKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptConnection_provider_phoneNumberId_key" ON "WhatsAppReceiptConnection"("provider", "phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptConnection_provider_normalizedDisplayPhoneNu_key" ON "WhatsAppReceiptConnection"("provider", "normalizedDisplayPhoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptSenderMapping_workspaceId_normalizedSenderPh_idx" ON "WhatsAppReceiptSenderMapping"("workspaceId", "normalizedSenderPhoneNumber", "active");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptSenderMapping_clientBusinessId_active_idx" ON "WhatsAppReceiptSenderMapping"("clientBusinessId", "active");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptSenderMapping_createdByUserId_idx" ON "WhatsAppReceiptSenderMapping"("createdByUserId");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptSenderMapping_updatedByUserId_idx" ON "WhatsAppReceiptSenderMapping"("updatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptSenderMapping_connectionId_normalizedSenderP_key" ON "WhatsAppReceiptSenderMapping"("connectionId", "normalizedSenderPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptMessage_bookkeepingUploadId_key" ON "WhatsAppReceiptMessage"("bookkeepingUploadId");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptMessage_workspaceId_status_receivedAt_idx" ON "WhatsAppReceiptMessage"("workspaceId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptMessage_workspaceId_normalizedSenderPhoneNum_idx" ON "WhatsAppReceiptMessage"("workspaceId", "normalizedSenderPhoneNumber", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptMessage_clientBusinessId_status_receivedAt_idx" ON "WhatsAppReceiptMessage"("clientBusinessId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceiptMessage_senderMappingId_idx" ON "WhatsAppReceiptMessage"("senderMappingId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptMessage_connectionId_dedupeKey_key" ON "WhatsAppReceiptMessage"("connectionId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptConnection" ADD CONSTRAINT "WhatsAppReceiptConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptConnection" ADD CONSTRAINT "WhatsAppReceiptConnection_defaultClientBusinessId_fkey" FOREIGN KEY ("defaultClientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptConnection" ADD CONSTRAINT "WhatsAppReceiptConnection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptConnection" ADD CONSTRAINT "WhatsAppReceiptConnection_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptSenderMapping" ADD CONSTRAINT "WhatsAppReceiptSenderMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptSenderMapping" ADD CONSTRAINT "WhatsAppReceiptSenderMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppReceiptConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptSenderMapping" ADD CONSTRAINT "WhatsAppReceiptSenderMapping_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptSenderMapping" ADD CONSTRAINT "WhatsAppReceiptSenderMapping_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptSenderMapping" ADD CONSTRAINT "WhatsAppReceiptSenderMapping_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptMessage" ADD CONSTRAINT "WhatsAppReceiptMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptMessage" ADD CONSTRAINT "WhatsAppReceiptMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppReceiptConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptMessage" ADD CONSTRAINT "WhatsAppReceiptMessage_clientBusinessId_fkey" FOREIGN KEY ("clientBusinessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptMessage" ADD CONSTRAINT "WhatsAppReceiptMessage_senderMappingId_fkey" FOREIGN KEY ("senderMappingId") REFERENCES "WhatsAppReceiptSenderMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReceiptMessage" ADD CONSTRAINT "WhatsAppReceiptMessage_bookkeepingUploadId_fkey" FOREIGN KEY ("bookkeepingUploadId") REFERENCES "BookkeepingUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
