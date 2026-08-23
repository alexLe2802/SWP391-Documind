ALTER TABLE "chat_sources"
ADD COLUMN IF NOT EXISTS "document_chunk_id" UUID,
ADD COLUMN IF NOT EXISTS "chunk_index" INTEGER,
ADD COLUMN IF NOT EXISTS "source_passage" TEXT;

CREATE INDEX IF NOT EXISTS "chat_sources_document_chunk_id_idx"
ON "chat_sources"("document_chunk_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_sources_document_chunk_id_fkey'
  ) THEN
    ALTER TABLE "chat_sources"
    ADD CONSTRAINT "chat_sources_document_chunk_id_fkey"
    FOREIGN KEY ("document_chunk_id") REFERENCES "document_chunks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
