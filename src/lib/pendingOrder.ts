import { CartItem } from '@/types/pos';

// An order created for a checkout the customer then closed. It is reused only if
// it was built from this exact cart and these details; otherwise the customer
// would pay for (and the kitchen would cook) the old cart.
const PENDING_ORDER_KEY = 'customerPendingOrder';

export type CustomerDetails = { name: string; email: string; phone: string };

export function buildPendingOrderKey(cart: CartItem[], details: CustomerDetails) {
  return JSON.stringify({
    items: cart.map(item => [item.product.id, item.quantity, item.notes || '']).sort(),
    name: details.name.trim(),
    email: details.email.trim(),
    phone: details.phone || '',
  });
}

function readPendingOrder(): { orderId: string; key: string } | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PENDING_ORDER_KEY) || 'null');
    return parsed && typeof parsed.orderId === 'string' && typeof parsed.key === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function findReusableOrderId(key: string) {
  const pending = readPendingOrder();
  return pending?.key === key ? pending.orderId : null;
}

export function savePendingOrder(orderId: string, key: string) {
  sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ orderId, key }));
}

export function clearPendingOrder() {
  sessionStorage.removeItem(PENDING_ORDER_KEY);
}
