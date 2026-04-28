ALTER TABLE "TaxSnapshot"
ADD COLUMN "version" INTEGER,
ADD COLUMN "taxableProfit" REAL NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "workspaceId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "nextVersion"
  FROM "TaxSnapshot"
)
UPDATE "TaxSnapshot"
SET "version" = numbered."nextVersion"
FROM numbered
WHERE "TaxSnapshot"."id" = numbered."id";

UPDATE "TaxSnapshot"
SET
  "taxableProfit" = GREATEST("totalIncome" - "totalExpense", 0),
  "status" = CASE
    WHEN "status" IN ('complete', 'completed') THEN 'completed'
    WHEN "status" = 'failed' THEN 'failed'
    WHEN "status" = 'pending' THEN 'pending'
    ELSE 'completed'
  END;

ALTER TABLE "TaxSnapshot"
ALTER COLUMN "version" SET NOT NULL,
ALTER COLUMN "version" SET DEFAULT 1;

CREATE UNIQUE INDEX "TaxSnapshot_userId_workspaceId_version_key"
ON "TaxSnapshot"("userId", "workspaceId", "version");
