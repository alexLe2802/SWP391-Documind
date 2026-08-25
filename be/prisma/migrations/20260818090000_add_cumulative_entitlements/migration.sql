ALTER TABLE "payment_orders"
ADD COLUMN "duration_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "storage_mb" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "upload_credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ai_credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "unlimited_ai_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "subscriptions"
ADD COLUMN "unlimited_ai_until" TIMESTAMP(3);

CREATE TABLE "entitlement_transactions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "payment_order_id" UUID NOT NULL,
  "package_code" "SubscriptionPlan" NOT NULL,
  "duration_days" INTEGER NOT NULL,
  "storage_delta_mb" INTEGER NOT NULL,
  "upload_delta" INTEGER NOT NULL,
  "ai_credit_delta" INTEGER NOT NULL,
  "unlimited_ai_days" INTEGER NOT NULL,
  "access_expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entitlement_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entitlement_transactions_payment_order_id_key"
ON "entitlement_transactions"("payment_order_id");

CREATE INDEX "entitlement_transactions_user_id_created_at_idx"
ON "entitlement_transactions"("user_id", "created_at");

ALTER TABLE "entitlement_transactions"
ADD CONSTRAINT "entitlement_transactions_payment_order_id_fkey"
FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entitlement_transactions"
ADD CONSTRAINT "entitlement_transactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
