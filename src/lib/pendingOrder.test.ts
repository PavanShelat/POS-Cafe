import { beforeEach, describe, expect, it } from 'vitest';
import { CartItem } from '@/types/pos';
import { buildPendingOrderKey, clearPendingOrder, findReusableOrderId, savePendingOrder } from './pendingOrder';

function item(id: string, quantity: number, notes?: string): CartItem {
  return { product: { id, name: id, category: 'c', price: 100, active: true }, quantity, notes };
}

const details = { name: 'Asha', email: 'asha@example.com', phone: '' };

beforeEach(() => sessionStorage.clear());

// FLOW-2: after a cancelled checkout, an edited cart must create a new order.
describe('pending order reuse', () => {
  it('reuses the order when nothing changed', () => {
    const key = buildPendingOrderKey([item('latte', 1)], details);
    savePendingOrder('order-1', key);
    expect(findReusableOrderId(buildPendingOrderKey([item('latte', 1)], details))).toBe('order-1');
  });

  it('ignores item order in the cart', () => {
    const a = buildPendingOrderKey([item('latte', 1), item('muffin', 2)], details);
    const b = buildPendingOrderKey([item('muffin', 2), item('latte', 1)], details);
    expect(a).toBe(b);
  });

  it.each([
    ['an added item', [item('latte', 1), item('muffin', 1)], details],
    ['a changed quantity', [item('latte', 2)], details],
    ['a changed note', [item('latte', 1, 'no sugar')], details],
    ['a changed email', [item('latte', 1)], { ...details, email: 'other@example.com' }],
    ['a changed name', [item('latte', 1)], { ...details, name: 'Ravi' }],
  ])('creates a new order after %s', (_label, cart, newDetails) => {
    savePendingOrder('order-1', buildPendingOrderKey([item('latte', 1)], details));
    expect(findReusableOrderId(buildPendingOrderKey(cart, newDetails))).toBeNull();
  });

  it('forgets the order after payment', () => {
    const key = buildPendingOrderKey([item('latte', 1)], details);
    savePendingOrder('order-1', key);
    clearPendingOrder();
    expect(findReusableOrderId(key)).toBeNull();
  });

  it('ignores corrupted storage', () => {
    sessionStorage.setItem('customerPendingOrder', '{not json');
    expect(findReusableOrderId('anything')).toBeNull();
  });
});
