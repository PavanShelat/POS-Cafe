-- One Razorpay payment can only complete one payment row.
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");
