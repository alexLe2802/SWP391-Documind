DROP INDEX IF EXISTS "subjects_code_key";
DROP INDEX IF EXISTS "categories_name_key";

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "owner_id" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "owner_id" UUID,
  ADD COLUMN IF NOT EXISTS "subject_id" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

UPDATE "categories" c
SET
  "owner_id" = picked."owner_id",
  "subject_id" = picked."subject_id"
FROM (
  SELECT DISTINCT ON ("category_id") "category_id", "owner_id", "subject_id"
  FROM "documents"
  WHERE "status" <> 'DELETED'
  ORDER BY "category_id", "created_at" ASC
) picked
WHERE c."id" = picked."category_id"
  AND c."owner_id" IS NULL;

UPDATE "subjects" s
SET "owner_id" = picked."owner_id"
FROM (
  SELECT DISTINCT ON ("subject_id") "subject_id", "owner_id"
  FROM "documents"
  WHERE "status" <> 'DELETED'
  ORDER BY "subject_id", "created_at" ASC
) picked
WHERE s."id" = picked."subject_id"
  AND s."owner_id" IS NULL;

ALTER TABLE "subjects"
  ADD CONSTRAINT "subjects_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_owner_id_code_key" ON "subjects"("owner_id", "code");
CREATE INDEX IF NOT EXISTS "subjects_owner_id_deleted_at_idx" ON "subjects"("owner_id", "deleted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_owner_id_subject_id_name_key" ON "categories"("owner_id", "subject_id", "name");
CREATE INDEX IF NOT EXISTS "categories_owner_id_deleted_at_idx" ON "categories"("owner_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "categories_subject_id_idx" ON "categories"("subject_id");
