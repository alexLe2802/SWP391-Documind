CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ModerationFlag" AS ENUM ('NORMAL', 'FLAGGED', 'SCAN_FAILED');

ALTER TABLE "documents"
ADD COLUMN "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "moderation_flag" "ModerationFlag" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "moderation_priority" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "matched_keywords" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "matched_contexts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "reviewed_by" UUID,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "documents"
SET "moderation_status" = 'APPROVED', "reviewed_at" = "created_at"
WHERE "status" = 'ACTIVE';

CREATE INDEX "documents_moderation_status_moderation_priority_submitted_at_idx"
ON "documents"("moderation_status", "moderation_priority", "submitted_at");
