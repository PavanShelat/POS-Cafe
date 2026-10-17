import { describe, expect, it } from "vitest";
import { calculateOrderTotals, roundCurrency, splitGstRate } from "../tax.js";

const productMap = new Map([
  ["latte", { price: 200 }],
  ["muffin", { price: 120 }],
  ["odd", { price: 33.33 }],
]);

describe("calculateOrderTotals", () => {
  it("prices items from the product list, not from the client", () => {
    const totals = calculateOrderTotals({
      items: [{ product_id: "latte", quantity: 2, price: 1 }, { product_id: "muffin", quantity: 1 }],
      productMap,
      gstRate: 5,
    });
    expect(totals.subtotal).toBe(520);
    expect(totals.taxableAmount).toBe(520);
    expect(totals.cgstAmount).toBe(13);
    expect(totals.sgstAmount).toBe(13);
    expect(totals.totalAmount).toBe(546);
  });

  it("applies GST after the discount", () => {
    const totals = calculateOrderTotals({ items: [{ product_id: "latte", quantity: 1 }], productMap, discount: 50, gstRate: 5 });
    expect(totals.discount).toBe(50);
    expect(totals.taxableAmount).toBe(150);
    expect(totals.totalAmount).toBe(157.5);
  });

  it("caps the discount at the subtotal", () => {
    const totals = calculateOrderTotals({ items: [{ product_id: "latte", quantity: 1 }], productMap, discount: 99999, gstRate: 5 });
    expect(totals.discount).toBe(200);
    expect(totals.totalAmount).toBe(0);
  });

  it("treats negative or non-numeric discounts as zero", () => {
    for (const discount of [-100, "abc", null, undefined]) {
      const totals = calculateOrderTotals({ items: [{ product_id: "latte", quantity: 1 }], productMap, discount, gstRate: 0 });
      expect(totals.discount).toBe(0);
      expect(totals.totalAmount).toBe(200);
    }
  });

  it("rounds money to two decimals", () => {
    const totals = calculateOrderTotals({ items: [{ product_id: "odd", quantity: 3 }], productMap, gstRate: 5 });
    expect(totals.subtotal).toBe(99.99);
    expect(totals.cgstAmount).toBe(2.5);
    expect(totals.totalAmount).toBe(104.99);
  });
});

describe("splitGstRate", () => {
  it("splits GST evenly into CGST and SGST", () => {
    expect(splitGstRate(5)).toEqual({ gstRate: 5, cgstRate: 2.5, sgstRate: 2.5 });
    expect(splitGstRate(18)).toEqual({ gstRate: 18, cgstRate: 9, sgstRate: 9 });
  });

  it("never returns a negative rate", () => {
    expect(splitGstRate(-5)).toEqual({ gstRate: 0, cgstRate: 0, sgstRate: 0 });
  });
});

describe("roundCurrency", () => {
  it("rounds half up at the cent", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.344)).toBe(2.34);
  });
});
