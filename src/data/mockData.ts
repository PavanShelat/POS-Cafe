import { Product, Category, Floor, Table, Order, Session, POSConfig } from '@/types/pos';

export const categories: Category[] = [
  { id: 'cat-1', name: 'Coffee', icon: 'coffee' },
  { id: 'cat-2', name: 'Tea', icon: 'tea' },
  { id: 'cat-3', name: 'Snacks', icon: 'snacks' },
];

export const products: Product[] = [
  { id: 'prod-1', name: 'Espresso', category: 'cat-1', price: 120, active: true, description: 'Rich and bold single shot' },
  { id: 'prod-2', name: 'Masala Chai', category: 'cat-2', price: 80, active: true, description: 'Spiced tea' },
  { id: 'prod-3', name: 'Croissant', category: 'cat-3', price: 150, active: true, description: 'Buttery pastry' },
];

export const floors: Floor[] = [
  { id: 'floor-1', name: 'Ground Floor' },
];

export const tables: Table[] = [
  { id: 'table-1', floor_id: 'floor-1', table_number: 'T1', seats: 2, qr_token: 'qr-t1-abc123', active: true, status: 'available' },
];

export const currentSession: Session = {
  id: 'session-1',
  opened_at: new Date().toISOString(),
  closed_at: null,
  total_sales: 525,
  orders_count: 1,
  is_active: true,
};

export const orders: Order[] = [
  {
    id: 'order-1',
    invoice_number: 'INV-20260325-MOCK001',
    table_id: 'table-1',
    session_id: 'session-1',
    source: 'pos',
    status: 'confirmed',
    kitchen_status: 'preparing',
    payment_status: 'paid',
    subtotal: 350,
    discount: 0,
    taxable_amount: 350,
    cgst_rate: 2.5,
    sgst_rate: 2.5,
    cgst_amount: 8.75,
    sgst_amount: 8.75,
    total_amount: 367.5,
    created_at: new Date().toISOString(),
    customer_name: 'Walk-in',
    items: [
      { id: 'item-1', order_id: 'order-1', product_id: 'prod-1', product: products[0], quantity: 1, price: 120 },
      { id: 'item-2', order_id: 'order-1', product_id: 'prod-2', product: products[1], quantity: 1, price: 80 },
      { id: 'item-3', order_id: 'order-1', product_id: 'prod-3', product: products[2], quantity: 1, price: 150 },
    ],
  },
];

export const posConfig: POSConfig = {
  restaurant_name: 'Bean and Brew Cafe',
  gstin: '29ABCDE1234F1Z5',
  upi_id: 'beanbrewcafe@upi',
  currency: 'Rs ',
  tax_rate: 5,
};
