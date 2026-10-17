import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { authHeader, ids, makeOrder, makeProduct, makeSession, makeTable, prismaMock, resetMocks } from "./mocks.js";

vi.mock("../prisma.js", async () => ({ prisma: (await import("./mocks.js")).prismaMock }));
vi.mock("@supabase/supabase-js", async () => {
  const { supabaseMock } = await import("./mocks.js");
  return { createClient: () => supabaseMock };
});
vi.mock("../email.js", async (importOriginal) => ({
  ...(await importOriginal()),
  sendInvoiceEmailForOrder: vi.fn().mockResolvedValue({ sent: true }),
}));

function customerOrder(overrides = {}) {
  return {
    table_id: ids.table,
    source: "customer",
    customer_name: "Asha",
    customer_email: "asha@example.com",
    customer_session_token: "session-token-t1",
    items: [{ product_id: ids.product, quantity: 2 }],
    ...overrides,
  };
}

// The happy-path database state for creating an order at table T1.
function mockOrderCreation({ table = makeTable(), products = [makeProduct()] } = {}) {
  prismaMock.table.findUnique.mockResolvedValue(table);
  prismaMock.session.findFirst.mockResolvedValue(makeSession());
  prismaMock.pOSConfig.findFirst.mockResolvedValue({ restaurant_name: "Cafe", currency: "Rs ", tax_rate: 5 });
  prismaMock.product.findMany.mockResolvedValue(products);
  prismaMock.order.create.mockImplementation(async ({ data }) => ({ ...makeOrder(), ...data, items: [] }));
  prismaMock.table.update.mockImplementation(async ({ data }) => makeTable({ ...table, ...data }));
  prismaMock.session.update.mockResolvedValue(makeSession({ orders_count: 1 }));
}

beforeEach(() => resetMocks());

describe("POST /api/orders validation (SEC-3)", () => {
  it("rejects an unknown source", async () => {
    const res = await request(app).post("/api/orders").send(customerOrder({ source: "admin" }));
    expect(res.status).toBe(400);
  });

  it.each([0, -1, 1.5, 100, "2", null])("rejects quantity %s", async (quantity) => {
    mockOrderCreation();
    const res = await request(app).post("/api/orders").send(customerOrder({ items: [{ product_id: ids.product, quantity }] }));
    expect(res.status).toBe(400);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed product id", async () => {
    const res = await request(app).post("/api/orders").send(customerOrder({ items: [{ product_id: "1 OR 1=1", quantity: 1 }] }));
    expect(res.status).toBe(400);
  });

  it("rejects inactive products", async () => {
    mockOrderCreation({ products: [makeProduct({ active: false })] });
    const res = await request(app).post("/api/orders").send(customerOrder());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("rejects products that don't exist", async () => {
    mockOrderCreation({ products: [] });
    const res = await request(app).post("/api/orders").send(customerOrder());
    expect(res.status).toBe(400);
  });

  it("requires a name and a valid email", async () => {
    expect((await request(app).post("/api/orders").send(customerOrder({ customer_name: " " }))).status).toBe(400);
    expect((await request(app).post("/api/orders").send(customerOrder({ customer_email: "nope" }))).status).toBe(400);
  });
});

describe("QR customer orders (SEC-3)", () => {
  it("ignores payment_status, discount and payment_method sent by the customer", async () => {
    mockOrderCreation();
    const res = await request(app)
      .post("/api/orders")
      .send(customerOrder({ payment_status: "paid", discount: 99999, payment_method: "cash" }));

    expect(res.status).toBe(200);
    const { data } = prismaMock.order.create.mock.calls[0][0];
    expect(data.payment_status).toBe("unpaid");
    expect(data.discount).toBe(0);
    expect(data.total_amount).toBe(420);
    expect(data.payments).toBeUndefined();
  });

  it("refuses a locked table", async () => {
    mockOrderCreation({ table: makeTable({ customer_session_token: null }) });
    const res = await request(app).post("/api/orders").send(customerOrder());
    expect(res.status).toBe(403);
  });

  it("refuses a stale session token", async () => {
    mockOrderCreation();
    const res = await request(app).post("/api/orders").send(customerOrder({ customer_session_token: "old-token" }));
    expect(res.status).toBe(403);
  });

  it("doesn't hand staff data back to the customer", async () => {
    mockOrderCreation();
    const res = await request(app).post("/api/orders").send(customerOrder());
    expect(res.body.session).toBeNull();
    expect(res.body.table.customer_session_token).toBeUndefined();
    expect(res.body.table.qr_token).toBeUndefined();
  });
});

describe("second round from seated guests (FLOW-1)", () => {
  it("marks an available table as pending confirmation for the first order", async () => {
    mockOrderCreation({ table: makeTable({ status: "available" }) });
    await request(app).post("/api/orders").send(customerOrder());
    expect(prismaMock.table.update).toHaveBeenCalledWith({ where: { id: ids.table }, data: { status: "pending_confirmation" } });
  });

  it("keeps an occupied table occupied when the same guests order again", async () => {
    mockOrderCreation({ table: makeTable({ status: "occupied" }) });
    const res = await request(app).post("/api/orders").send(customerOrder());
    expect(res.status).toBe(200);
    expect(prismaMock.table.update).toHaveBeenCalledWith({ where: { id: ids.table }, data: { status: "occupied" } });
    expect(prismaMock.order.create.mock.calls[0][0].data.status).toBe("pending_confirmation");
  });
});

describe("POS orders", () => {
  it("lets a cashier record a paid order with a discount", async () => {
    mockOrderCreation();
    const res = await request(app)
      .post("/api/orders")
      .set(authHeader("cashier"))
      .send(customerOrder({ source: "pos", payment_status: "paid", payment_method: "cash", discount: 20 }));

    expect(res.status).toBe(200);
    const { data } = prismaMock.order.create.mock.calls[0][0];
    expect(data.payment_status).toBe("paid");
    expect(data.discount).toBe(20);
    expect(data.status).toBe("confirmed");
    expect(data.payments.create).toMatchObject({ method: "cash", status: "completed" });
  });

  it("rejects an unknown payment_status or payment_method", async () => {
    mockOrderCreation();
    const badStatus = await request(app).post("/api/orders").set(authHeader("cashier")).send(customerOrder({ source: "pos", payment_status: "free" }));
    const badMethod = await request(app).post("/api/orders").set(authHeader("cashier")).send(customerOrder({ source: "pos", payment_method: "crypto" }));
    expect(badStatus.status).toBe(400);
    expect(badMethod.status).toBe(400);
  });
});

describe("rejecting an order", () => {
  it("frees a table whose only order was rejected", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder());
    prismaMock.order.update.mockResolvedValue(makeOrder({ status: "cancelled" }));
    prismaMock.table.findUnique.mockResolvedValue(makeTable({ status: "pending_confirmation" }));
    prismaMock.table.update.mockResolvedValue(makeTable({ status: "available" }));

    const res = await request(app).patch(`/api/orders/${ids.order}/reject`).set(authHeader("cashier"));

    expect(res.status).toBe(200);
    expect(prismaMock.table.update).toHaveBeenCalledWith({ where: { id: ids.table }, data: { status: "available" } });
  });

  it("leaves an occupied table alone when a second round is rejected (FLOW-1)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder());
    prismaMock.order.update.mockResolvedValue(makeOrder({ status: "cancelled" }));
    prismaMock.table.findUnique.mockResolvedValue(makeTable({ status: "occupied" }));

    await request(app).patch(`/api/orders/${ids.order}/reject`).set(authHeader("cashier"));

    expect(prismaMock.table.update).not.toHaveBeenCalled();
  });

  it("doesn't touch the session's stored sales figure (DATA-1)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ payment_status: "paid", status: "confirmed" }));
    prismaMock.order.update.mockResolvedValue(makeOrder({ status: "cancelled" }));
    prismaMock.table.findUnique.mockResolvedValue(makeTable({ status: "occupied" }));

    await request(app).patch(`/api/orders/${ids.order}/reject`).set(authHeader("cashier"));

    expect(prismaMock.session.update).not.toHaveBeenCalled();
  });
});

describe("session sales totals (DATA-1)", () => {
  it("computes total_sales from paid, non-cancelled orders", async () => {
    prismaMock.session.findFirst.mockResolvedValue(makeSession({ total_sales: 99999 }));
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total_amount: 630.5 } });

    const res = await request(app).get("/api/bootstrap").set(authHeader("cashier"));

    expect(res.body.session.total_sales).toBe(630.5);
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: { session_id: ids.session, payment_status: "paid", status: { not: "cancelled" } },
      _sum: { total_amount: true },
    });
  });

  it("deletes an order and its rows in one transaction", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ payment_status: "paid" }));

    const res = await request(app).delete(`/api/orders/${ids.order}`).set(authHeader("admin"));

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(Array.isArray(prismaMock.$transaction.mock.calls[0][0])).toBe(true);
    expect(prismaMock.session.update).toHaveBeenCalledWith({ where: { id: ids.session }, data: { orders_count: { decrement: 1 } } });
  });
});

describe("GET /api/bootstrap (DATA-3, P3)", () => {
  it("never writes to the database", async () => {
    await request(app).get("/api/bootstrap").set(authHeader("kitchen"));
    for (const model of ["category", "product", "floor", "table", "session", "pOSConfig"]) {
      expect(prismaMock[model].create).not.toHaveBeenCalled();
      expect(prismaMock[model].createMany).not.toHaveBeenCalled();
    }
  });

  it("only loads the last year of orders", async () => {
    await request(app).get("/api/bootstrap").set(authHeader("cashier"));
    const { where } = prismaMock.order.findMany.mock.calls[0][0];
    const daysBack = (Date.now() - where.created_at.gte.getTime()) / 86400000;
    expect(daysBack).toBeGreaterThan(365);
    expect(daysBack).toBeLessThan(368);
  });
});

describe("enum validation (P2)", () => {
  it("rejects an unknown kitchen status with 400", async () => {
    const res = await request(app).patch(`/api/orders/${ids.order}/kitchen-status`).set(authHeader("kitchen")).send({ status: "burnt" });
    expect(res.status).toBe(400);
  });

  it("rejects unknown order fields on update with 400", async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder());
    const res = await request(app).put(`/api/orders/${ids.order}`).set(authHeader("cashier")).send({ status: "lost" });
    expect(res.status).toBe(400);
  });

  it("returns 404, not 500, when Prisma can't find the record", async () => {
    prismaMock.product.update.mockRejectedValue(Object.assign(new Error("Record to update not found."), { code: "P2025" }));
    const res = await request(app).put(`/api/products/${ids.product}`).set(authHeader("admin")).send({ name: "X" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Record not found");
  });
});
