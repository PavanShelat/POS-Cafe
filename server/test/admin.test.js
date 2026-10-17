import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { authHeader, ids, makeOrder, makeTable, prismaMock, resetMocks, supabaseMock } from "./mocks.js";

vi.mock("../prisma.js", async () => ({ prisma: (await import("./mocks.js")).prismaMock }));
vi.mock("@supabase/supabase-js", async () => {
  const { supabaseMock } = await import("./mocks.js");
  return { createClient: () => supabaseMock };
});

beforeEach(() => resetMocks());

describe("POST /api/setup-admin (SEC-4)", () => {
  const body = { email: "owner@example.com", password: "secret123", full_name: "Owner", setup_secret: "let-me-in" };
  const NEW_USER_ID = "77777777-7777-4777-8777-777777777777";

  afterEach(() => {
    process.env.ADMIN_SETUP_SECRET = "";
  });

  it("is switched off when ADMIN_SETUP_SECRET is unset", async () => {
    const res = await request(app).post("/api/setup-admin").send(body);
    expect(res.status).toBe(404);
    expect(supabaseMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong or missing secret", async () => {
    process.env.ADMIN_SETUP_SECRET = "let-me-in";
    expect((await request(app).post("/api/setup-admin").send({ ...body, setup_secret: "guess" })).status).toBe(403);
    expect((await request(app).post("/api/setup-admin").send({ ...body, setup_secret: undefined })).status).toBe(403);
    expect(supabaseMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("refuses once an admin exists", async () => {
    process.env.ADMIN_SETUP_SECRET = "let-me-in";
    prismaMock.userRole.findFirst.mockResolvedValue({ role: "admin" });
    const res = await request(app).post("/api/setup-admin").send(body);
    expect(res.status).toBe(400);
    expect(supabaseMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates the first admin while holding a database lock", async () => {
    process.env.ADMIN_SETUP_SECRET = "let-me-in";
    prismaMock.userRole.findFirst.mockResolvedValue(null);
    supabaseMock.auth.admin.createUser.mockResolvedValue({ data: { user: { id: NEW_USER_ID } }, error: null });

    const res = await request(app).post("/api/setup-admin").send(body);

    expect(res.status).toBe(200);
    const [lockSql] = prismaMock.$executeRaw.mock.calls[0];
    expect(lockSql.join("")).toMatch(/pg_advisory_xact_lock/);
    expect(prismaMock.userRole.create).toHaveBeenCalledWith({ data: { user_id: NEW_USER_ID, role: "admin" } });
  });

  it("removes the auth user again if saving the role fails", async () => {
    process.env.ADMIN_SETUP_SECRET = "let-me-in";
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.userRole.findFirst.mockResolvedValue(null);
    supabaseMock.auth.admin.createUser.mockResolvedValue({ data: { user: { id: NEW_USER_ID } }, error: null });
    prismaMock.userRole.create.mockRejectedValue(new Error("db down"));

    const res = await request(app).post("/api/setup-admin").send(body);

    expect(res.status).toBe(500);
    expect(supabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
  });
});

describe("table QR tokens and sessions (P2)", () => {
  it("generates an unguessable QR token when none is given", async () => {
    prismaMock.table.create.mockImplementation(async ({ data }) => makeTable(data));
    const res = await request(app).post("/api/tables").set(authHeader("admin")).send({ floor_id: ids.floor, table_number: "T9", seats: 2 });
    expect(res.status).toBe(200);
    expect(prismaMock.table.create.mock.calls[0][0].data.qr_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses to blank out a QR token", async () => {
    for (const qr_token of ["", "   ", 42]) {
      const res = await request(app).put(`/api/tables/${ids.table}`).set(authHeader("admin")).send({ qr_token });
      expect(res.status).toBe(400);
    }
    expect(prismaMock.table.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown table status", async () => {
    const res = await request(app).patch(`/api/tables/${ids.table}/status`).set(authHeader("cashier")).send({ status: "broken" });
    expect(res.status).toBe(400);
  });

  it("records when a table is unlocked and clears it on lock", async () => {
    prismaMock.table.update.mockImplementation(async ({ data }) => makeTable(data));

    await request(app).post(`/api/tables/${ids.table}/open-customer-session`).set(authHeader("cashier"));
    const opened = prismaMock.table.update.mock.calls[0][0].data;
    expect(opened.customer_session_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(opened.customer_session_started_at).toBeInstanceOf(Date);

    await request(app).post(`/api/tables/${ids.table}/close-customer-session`).set(authHeader("cashier"));
    expect(prismaMock.table.update.mock.calls[1][0].data).toEqual({ customer_session_token: null, customer_session_started_at: null });
  });
});

describe("POST /api/reports/chat (P2)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.GROQ_API_KEY = "groq-test";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Sales are up." } }] }), { status: 200 }));
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = "";
    vi.unstubAllGlobals();
  });

  it("caps the question length", async () => {
    const res = await request(app).post("/api/reports/chat").set(authHeader("admin")).send({ question: "x".repeat(501) });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("doesn't send customer names or emails to Groq", async () => {
    prismaMock.order.findMany.mockResolvedValue([{ ...makeOrder({ payment_status: "paid" }), payments: [], table: makeTable() }]);

    const res = await request(app).post("/api/reports/chat").set(authHeader("admin")).send({ question: "How are sales?" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("Sales are up.");
    const sent = fetchMock.mock.calls[0][1].body;
    expect(sent).not.toContain("asha@example.com");
    expect(sent).not.toContain("Asha");
    expect(sent).not.toContain("9999999999");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a Groq auth failure as a bad gateway, not a logout", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }));
    const res = await request(app).post("/api/reports/chat").set(authHeader("admin")).send({ question: "Hi" });
    expect(res.status).toBe(502);
  });
});
