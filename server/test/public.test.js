import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { ids, makeOrder, makeProduct, makeTable, prismaMock, resetMocks } from "./mocks.js";

vi.mock("../prisma.js", async () => ({ prisma: (await import("./mocks.js")).prismaMock }));
vi.mock("@supabase/supabase-js", async () => {
  const { supabaseMock } = await import("./mocks.js");
  return { createClient: () => supabaseMock };
});

beforeEach(() => resetMocks());

const SECRET_FIELDS = ["customer_session_token", "qr_token", "customer_email", "customer_phone"];

function expectNoSecrets(body) {
  const text = JSON.stringify(body);
  for (const field of SECRET_FIELDS) expect(text).not.toContain(`"${field}"`);
}

describe("GET /api/public/menu/:qrToken (SEC-2)", () => {
  it("returns the table, active products and config without any tokens", async () => {
    prismaMock.table.findFirst.mockResolvedValue(makeTable());
    prismaMock.product.findMany.mockResolvedValue([makeProduct()]);
    prismaMock.pOSConfig.findFirst.mockResolvedValue({ restaurant_name: "Bean & Brew", currency: "Rs ", tax_rate: 5 });

    const res = await request(app).get("/api/public/menu/qr-token-t1");

    expect(res.status).toBe(200);
    expect(res.body.table).toEqual({ id: ids.table, table_number: "T1", seats: 4, status: "available" });
    expect(res.body.products).toHaveLength(1);
    expect(res.body.config.restaurant_name).toBe("Bean & Brew");
    expectNoSecrets(res.body);
  });

  it("asks the database for active products only", async () => {
    prismaMock.table.findFirst.mockResolvedValue(makeTable());
    await request(app).get("/api/public/menu/qr-token-t1");
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
  });

  it("only finds active tables, and 404s for unknown QR codes", async () => {
    const res = await request(app).get("/api/public/menu/unknown");
    expect(res.status).toBe(404);
    expect(prismaMock.table.findFirst).toHaveBeenCalledWith({ where: { qr_token: "unknown", active: true } });
  });
});

describe("GET /api/public/orders/:id (SEC-2)", () => {
  it("strips contact details and session tokens", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...makeOrder(), table: makeTable() });

    const res = await request(app).get(`/api/public/orders/${ids.order}`);

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(ids.order);
    expect(res.body.order.customer_name).toBe("Asha");
    expectNoSecrets(res.body);
  });
});

describe("GET /api/customer/order-status/:tableToken (FLOW-4)", () => {
  beforeEach(() => prismaMock.table.findFirst.mockResolvedValue(makeTable()));

  it("returns no order when the phone sends no order id", async () => {
    const res = await request(app).get("/api/customer/order-status/qr-token-t1");
    expect(res.status).toBe(200);
    expect(res.body.order).toBeNull();
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
  });

  it("never falls back to the table's latest order", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/customer/order-status/qr-token-t1?order_id=${ids.product}`);
    expect(res.body.order).toBeNull();
    expect(prismaMock.order.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.findFirst.mock.calls[0][0].where).toEqual({ id: ids.product, table_id: ids.table, source: "customer" });
  });

  it("ignores malformed order ids", async () => {
    const res = await request(app).get("/api/customer/order-status/qr-token-t1?order_id=not-a-uuid");
    expect(res.body.order).toBeNull();
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
  });

  it("returns the phone's own order, without contact details", async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    const res = await request(app).get(`/api/customer/order-status/qr-token-t1?order_id=${ids.order}`);
    expect(res.body.order.id).toBe(ids.order);
    expectNoSecrets(res.body);
  });
});

describe("GET /api/customer/validate-session", () => {
  it("hands out the session token only while the table is unlocked", async () => {
    prismaMock.table.findFirst.mockResolvedValue(makeTable());
    const unlocked = await request(app).get("/api/customer/validate-session?qr_token=qr-token-t1");
    expect(unlocked.body).toMatchObject({ valid: true, customer_session_token: "session-token-t1" });
    expect(unlocked.body.table.qr_token).toBeUndefined();

    prismaMock.table.findFirst.mockResolvedValue(makeTable({ customer_session_token: null }));
    const locked = await request(app).get("/api/customer/validate-session?qr_token=qr-token-t1");
    expect(locked.body.valid).toBe(false);
    expectNoSecrets(locked.body);
  });
});
