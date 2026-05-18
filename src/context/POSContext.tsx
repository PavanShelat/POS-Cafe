import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  Order,
  Table,
  Session,
  Product,
  CartItem,
  KitchenStatus,
  Category,
  Floor,
  POSConfig,
  PaymentMethod,
  PaymentStatus,
} from '@/types/pos';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';

interface POSContextType {
  // Session
  session: Session | null;
  openSession: () => Promise<void>;
  closeSession: () => Promise<void>;

  // Tables
  tables: Table[];
  floors: Floor[];
  updateTableStatus: (tableId: string, status: Table['status']) => Promise<void>;

  // Orders
  orders: Order[];
  createOrder: (
    tableId: string,
    items: CartItem[],
    source: 'pos' | 'customer',
    options?: {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      discount?: number;
      paymentStatus?: PaymentStatus;
      paymentMethod?: PaymentMethod;
    }
  ) => Promise<Order | null>;
  confirmOrder: (orderId: string) => Promise<void>;
  rejectOrder: (orderId: string) => Promise<void>;
  updateKitchenStatus: (orderId: string, status: KitchenStatus) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  openCustomerSession: (tableId: string) => Promise<void>;
  closeCustomerSession: (tableId: string) => Promise<void>;
  releaseTable: (tableId: string) => Promise<void>;

  // Products
  allProducts: Product[];
  categories: Category[];
  createProduct: (payload: { name: string; category_id?: string; price: number; active?: boolean; description?: string; image?: string }) => Promise<void>;
  importProducts: (payload: { name: string; category: string; price: number }[]) => Promise<{ importedCount: number; createdCategories: number }>;
  updateProduct: (id: string, payload: Partial<{ name: string; category_id: string; price: number; active: boolean; description: string; image: string }>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Floors and tables
  createFloor: (name: string) => Promise<void>;
  updateFloor: (id: string, name: string) => Promise<void>;
  deleteFloor: (id: string) => Promise<void>;
  createTable: (payload: { floor_id: string; table_number: string; seats: number; qr_token: string; active?: boolean; status?: Table['status'] }) => Promise<void>;
  updateTable: (id: string, payload: Partial<{ floor_id: string; table_number: string; seats: number; qr_token: string; active: boolean; status: Table['status'] }>) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;

  // Cart (for active order creation)
  cart: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;

  // Config
  config: POSConfig;
  updateConfig: (payload: Partial<POSConfig>) => Promise<void>;
  reloadData: () => Promise<void>;

  // Selected table for order
  selectedTable: Table | null;
  setSelectedTable: (table: Table | null) => void;
}

type BootstrapResponse = {
  categories: Category[];
  products: Product[];
  floors: Floor[];
  tables: Table[];
  session: Session | null;
  orders: Order[];
  config: POSConfig;
};

const POSContext = createContext<POSContextType | undefined>(undefined);
const AUTO_REFRESH_MS = 3000;

export function POSProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<POSConfig>({
    restaurant_name: '',
    gstin: '',
    currency: 'Rs ',
    tax_rate: 0,
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const isReloadingRef = useRef(false);

  const reloadData = useCallback(async () => {
    if (isReloadingRef.current) {
      return;
    }

    isReloadingRef.current = true;
    try {
      const data = await apiGet<BootstrapResponse>('/api/bootstrap');
      setSession(data.session);
      setTables(data.tables || []);
      setFloors(data.floors || []);
      setOrders(data.orders || []);
      setAllProducts(data.products || []);
      setCategories(data.categories || []);
      setConfig((prev) => data.config || prev);
    } catch (err) {
      console.error('Failed to load POS data', err);
    } finally {
      isReloadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void reloadData();

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void reloadData();
    }, AUTO_REFRESH_MS);

    const handleWindowFocus = () => {
      void reloadData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void reloadData();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [reloadData]);

  const openSession = async () => {
    try {
      const data = await apiPost<{ session: Session }>('/api/sessions/open', {});
      setSession(data.session);
    } catch (err) {
      console.error('Failed to open session', err);
    }
  };

  const closeSession = async () => {
    if (!session) return;
    try {
      const data = await apiPost<{ session: Session }>('/api/sessions/close', { session_id: session.id });
      setSession(data.session);
    } catch (err) {
      console.error('Failed to close session', err);
    }
  };

  const updateTableStatus = async (tableId: string, status: Table['status']) => {
    try {
      const data = await apiPatch<{ table: Table }>(`/api/tables/${tableId}/status`, { status });
      setTables(prev => prev.map(t => t.id === tableId ? data.table : t));
    } catch (err) {
      console.error('Failed to update table status', err);
    }
  };

  const createOrder = async (
    tableId: string,
    items: CartItem[],
    source: 'pos' | 'customer',
    options?: {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      discount?: number;
      paymentStatus?: PaymentStatus;
      paymentMethod?: PaymentMethod;
    }
  ): Promise<Order | null> => {
    try {
      const payload = {
        table_id: tableId,
        source,
        customer_name: options?.customerName,
        customer_email: options?.customerEmail,
        customer_phone: options?.customerPhone,
        discount: options?.discount ?? 0,
        payment_status: options?.paymentStatus,
        payment_method: options?.paymentMethod,
        items: items.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          notes: item.notes,
        })),
      };

      const data = await apiPost<{ order: Order; table: Table; session: Session }>('/api/orders', payload);
      setOrders(prev => [data.order, ...prev]);
      setTables(prev => prev.map(t => t.id === data.table.id ? data.table : t));
      setSession(data.session);
      return data.order;
    } catch (err) {
      console.error('Failed to create order', err);
      return null;
    }
  };

  const confirmOrder = async (orderId: string) => {
    try {
      const data = await apiPatch<{ order: Order; table: Table }>(`/api/orders/${orderId}/confirm`, {});
      setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
      setTables(prev => prev.map(t => t.id === data.table.id ? data.table : t));
    } catch (err) {
      console.error('Failed to confirm order', err);
    }
  };

  const rejectOrder = async (orderId: string) => {
    try {
      const data = await apiPatch<{ order: Order; table: Table }>(`/api/orders/${orderId}/reject`, {});
      setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
      setTables(prev => prev.map(t => t.id === data.table.id ? data.table : t));
    } catch (err) {
      console.error('Failed to reject order', err);
    }
  };

  const openCustomerSession = async (tableId: string) => {
    try {
      const data = await apiPost<{ table: Table }>(`/api/tables/${tableId}/open-customer-session`, {});
      setTables(prev => prev.map(t => t.id === tableId ? data.table : t));
    } catch (err) {
      console.error('Failed to open customer session', err);
    }
  };

  const closeCustomerSession = async (tableId: string) => {
    try {
      const data = await apiPost<{ table: Table }>(`/api/tables/${tableId}/close-customer-session`, {});
      setTables(prev => prev.map(t => t.id === tableId ? data.table : t));
    } catch (err) {
      console.error('Failed to close customer session', err);
    }
  };

  const releaseTable = async (tableId: string) => {
    try {
      const data = await apiPost<{ table: Table }>(`/api/tables/${tableId}/release`, {});
      setTables(prev => prev.map(t => t.id === tableId ? data.table : t));
    } catch (err) {
      console.error('Failed to release table', err);
    }
  };

  const updateKitchenStatus = async (orderId: string, status: KitchenStatus) => {
    try {
      const data = await apiPatch<{ order: Order; table: Table }>(`/api/orders/${orderId}/kitchen-status`, { status });
      setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
      setTables(prev => prev.map(t => t.id === data.table.id ? data.table : t));
    } catch (err) {
      console.error('Failed to update kitchen status', err);
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      await apiDelete<{ ok: boolean }>(`/api/orders/${orderId}`);
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err) {
      console.error('Failed to delete order', err);
    }
  };

  const createProduct = async (payload: { name: string; category_id?: string; price: number; active?: boolean; description?: string; image?: string }) => {
    try {
      await apiPost('/api/products', payload);
      await reloadData();
    } catch (err) {
      console.error('Failed to create product', err);
    }
  };

  const importProducts = async (payload: { name: string; category: string; price: number }[]) => {
    try {
      const data = await apiPost<{ imported_count: number; created_categories: number }>('/api/products/import', { products: payload });
      await reloadData();
      return {
        importedCount: data.imported_count || 0,
        createdCategories: data.created_categories || 0,
      };
    } catch (err) {
      console.error('Failed to import products', err);
      throw err;
    }
  };

  const updateProduct = async (id: string, payload: Partial<{ name: string; category_id: string; price: number; active: boolean; description: string; image: string }>) => {
    try {
      const current = allProducts.find(p => p.id === id);
      if (!current) return;
      await apiPut(`/api/products/${id}`, {
        name: payload.name ?? current.name,
        category_id: payload.category_id ?? current.category,
        price: payload.price ?? current.price,
        active: payload.active ?? current.active,
        description: payload.description ?? current.description,
        image: payload.image ?? current.image,
      });
      await reloadData();
    } catch (err) {
      console.error('Failed to update product', err);
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await apiDelete(`/api/products/${id}`);
      setAllProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Failed to delete product', err);
    }
  };

  const createFloor = async (name: string) => {
    try {
      await apiPost('/api/floors', { name });
      await reloadData();
    } catch (err) {
      console.error('Failed to create floor', err);
    }
  };

  const updateFloor = async (id: string, name: string) => {
    try {
      await apiPut(`/api/floors/${id}`, { name });
      await reloadData();
    } catch (err) {
      console.error('Failed to update floor', err);
    }
  };

  const deleteFloor = async (id: string) => {
    try {
      await apiDelete(`/api/floors/${id}`);
      setFloors(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Failed to delete floor', err);
    }
  };

  const createTable = async (payload: { floor_id: string; table_number: string; seats: number; qr_token: string; active?: boolean; status?: Table['status'] }) => {
    try {
      await apiPost('/api/tables', payload);
      await reloadData();
    } catch (err) {
      console.error('Failed to create table', err);
    }
  };

  const updateTable = async (id: string, payload: Partial<{ floor_id: string; table_number: string; seats: number; qr_token: string; active: boolean; status: Table['status'] }>) => {
    try {
      const current = tables.find(t => t.id === id);
      if (!current) return;
      await apiPut(`/api/tables/${id}`, {
        floor_id: payload.floor_id ?? current.floor_id,
        table_number: payload.table_number ?? current.table_number,
        seats: payload.seats ?? current.seats,
        qr_token: payload.qr_token ?? current.qr_token,
        active: payload.active ?? current.active,
        status: payload.status ?? current.status,
      });
      await reloadData();
    } catch (err) {
      console.error('Failed to update table', err);
    }
  };

  const deleteTable = async (id: string) => {
    try {
      await apiDelete(`/api/tables/${id}`);
      setTables(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete table', err);
    }
  };

  const updateConfig = async (payload: Partial<POSConfig>) => {
    try {
      const data = await apiPut<{ config: POSConfig }>('/api/config', payload);
      if (data?.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Failed to update config', err);
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  return (
    <POSContext.Provider
      value={{
        session,
        openSession,
        closeSession,
        tables,
        floors,
        updateTableStatus,
        orders,
        createOrder,
        confirmOrder,
        rejectOrder,
        updateKitchenStatus,
        deleteOrder,
        openCustomerSession,
        closeCustomerSession,
        releaseTable,
        allProducts,
        categories,
        createProduct,
        importProducts,
        updateProduct,
        deleteProduct,
        createFloor,
        updateFloor,
        deleteFloor,
        createTable,
        updateTable,
        deleteTable,
        cart,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        cartTotal,
        config,
        updateConfig,
        reloadData,
        selectedTable,
        setSelectedTable,
      }}
    >
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}
