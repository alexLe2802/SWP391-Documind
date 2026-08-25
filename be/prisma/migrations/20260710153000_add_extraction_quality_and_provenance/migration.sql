CREATE TYPE "ExtractionQuality" AS ENUM ('READY', 'PARTIAL', 'UNREADABLE');

ALTER TABLE "document_contents"
  ADD COLUMN "quality_status" "ExtractionQuality" NOT NULL DEFAULT 'READY',
  ADD COLUMN "quality_details" JSONB;

ALTER TABLE "document_chunks"
  ADD COLUMN "source_locator" JSONB;

ALTER TABLE "chat_sources"
  ADD COLUMN "source_locator" JSONB;
