CREATE TABLE "TaxSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER,
    "period" TEXT NOT NULL,
    "totalIncome" REAL NOT NULL,
    "totalExpense" REAL NOT NULL,
    "taxPayable" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TaxSnapshot_userId_createdAt_idx" ON "TaxSnapshot"("userId", "createdAt");
CREATE INDEX "TaxSnapshot_workspaceId_createdAt_idx" ON "TaxSnapshot"("workspaceId", "createdAt");
CREATE INDEX "TaxSnapshot_userId_period_createdAt_idx" ON "TaxSnapshot"("userId", "period", "createdAt");
