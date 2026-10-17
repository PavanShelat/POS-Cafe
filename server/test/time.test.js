import { describe, expect, it } from "vitest";
import { getBusinessDayStart, parseBusinessDate } from "../time.js";
import { buildInvoiceNumber, formatDateForInvoice } from "../tax.js";

// DATA-2: Render runs in UTC, but the cafe's day runs midnight-to-midnight IST.
// These results must not depend on the machine's own timezone.
const oneAmIst = new Date("2026-10-17T01:00:00+05:30"); // 19:30 UTC on the 16th

describe("parseBusinessDate", () => {
  it("turns a report date into an IST day range", () => {
    expect(parseBusinessDate("2026-10-17").toISOString()).toBe("2026-10-16T18:30:00.000Z");
    expect(parseBusinessDate("2026-10-17", true).toISOString()).toBe("2026-10-17T18:29:59.999Z");
  });

  it("puts an order placed at 01:00 IST in that day's report", () => {
    const start = parseBusinessDate("2026-10-17");
    const end = parseBusinessDate("2026-10-17", true);
    expect(oneAmIst >= start && oneAmIst <= end).toBe(true);

    const prevStart = parseBusinessDate("2026-10-16");
    const prevEnd = parseBusinessDate("2026-10-16", true);
    expect(oneAmIst >= prevStart && oneAmIst <= prevEnd).toBe(false);
  });

  it("rejects malformed dates", () => {
    for (const value of ["2026-13-45", "17-10-2026", "", "x", undefined, null, 20261017]) {
      expect(parseBusinessDate(value)).toBeNull();
    }
  });
});

describe("getBusinessDayStart", () => {
  it("returns IST midnight for today and earlier days", () => {
    expect(getBusinessDayStart(0, oneAmIst).toISOString()).toBe("2026-10-16T18:30:00.000Z");
    expect(getBusinessDayStart(7, oneAmIst).toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });
});

describe("invoice dates", () => {
  it("builds invoice numbers from the IST date and time", () => {
    expect(buildInvoiceNumber(oneAmIst)).toMatch(/^INV-20261017-010000-[A-Z0-9]{6}$/);
  });

  it("prints the IST time on invoices", () => {
    expect(formatDateForInvoice(oneAmIst)).toBe("17 Oct 2026, 01:00 am");
  });
});
