ALTER TABLE "payments"
ADD COLUMN "provider" TEXT,
ADD COLUMN "provider_order_id" TEXT,
ADD COLUMN "provider_payment_id" TEXT,
ADD COLUMN "provider_signature" TEXT;

CREATE INDEX IF NOT EXISTS "payments_provider_order_id_idx" ON "payments" ("provider_order_id");

