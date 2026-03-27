-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "taxIdentificationNumber" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_workspaceId_key" ON "BusinessProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "BusinessProfile_onboardingCompletedAt_idx" ON "BusinessProfile"("onboardingCompletedAt");

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
