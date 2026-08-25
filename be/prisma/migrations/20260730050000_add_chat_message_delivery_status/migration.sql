ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "interruption_reason" TEXT;
