-- Two tables sharing a QR token would share a printed QR code.
CREATE UNIQUE INDEX "tables_qr_token_key" ON "tables"("qr_token");

-- When staff last unlocked QR ordering, so the server can re-lock the table after
-- TABLE_AUTO_RELEASE_HOURS.
ALTER TABLE "tables" ADD COLUMN "customer_session_started_at" TIMESTAMP(3);
-- Tables already unlocked when this runs start their clock now.
UPDATE "tables" SET "customer_session_started_at" = CURRENT_TIMESTAMP WHERE "customer_session_token" IS NOT NULL;

-- One Razorpay order maps to exactly one payment row.
DROP INDEX IF EXISTS "payments_provider_order_id_idx";
CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");
