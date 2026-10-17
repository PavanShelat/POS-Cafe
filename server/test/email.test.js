import { describe, expect, it } from "vitest";
import { buildInvoiceEmailHtml, escapeHtml, isValidEmail } from "../email.js";

// DATA-4: customer-supplied text must never become markup in emails sent from the
// restaurant's SMTP account.
describe("buildInvoiceEmailHtml", () => {
  it("shows a customer name containing HTML as plain text", () => {
    const html = buildInvoiceEmailHtml({
      restaurantName: "Bean & Brew",
      customerName: '<a href="https://evil.example">Click here</a>',
      invoiceNumber: "INV-<b>1</b>",
      totalAmount: 210,
      currency: "Rs ",
    });

    expect(html).not.toContain("<a href");
    expect(html).not.toContain("<b>1</b>");
    expect(html).toContain("Hi &lt;a href=&quot;https://evil.example&quot;&gt;Click here&lt;/a&gt;,");
    expect(html).toContain("Bean &amp; Brew");
    expect(html).toContain("Rs 210.00");
  });

  it("falls back to defaults when names are missing", () => {
    const html = buildInvoiceEmailHtml({ invoiceNumber: "INV-1", totalAmount: 0 });
    expect(html).toContain("Hi Customer,");
    expect(html).toContain("POS Cafe");
  });
});

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses and rejects junk", () => {
    expect(isValidEmail("asha@example.com")).toBe(true);
    expect(isValidEmail(" asha@example.com ")).toBe(true);
    for (const value of ["", "asha", "asha@", "@example.com", "a b@example.com", null, 42]) {
      expect(isValidEmail(value)).toBe(false);
    }
  });
});
