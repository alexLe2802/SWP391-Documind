UPDATE "documents"
SET
  "moderation_status" = 'APPROVED',
  "rejection_reason" = NULL,
  "reviewed_at" = NULL,
  "reviewed_by" = NULL
WHERE
  "visibility" = 'PRIVATE'
  AND "moderation_status" <> 'APPROVED';
