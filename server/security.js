import crypto from "node:crypto";

// Constant-time string comparison. Hashing first makes the lengths equal.
function safeEqual(a, b) {
  const hashA = crypto.createHash("sha256").update(String(a)).digest();
  const hashB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hmacSha256Hex(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

// Checkout handler signature: HMAC of "<razorpay_order_id>|<razorpay_payment_id>".
function isValidRazorpayPaymentSignature({ keySecret, razorpayOrderId, razorpayPaymentId, signature }) {
  if (!keySecret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
  return safeEqual(hmacSha256Hex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`), signature);
}

// Webhook signature: HMAC of the exact bytes Razorpay sent. A re-serialised body
// can differ from the original, so a missing raw body is always a failure.
function isValidRazorpayWebhookSignature({ secret, rawBody, signature }) {
  if (!secret || !rawBody || !rawBody.length || !signature) return false;
  return safeEqual(hmacSha256Hex(secret, rawBody), signature);
}

export { isValidRazorpayPaymentSignature, isValidRazorpayWebhookSignature, safeEqual };
