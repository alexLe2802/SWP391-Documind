-- Enable pgvector before creating vector-backed columns and indexes.
CREATE EXTENSION IF NOT EXISTS vector;

-- IF NOT EXISTS keeps this migration deployable on environments where the
-- table was previously created with `prisma db push`.
CREATE TABLE IF NOT EXISTS "document_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_chunks_document_id_chunk_index_key"
    ON "document_chunks"("document_id", "chunk_index");

CREATE INDEX IF NOT EXISTS "document_chunks_document_id_idx"
    ON "document_chunks"("document_id");

CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx"
    ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'document_chunks_document_id_fkey'
    ) THEN
        ALTER TABLE "document_chunks"
            ADD CONSTRAINT "document_chunks_document_id_fkey"
            FOREIGN KEY ("document_id") REFERENCES "documents"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
