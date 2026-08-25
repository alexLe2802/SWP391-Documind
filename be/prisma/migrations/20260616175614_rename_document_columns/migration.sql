-- AlterTable (Rename columns to preserve existing data)
ALTER TABLE "documents" RENAME COLUMN "file_name" TO "original_file_name";
ALTER TABLE "documents" RENAME COLUMN "file_type" TO "mime_type";
ALTER TABLE "documents" RENAME COLUMN "file_url" TO "preview_url";

-- Add new columns with default values
ALTER TABLE "documents" ADD COLUMN "download_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "documents" ADD COLUMN "save_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "documents" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "documents" ADD COLUMN "source_link" TEXT;
