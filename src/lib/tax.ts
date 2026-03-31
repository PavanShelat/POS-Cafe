import { CartItem } from '@/types/pos';

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitGstRate(gstRate: number) {
  const safeRate = roundCurrency(Math.max(0, gstRate || 0));
  const halfRate = roundCurrency(safeRate / 2);

  return {
    gstRate: safeRate,
    cgstRate: halfRate,
    sgstRate: roundCurrency(safeRate - halfRate),
  };
}

export function calculateTaxSummary(subtotal: number, discount = 0, gstRate = 0) {
  const safeSubtotal = roundCurrency(Math.max(0, subtotal || 0));
  const safeDiscount = Math.min(safeSubtotal, roundCurrency(Math.max(0, discount || 0)));
  const taxableAmount = roundCurrency(safeSubtotal - safeDiscount);
  const { gstRate: totalRate, cgstRate, sgstRate } = splitGstRate(gstRate);
  const cgstAmount = roundCurrency((taxableAmount * cgstRate) / 100);
  const sgstAmount = roundCurrency((taxableAmount * sgstRate) / 100);
  const totalAmount = roundCurrency(taxableAmount + cgstAmount + sgstAmount);

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    taxableAmount,
    gstRate: totalRate,
    cgstRate,
    sgstRate,
    cgstAmount,
    sgstAmount,
    totalAmount,
  };
}

export function calculateCartSubtotal(cart: CartItem[]) {
  return roundCurrency(
    cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );
}
