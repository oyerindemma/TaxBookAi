CREATE TABLE "WorkspaceOnboarding" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "workspaceId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "userType" TEXT,
  "businessName" TEXT,
  "businessType" TEXT,
  "industry" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Nigeria',
  "state" TEXT,
  "taxIdentificationNumber" TEXT,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
  "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
  "vatApplicability" TEXT,
  "whtApplicability" TEXT,
  "multiBusinessNeed" TEXT,
  "currentStep" TEXT,
  "draftSavedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkspaceOnboarding_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkspaceOnboarding_workspaceId_key"
  ON "WorkspaceOnboarding"("workspaceId");

CREATE INDEX "WorkspaceOnboarding_status_idx"
  ON "WorkspaceOnboarding"("status");

CREATE INDEX "WorkspaceOnboarding_completedAt_idx"
  ON "WorkspaceOnboarding"("completedAt");
