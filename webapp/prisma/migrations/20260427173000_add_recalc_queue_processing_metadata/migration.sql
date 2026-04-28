ALTER TABLE "RecalcQueue"
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "errorMessage" TEXT;
