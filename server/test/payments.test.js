import crypto from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { sendInvoiceEmailForOrder } from "../email.js";
import { razorpayRequestJson } from "../razorpay.js";
import { ids, makeOrder, makeTable, prismaMock, resetMocks } from "./mocks.js";

vi.mock("../prisma.js", async () => ({ prisma: (await import("./mocks.js")).prismaMock }));
vi.mock("@supabase/supabase-js", async () => {
  const { supabaseMock } = await import("./mocks.js");
  return { createClient: () => supabaseMock };
});
vi.mock("../email.js", async (importOriginal) => ({
  ...(await importOriginal()),
  sendInvoiceEmailForOrder: vi.fn(),
}));
vi.mock("../razorpay.js", async (importOriginal) => ({
  ...(await importOriginal()),
  razorpayRequestJson: vi.fn(),
}));

const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");

function pendingPayment(overrides = {}) {
  return {
    id: ids.payment,
    order_id: ids.order,
    method: "upi",
    amount: 210,
    status: "pending",
    provider: "razorpay",
    provider_order_id: "order_rzp_1",
    provider_payment_id: null,
    provider_signature: null,
    ...overrides,
  };
}

function checkoutResponse(paymentId = "pay_1", orderId = "order_rzp_1") {
  return {
    orderId: ids.order,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`),
  };
}

beforeEach(() => {
  resetMocks();
  sendInvoiceEmailForOrder.mockReset().mockResolvedValue({ sent: true });
  razorpayRequestJson.mockReset().mockResolvedValue({ id: "order_rzp_new" });
  prismaMock.order.findUnique.mockResolvedValue(makeOrder());
  prismaMock.table.findUnique.mockResolvedValue(makeTable());
});

describe("POST /api/payments/razorpay/order", () => {
  const body = { orderId: ids.order, payment_method: "upi", customer_session_token: "session-token-t1" };

  it("creates a Razorpay order for the order's server-side total", async () => {
    const res = await request(app).post("/api/payments/razorpay/order").send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ razorpayOrderId: "order_rzp_new", amountPaise: 21000, keyId: "rzp_test_key" });
    expect(razorpayRequestJson.mock.calls[0][0].body.amount).toBe(21000);
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ method: "upi", status: "pending", provider_order_id: "order_rzp_new" }),
    });
  });

  it("locks the order row so concurrent clicks queue up (DATA-5)", async () => {
    await request(app).post("/api/payments/razorpay/order").send(body);
    const [sqlParts] = prismaMock.$queryRaw.mock.calls[0];
    expect(sqlParts.join("?")).toMatch(/FOR UPDATE/);
  });

  it("reuses the pending Razorpay order for the same method and amount (DATA-5)", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(pendingPayment());

    const res = await request(app).post("/api/payments/razorpay/order").send(body);

    expect(res.body.razorpayOrderId).toBe("order_rzp_1");
    expect(razorpayRequestJson).not.toHaveBeenCalled();
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it("retires the old attempt and starts a new one when the method changes (FLOW-3)", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(pendingPayment({ method: "upi" }));

    const res = await request(app).post("/api/payments/razorpay/order").send({ ...body, payment_method: "digital" });

    expect(res.status).toBe(200);
    expect(res.body.razorpayOrderId).toBe("order_rzp_new");
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { order_id: ids.order, provider: "razorpay", status: "pending" },
      data: { status: "failed" },
    });
    expect(prismaMock.payment.create.mock.calls[0][0].data.method).toBe("digital");
  });

  it("starts a new attempt when the order total changed", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(pendingPayment({ amount: 100 }));
    const res = await request(app).post("/api/payments/razorpay/order").send(body);
    expect(res.body.razorpayOrderId).toBe("order_rzp_new");
  });

  it("needs a valid table session for QR orders", async () => {
    const res = await request(app).post("/api/payments/razorpay/order").send({ ...body, customer_session_token: "old" });
    expect(res.status).toBe(403);
    expect(razorpayRequestJson).not.toHaveBeenCalled();
  });

  it("refuses paid and cancelled orders", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ payment_status: "paid" }));
    expect((await request(app).post("/api/payments/razorpay/order").send(body)).status).toBe(400);
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ status: "cancelled" }));
    expect((await request(app).post("/api/payments/razorpay/order").send(body)).status).toBe(400);
  });

  it("passes on a Razorpay timeout as a readable error", async () => {
    razorpayRequestJson.mockRejectedValue(Object.assign(new Error("Razorpay did not respond in time. Please try again."), { status: 504 }));
    const res = await request(app).post("/api/payments/razorpay/order").send(body);
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/did not respond/);
  });
});

describe("POST /api/payments/razorpay/verify", () => {
  beforeEach(() => {
    prismaMock.payment.findFirst.mockResolvedValue(pendingPayment());
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks the order paid and emails the invoice", async () => {
    const res = await request(app).post("/api/payments/razorpay/verify").send(checkoutResponse());

    expect(res.status).toBe(200);
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: ids.order, payment_status: "unpaid" },
      data: { payment_status: "paid" },
    });
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: ids.payment },
      data: expect.objectContaining({ status: "completed", provider_payment_id: "pay_1" }),
    });
    expect(sendInvoiceEmailForOrder).toHaveBeenCalledTimes(1);
    expect(res.body.order.customer_email).toBeUndefined();
  });

  it("sends a paid QR order to the POS: the table starts waiting for confirmation", async () => {
    await request(app).post("/api/payments/razorpay/verify").send(checkoutResponse());

    // Only an available table changes; an occupied one (second round) stays occupied.
    expect(prismaMock.table.updateMany).toHaveBeenCalledWith({
      where: { id: ids.table, status: "available" },
      data: { status: "pending_confirmation" },
    });
    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: ids.session },
      data: { orders_count: { increment: 1 } },
    });
  });

  it("doesn't touch the table for a staff order paid by QR", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ source: "pos", status: "confirmed", created_at: new Date() }));
    await request(app).post("/api/payments/razorpay/verify").send(checkoutResponse());
    expect(prismaMock.table.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a forged signature", async () => {
    const res = await request(app)
      .post("/api/payments/razorpay/verify")
      .send({ ...checkoutResponse(), razorpay_signature: "0".repeat(64) });
    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("still completes after staff lock the table mid-checkout (FLOW-5)", async () => {
    prismaMock.table.findUnique.mockResolvedValue(makeTable({ customer_session_token: null }));
    const res = await request(app).post("/api/payments/razorpay/verify").send(checkoutResponse());
    expect(res.status).toBe(200);
    expect(prismaMock.order.updateMany).toHaveBeenCalled();
  });

  it("counts a payment once when /verify arrives twice at the same time (SEC-6)", async () => {
    prismaMock.order.updateMany.mockReset().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const [first, second] = await Promise.all([
      request(app).post("/api/payments/razorpay/verify").send(checkoutResponse()),
      request(app).post("/api/payments/razorpay/verify").send(checkoutResponse()),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendInvoiceEmailForOrder).toHaveBeenCalledTimes(1);
    expect(prismaMock.table.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.session.update).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/webhooks/razorpay", () => {
  const event = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_rzp_1", status: "captured" } } },
  });
  const send = (rawBody, signature = hmac(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody)) =>
    request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature)
      .send(rawBody);

  beforeEach(() => {
    prismaMock.payment.findFirst.mockResolvedValue(pendingPayment());
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it("completes the payment for a correctly signed capture event", async () => {
    const res = await send(event);
    expect(res.status).toBe(200);
    expect(prismaMock.order.updateMany).toHaveBeenCalled();
    expect(sendInvoiceEmailForOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects a bad signature", async () => {
    const res = await send(event, "f".repeat(64));
    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a signature computed over a re-serialised body", async () => {
    const reserialised = JSON.stringify(JSON.parse(event), null, 2);
    const res = await send(event, hmac(process.env.RAZORPAY_WEBHOOK_SECRET, reserialised));
    expect(res.status).toBe(400);
  });

  it("ignores a repeat of an already completed payment", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(pendingPayment({ status: "completed" }));
    const res = await send(event);
    expect(res.status).toBe(200);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("sends one email when the webhook and /verify race (SEC-6)", async () => {
    prismaMock.order.updateMany.mockReset().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await Promise.all([send(event), request(app).post("/api/payments/razorpay/verify").send(checkoutResponse())]);

    expect(prismaMock.order.updateMany).toHaveBeenCalledTimes(2);
    expect(sendInvoiceEmailForOrder).toHaveBeenCalledTimes(1);
  });
});
