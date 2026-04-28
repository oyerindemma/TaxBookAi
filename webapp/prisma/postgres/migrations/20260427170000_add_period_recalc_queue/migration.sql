ALTER TABLE "TaxSnapshot"
ADD COLUMN "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "periodEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "periodKey" TEXT NOT NULL DEFAULT '';

UPDATE "TaxSnapshot"
SET
  "periodKey" = COALESCE(NULLIF("period", ''), TO_CHAR("createdAt", 'YYYY-MM')),
  "periodStart" = DATE_TRUNC('month', "createdAt"),
  "periodEnd" = DATE_TRUNC('month', "createdAt") + INTERVAL '1 month' - INTERVAL '1 millisecond'
WHERE "periodKey" = '';

CREATE TABLE "RecalcQueue" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "workspaceId" INTEGER,
  "periodKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecalcQueue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecalcQueue_userId_workspaceId_periodKey_key"
ON "RecalcQueue"("userId", "workspaceId", "periodKey");

CREATE INDEX "RecalcQueue_workspaceId_status_periodKey_idx"
ON "RecalcQueue"("workspaceId", "status", "periodKey");

CREATE INDEX "TaxSnapshot_userId_workspaceId_periodKey_version_idx"
ON "TaxSnapshot"("userId", "workspaceId", "periodKey", "version");

ALTER TABLE "RecalcQueue"
ADD CONSTRAINT "RecalcQueue_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecalcQueue"
ADD CONSTRAINT "RecalcQueue_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
