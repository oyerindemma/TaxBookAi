CREATE TYPE "FilingDraftStatus_new" AS ENUM (
    'DRAFT',
    'READY_FOR_REVIEW',
    'APPROVED_FOR_SUBMISSION',
    'SUBMITTED_MANUALLY',
    'SUBMISSION_PENDING',
    'SUBMITTED',
    'FAILED',
    'CANCELLED'
);

ALTER TABLE "FilingDraft" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "FilingDraft"
    ALTER COLUMN "status" TYPE "FilingDraftStatus_new"
    USING (
        CASE
            WHEN "status"::text = 'REVIEW_READY' THEN 'READY_FOR_REVIEW'
            WHEN "status"::text = 'READY_TO_FILE' THEN 'APPROVED_FOR_SUBMISSION'
            WHEN "status"::text = 'FILED' THEN 'SUBMITTED'
            WHEN "status"::text = 'REJECTED' THEN 'FAILED'
            ELSE "status"::text
        END
    )::"FilingDraftStatus_new";

ALTER TYPE "FilingDraftStatus" RENAME TO "FilingDraftStatus_old";
ALTER TYPE "FilingDraftStatus_new" RENAME TO "FilingDraftStatus";
DROP TYPE "FilingDraftStatus_old";

ALTER TABLE "FilingDraft" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "FilingDraft"
    ADD COLUMN "reviewNote" TEXT,
    ADD COLUMN "adapterCode" TEXT NOT NULL DEFAULT 'TAXPRO_MAX',
    ADD COLUMN "adapterMode" TEXT NOT NULL DEFAULT 'PREPARE_ONLY',
    ADD COLUMN "businessTinSnapshot" TEXT,
    ADD COLUMN "portalUsernameHint" TEXT,
    ADD COLUMN "submissionReference" TEXT,
    ADD COLUMN "payloadCandidate" TEXT,
    ADD COLUMN "checklistPayload" TEXT,
    ADD COLUMN "packGeneratedAt" TIMESTAMP(3),
    ADD COLUMN "lastExportedAt" TIMESTAMP(3);
