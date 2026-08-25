-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "documents_moderation_status_moderation_priority_submitted_at_id" RENAME TO "documents_moderation_status_moderation_priority_submitted_a_idx";
