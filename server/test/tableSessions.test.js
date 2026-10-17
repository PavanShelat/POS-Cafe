import { describe, expect, it, vi } from "vitest";
import { getAutoRelockHours, relockExpiredTables } from "../tableSessions.js";

describe("getAutoRelockHours", () => {
  it("reads TABLE_AUTO_RELEASE_HOURS and falls back to 12", () => {
    expect(getAutoRelockHours("24")).toBe(24);
    expect(getAutoRelockHours("1.5")).toBe(1.5);
    expect(getAutoRelockHours(undefined)).toBe(12);
    expect(getAutoRelockHours("")).toBe(12);
    expect(getAutoRelockHours("0")).toBe(12);
    expect(getAutoRelockHours("abc")).toBe(12);
  });
});

describe("relockExpiredTables", () => {
  it("clears QR sessions opened before the cutoff and leaves table status alone", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const now = new Date("2026-10-17T12:00:00Z");

    const count = await relockExpiredTables({ table: { updateMany } }, 24, now);

    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        customer_session_token: { not: null },
        customer_session_started_at: { lt: new Date("2026-10-16T12:00:00Z") },
      },
      data: { customer_session_token: null, customer_session_started_at: null },
    });
  });
});
