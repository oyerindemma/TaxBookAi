CREATE TABLE "TaxSnapshot" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER,
    "period" TEXT NOT NULL,
    "totalIncome" DOUBLE PRECISION NOT NULL,
    "totalExpense" DOUBLE PRECISION NOT NULL,
    "taxPayable" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxSnapshot_userId_createdAt_idx" ON "TaxSnapshot"("userId", "createdAt");
CREATE INDEX "TaxSnapshot_workspaceId_createdAt_idx" ON "TaxSnapshot"("workspaceId", "createdAt");
CREATE INDEX "TaxSnapshot_userId_period_createdAt_idx" ON "TaxSnapshot"("userId", "period", "createdAt");

ALTER TABLE "TaxSnapshot" ADD CONSTRAINT "TaxSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxSnapshot" ADD CONSTRAINT "TaxSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
