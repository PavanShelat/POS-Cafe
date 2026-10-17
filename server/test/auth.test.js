import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { authHeader, ids, resetMocks } from "./mocks.js";

vi.mock("../prisma.js", async () => ({ prisma: (await import("./mocks.js")).prismaMock }));
vi.mock("@supabase/supabase-js", async () => {
  const { supabaseMock } = await import("./mocks.js");
  return { createClient: () => supabaseMock };
});

beforeEach(() => {
  resetMocks();
  // Allowed requests reach handlers whose mocked data is empty; the resulting
  // server-side error logs are irrelevant to these permission checks.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ADMIN = ["admin"];
const CASHIER = ["admin", "cashier"];
const STAFF = ["admin", "cashier", "kitchen"];

// SEC-1: every staff route and the roles allowed to call it (FIXES.md table).
const ROUTES = [
  ["get", "/api/bootstrap", STAFF],
  ["get", "/api/orders", STAFF],
  ["get", "/api/tables", CASHIER],
  ["post", "/api/products", ADMIN],
  ["post", "/api/products/import", ADMIN],
  ["put", `/api/products/${ids.product}`, ADMIN],
  ["delete", `/api/products/${ids.product}`, ADMIN],
  ["post", "/api/floors", ADMIN],
  ["put", `/api/floors/${ids.floor}`, ADMIN],
  ["delete", `/api/floors/${ids.floor}`, ADMIN],
  ["post", "/api/tables", ADMIN],
  ["put", `/api/tables/${ids.table}`, ADMIN],
  ["delete", `/api/tables/${ids.table}`, ADMIN],
  ["put", "/api/config", ADMIN],
  ["post", `/api/tables/${ids.table}/open-customer-session`, CASHIER],
  ["post", `/api/tables/${ids.table}/close-customer-session`, CASHIER],
  ["patch", `/api/tables/${ids.table}/status`, CASHIER],
  ["post", `/api/tables/${ids.table}/release`, CASHIER],
  ["put", `/api/orders/${ids.order}`, CASHIER],
  ["delete", `/api/orders/${ids.order}`, CASHIER],
  ["patch", `/api/orders/${ids.order}/confirm`, CASHIER],
  ["patch", `/api/orders/${ids.order}/reject`, CASHIER],
  ["patch", `/api/orders/${ids.order}/kitchen-status`, STAFF],
  ["post", "/api/sessions/open", CASHIER],
  ["post", "/api/sessions/close", CASHIER],
  ["get", `/api/orders/${ids.order}/invoice`, CASHIER],
  ["post", "/api/reports/chat", ADMIN],
  ["get", "/api/reports/gst?start_date=2026-10-01&end_date=2026-10-17", ADMIN],
  ["get", "/api/reports/gst/export?start_date=2026-10-01&end_date=2026-10-17", ADMIN],
  ["post", "/api/manage-staff", ADMIN],
];

describe.each(ROUTES)("%s %s", (method, path, allowedRoles) => {
  it("returns 401 without a token", async () => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app)[method](path).set("Authorization", "Bearer forged").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for a login with no staff role", async () => {
    const res = await request(app)[method](path).set(authHeader("none")).send({});
    expect(res.status).toBe(403);
  });

  for (const role of ["admin", "cashier", "kitchen"]) {
    const allowed = allowedRoles.includes(role);
    it(`${allowed ? "lets in" : "returns 403 for"} ${role}`, async () => {
      const res = await request(app)[method](path).set(authHeader(role)).send({});
      if (allowed) {
        expect([401, 403]).not.toContain(res.status);
      } else {
        expect(res.status).toBe(403);
      }
    });
  }
});

describe("POST /api/orders with source pos", () => {
  const body = { table_id: ids.table, source: "pos", items: [{ product_id: ids.product, quantity: 1 }] };

  it("needs a login", async () => {
    expect((await request(app).post("/api/orders").send(body)).status).toBe(401);
  });

  it("is refused for the kitchen role", async () => {
    expect((await request(app).post("/api/orders").set(authHeader("kitchen")).send(body)).status).toBe(403);
  });
});

describe("routes that stay public", () => {
  it.each([
    ["/api/health"],
    ["/api/products"],
    ["/api/floors"],
    ["/api/config"],
  ])("GET %s works without a token", async (path) => {
    expect((await request(app).get(path)).status).toBe(200);
  });
});

describe("security headers", () => {
  it("sets helmet's headers on API responses", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
