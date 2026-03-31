function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clampDiscount(subtotal, discount) {
  const safeSubtotal = roundCurrency(Math.max(0, Number(subtotal) || 0));
  const safeDiscount = roundCurrency(Math.max(0, Number(discount) || 0));
  return Math.min(safeSubtotal, safeDiscount);
}

function splitGstRate(gstRate) {
  const totalRate = roundCurrency(Math.max(0, Number(gstRate) || 0));
  const halfRate = roundCurrency(totalRate / 2);

  return {
    gstRate: totalRate,
    cgstRate: halfRate,
    sgstRate: roundCurrency(totalRate - halfRate),
  };
}

function calculateOrderTotals({ items, productMap, discount = 0, gstRate = 0 }) {
  const subtotal = roundCurrency(
    items.reduce((sum, item) => {
      const product = productMap.get(item.product_id);
      const price = Number(product?.price || 0);
      return sum + price * Number(item.quantity || 0);
    }, 0)
  );

  const discountAmount = clampDiscount(subtotal, discount);
  const taxableAmount = roundCurrency(subtotal - discountAmount);
  const { gstRate: totalGstRate, cgstRate, sgstRate } = splitGstRate(gstRate);
  const cgstAmount = roundCurrency((taxableAmount * cgstRate) / 100);
  const sgstAmount = roundCurrency((taxableAmount * sgstRate) / 100);
  const totalAmount = roundCurrency(taxableAmount + cgstAmount + sgstAmount);

  return {
    subtotal,
    discount: discountAmount,
    taxableAmount,
    gstRate: totalGstRate,
    cgstRate,
    sgstRate,
    cgstAmount,
    sgstAmount,
    totalAmount,
  };
}

function formatCurrency(value, currency = "Rs ") {
  return `${currency}${roundCurrency(value).toFixed(2)}`;
}

function formatDateForInvoice(value) {
  const date = new Date(value);
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildInvoiceNumber(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
}

export {
  buildInvoiceNumber,
  calculateOrderTotals,
  formatCurrency,
  formatDateForInvoice,
  roundCurrency,
  splitGstRate,
};
