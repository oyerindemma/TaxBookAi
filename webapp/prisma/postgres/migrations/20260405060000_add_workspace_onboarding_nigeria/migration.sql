CREATE TYPE "WorkspaceOnboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "OnboardingUserType" AS ENUM ('SME_OWNER', 'ACCOUNTANT', 'FINANCE_OPERATOR');
CREATE TYPE "TaxApplicability" AS ENUM ('YES', 'NO', 'NOT_SURE');
CREATE TYPE "MultiBusinessNeed" AS ENUM (
  'SINGLE_BUSINESS',
  'MULTI_BUSINESS',
  'ACCOUNTANT_PORTFOLIO'
);

CREATE TABLE "WorkspaceOnboarding" (
  "id" SERIAL NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "status" "WorkspaceOnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "userType" "OnboardingUserType",
  "businessName" TEXT,
  "businessType" TEXT,
  "industry" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Nigeria',
  "state" TEXT,
  "taxIdentificationNumber" TEXT,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
  "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
  "vatApplicability" "TaxApplicability",
  "whtApplicability" "TaxApplicability",
  "multiBusinessNeed" "MultiBusinessNeed",
  "currentStep" TEXT,
  "draftSavedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceOnboarding_workspaceId_key"
  ON "WorkspaceOnboarding"("workspaceId");

CREATE INDEX "WorkspaceOnboarding_status_idx"
  ON "WorkspaceOnboarding"("status");

CREATE INDEX "WorkspaceOnboarding_completedAt_idx"
  ON "WorkspaceOnboarding"("completedAt");

ALTER TABLE "WorkspaceOnboarding"
  ADD CONSTRAINT "WorkspaceOnboarding_workspaceId_fkey"
  FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
