ALTER TABLE "Workspace"
ADD COLUMN "needsRecalculation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BankTransaction"
ADD COLUMN "lockedAt" TIMESTAMP(3);

UPDATE "BankTransaction"
SET "lockedAt" = "updatedAt"
WHERE "locked" = true AND "lockedAt" IS NULL;
