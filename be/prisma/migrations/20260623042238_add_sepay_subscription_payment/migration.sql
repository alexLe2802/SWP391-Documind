DO $$
BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'SUCCESS';

DROP INDEX IF EXISTS "document_chunks_embedding_hnsw_idx";

CREATE TABLE IF NOT EXISTS "user_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transaction_code" TEXT NOT NULL,
    "payment_gateway" TEXT,
    "gateway_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_subscriptions_user_id_idx" ON "user_subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "user_subscriptions_status_idx" ON "user_subscriptions"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_transaction_code_key" ON "payments"("transaction_code");
CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments"("user_id");
CREATE INDEX IF NOT EXISTS "payments_transaction_code_idx" ON "payments"("transaction_code");

DO $$
BEGIN
    ALTER TABLE "user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE "payments"
    ADD CONSTRAINT "payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;
