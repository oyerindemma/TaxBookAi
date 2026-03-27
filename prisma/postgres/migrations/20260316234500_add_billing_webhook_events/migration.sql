CREATE TABLE "BillingWebhookEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "workspaceId" INTEGER,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "reference" TEXT,
    "subscriptionCode" TEXT,
    "customerCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "payload" TEXT,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingWebhookEvent_eventKey_key" ON "BillingWebhookEvent"("eventKey");
CREATE INDEX "BillingWebhookEvent_workspaceId_createdAt_idx" ON "BillingWebhookEvent"("workspaceId", "createdAt");
CREATE INDEX "BillingWebhookEvent_eventType_createdAt_idx" ON "BillingWebhookEvent"("eventType", "createdAt");
CREATE INDEX "BillingWebhookEvent_status_createdAt_idx" ON "BillingWebhookEvent"("status", "createdAt");
CREATE INDEX "BillingWebhookEvent_reference_idx" ON "BillingWebhookEvent"("reference");
CREATE INDEX "BillingWebhookEvent_subscriptionCode_idx" ON "BillingWebhookEvent"("subscriptionCode");
CREATE INDEX "BillingWebhookEvent_customerCode_idx" ON "BillingWebhookEvent"("customerCode");

ALTER TABLE "BillingWebhookEvent"
ADD CONSTRAINT "BillingWebhookEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
