ALTER TABLE "FilingDraft" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "FilingDraft" ADD COLUMN "adapterCode" TEXT NOT NULL DEFAULT 'TAXPRO_MAX';
ALTER TABLE "FilingDraft" ADD COLUMN "adapterMode" TEXT NOT NULL DEFAULT 'PREPARE_ONLY';
ALTER TABLE "FilingDraft" ADD COLUMN "businessTinSnapshot" TEXT;
ALTER TABLE "FilingDraft" ADD COLUMN "portalUsernameHint" TEXT;
ALTER TABLE "FilingDraft" ADD COLUMN "submissionReference" TEXT;
ALTER TABLE "FilingDraft" ADD COLUMN "payloadCandidate" TEXT;
ALTER TABLE "FilingDraft" ADD COLUMN "checklistPayload" TEXT;
ALTER TABLE "FilingDraft" ADD COLUMN "packGeneratedAt" DATETIME;
ALTER TABLE "FilingDraft" ADD COLUMN "lastExportedAt" DATETIME;

UPDATE "FilingDraft" SET "status" = 'READY_FOR_REVIEW' WHERE "status" = 'REVIEW_READY';
UPDATE "FilingDraft" SET "status" = 'APPROVED_FOR_SUBMISSION' WHERE "status" = 'READY_TO_FILE';
UPDATE "FilingDraft" SET "status" = 'SUBMITTED' WHERE "status" = 'FILED';
UPDATE "FilingDraft" SET "status" = 'FAILED' WHERE "status" = 'REJECTED';
