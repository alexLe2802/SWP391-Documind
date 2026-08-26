ALTER TABLE "notifications"
ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER INDEX "documents_moderation_status_moderation_priority_submitted_a_idx"
RENAME TO "documents_moderation_status_moderation_priority_submitted_at_id";
