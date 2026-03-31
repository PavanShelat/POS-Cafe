// Core POS Types based on PRD

export type TableStatus = 'available' | 'occupied' | 'pending_confirmation';
export type OrderSource = 'pos' | 'customer';
export type OrderStatus = 'pending_confirmation' | 'confirmed' | 'cancelled';
export type PaymentStatus = 'paid' | 'unpaid';
export type PaymentMethod = 'cash' | 'digital' | 'upi';
export type KitchenStatus = 'to_cook' | 'preparing' | 'completed';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  active: boolean;
  image?: string;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

export interface Floor {
  id: string;
  name: string;
}

export interface Table {
  id: string;
  floor_id: string;
  table_number: string;
  seats: number;
  qr_token: string;
  active: boolean;
  status: TableStatus;
  customer_session_token?: string | null;
}

export interface Session {
  id: string;
  opened_at: string;
  closed_at: string | null;
  total_sales: number;
  orders_count: number;
  is_active: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product: Product;
  quantity: number;
  price: number;
  notes?: string;
}

export interface Order {
  id: string;
  invoice_number: string;
  table_id: string;
  table?: Table;
  session_id: string;
  source: OrderSource;
  status: OrderStatus;
  kitchen_status: KitchenStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  discount: number;
  taxable_amount: number;
  cgst_rate: number;
  sgst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

export interface POSConfig {
  restaurant_name: string;
  gstin?: string;
  upi_id?: string;
  currency: string;
  tax_rate: number;
}
