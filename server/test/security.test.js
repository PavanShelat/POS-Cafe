import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidRazorpayPaymentSignature, isValidRazorpayWebhookSignature, safeEqual } from "../security.js";

const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("short", "a much longer value")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("isValidRazorpayPaymentSignature", () => {
  const keySecret = "rzp_secret";
  const signature = hmac(keySecret, "order_1|pay_1");

  it("accepts Razorpay's checkout signature", () => {
    expect(isValidRazorpayPaymentSignature({ keySecret, razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature })).toBe(true);
  });

  it("rejects a signature for a different payment or order", () => {
    expect(isValidRazorpayPaymentSignature({ keySecret, razorpayOrderId: "order_1", razorpayPaymentId: "pay_2", signature })).toBe(false);
    expect(isValidRazorpayPaymentSignature({ keySecret, razorpayOrderId: "order_2", razorpayPaymentId: "pay_1", signature })).toBe(false);
  });

  it("rejects missing values", () => {
    expect(isValidRazorpayPaymentSignature({ keySecret, razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "" })).toBe(false);
    expect(isValidRazorpayPaymentSignature({ keySecret: "", razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature })).toBe(false);
  });
});

describe("isValidRazorpayWebhookSignature", () => {
  const secret = "whsec";
  const rawBody = Buffer.from('{"event":"payment.captured"}');

  it("accepts a signature over the exact raw body", () => {
    expect(isValidRazorpayWebhookSignature({ secret, rawBody, signature: hmac(secret, rawBody) })).toBe(true);
  });

  it("rejects a signature over a re-serialised body", () => {
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(rawBody.toString()), null, 1));
    expect(isValidRazorpayWebhookSignature({ secret, rawBody, signature: hmac(secret, reserialised) })).toBe(false);
  });

  it("rejects requests with no raw body", () => {
    expect(isValidRazorpayWebhookSignature({ secret, rawBody: undefined, signature: hmac(secret, "") })).toBe(false);
    expect(isValidRazorpayWebhookSignature({ secret, rawBody: Buffer.alloc(0), signature: hmac(secret, "") })).toBe(false);
  });
});
