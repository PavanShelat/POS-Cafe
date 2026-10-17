import { useCallback, useEffect, useState } from 'react';
import { Category, POSConfig, Product, PublicTable } from '@/types/pos';
import { apiGet } from '@/lib/api';

type PublicMenuResponse = {
  table: PublicTable;
  categories: Category[];
  products: Product[];
  config: POSConfig;
};

const DEFAULT_CONFIG: POSConfig = {
  restaurant_name: '',
  gstin: '',
  currency: 'Rs ',
  tax_rate: 0,
};

// Menu data for customer pages. Only needs the table's QR token, so it works on
// a phone that isn't logged in.
export function usePublicMenu(qrToken: string | undefined) {
  const [data, setData] = useState<PublicMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!qrToken) {
      setError('Table not found');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<PublicMenuResponse>(
        `/api/public/menu/${encodeURIComponent(qrToken)}`,
        { auth: false }
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    table: data?.table ?? null,
    products: data?.products ?? [],
    categories: data?.categories ?? [],
    config: data?.config ?? DEFAULT_CONFIG,
    loading,
    error,
    reload: load,
  };
}
