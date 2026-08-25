ALTER TABLE "document_contents"
ADD COLUMN "job_id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "error_code" TEXT,
ADD COLUMN "error_message" TEXT;

CREATE UNIQUE INDEX "document_contents_job_id_key"
ON "document_contents"("job_id");
