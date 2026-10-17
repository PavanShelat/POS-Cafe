import { afterEach, describe, expect, it, vi } from "vitest";
import { httpError, sendServerError } from "../errors.js";

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe("sendServerError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the status and message of errors raised on purpose", () => {
    const res = sendServerError(fakeRes(), httpError(403, "You do not have permission to do this"));
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "You do not have permission to do this" });
  });

  it("maps known Prisma errors to 4xx with a safe message", () => {
    const cases = [
      ["P2025", 404],
      ["P2002", 409],
      ["P2003", 409],
      ["P2023", 400],
    ];
    for (const [code, status] of cases) {
      const err = Object.assign(new Error("Invalid `prisma.order.update()` invocation: secret internals"), { code });
      const res = sendServerError(fakeRes(), err);
      expect(res.statusCode).toBe(status);
      expect(res.body.error).not.toContain("prisma");
    }
  });

  it("turns Prisma validation errors (e.g. a bad enum value) into 400", () => {
    const err = Object.assign(new Error("Invalid value for argument `status`"), { name: "PrismaClientValidationError" });
    const res = sendServerError(fakeRes(), err);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid request data" });
  });

  it("hides unexpected error text from the client", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = sendServerError(fakeRes(), new Error("connection string postgres://user:pass@host"));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Something went wrong. Please try again.");
  });
});
