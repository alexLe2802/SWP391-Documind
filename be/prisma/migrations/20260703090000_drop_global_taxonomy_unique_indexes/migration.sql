DROP INDEX IF EXISTS "subjects_code_key";
DROP INDEX IF EXISTS "categories_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_owner_id_code_key" ON "subjects"("owner_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_owner_id_subject_id_name_key" ON "categories"("owner_id", "subject_id", "name");
