PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkspaceSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "status" TEXT,
    "paystackCustomerCode" TEXT,
    "paystackSubscriptionCode" TEXT,
    "paystackSubscriptionToken" TEXT,
    "paystackPlanCode" TEXT,
    "paystackReference" TEXT,
    "currentPeriodEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_WorkspaceSubscription" (
    "id",
    "workspaceId",
    "plan",
    "status",
    "paystackCustomerCode",
    "paystackSubscriptionCode",
    "paystackSubscriptionToken",
    "paystackPlanCode",
    "paystackReference",
    "currentPeriodEnd",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    CASE
        WHEN UPPER(COALESCE("plan", '')) IN ('FREE', 'STARTER') THEN 'STARTER'
        WHEN UPPER(COALESCE("plan", '')) = 'GROWTH' THEN 'GROWTH'
        WHEN UPPER(COALESCE("plan", '')) IN ('BUSINESS', 'PRO', 'PROFESSIONAL') THEN 'PROFESSIONAL'
        WHEN UPPER(COALESCE("plan", '')) IN ('ACCOUNTANT', 'TEAM', 'ENTERPRISE') THEN 'ENTERPRISE'
        WHEN TRIM(COALESCE("plan", '')) = '' THEN 'STARTER'
        ELSE 'ENTERPRISE'
    END,
    CASE
        WHEN ("status" IS NULL OR TRIM("status") = '') AND UPPER(COALESCE("plan", '')) IN ('FREE', 'STARTER') THEN 'free'
        WHEN "status" IS NULL OR TRIM("status") = '' THEN 'active'
        ELSE "status"
    END,
    "paystackCustomerCode",
    "paystackSubscriptionCode",
    "paystackSubscriptionToken",
    "paystackPlanCode",
    "paystackReference",
    "currentPeriodEnd",
    "createdAt",
    "updatedAt"
FROM "WorkspaceSubscription";

DROP TABLE "WorkspaceSubscription";
ALTER TABLE "new_WorkspaceSubscription" RENAME TO "WorkspaceSubscription";

CREATE UNIQUE INDEX "WorkspaceSubscription_workspaceId_key" ON "WorkspaceSubscription"("workspaceId");
CREATE INDEX "WorkspaceSubscription_workspaceId_idx" ON "WorkspaceSubscription"("workspaceId");
CREATE INDEX "WorkspaceSubscription_paystackCustomerCode_idx" ON "WorkspaceSubscription"("paystackCustomerCode");
CREATE INDEX "WorkspaceSubscription_paystackSubscriptionCode_idx" ON "WorkspaceSubscription"("paystackSubscriptionCode");
CREATE INDEX "WorkspaceSubscription_paystackReference_idx" ON "WorkspaceSubscription"("paystackReference");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
