import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Order, POSConfig, Table } from '@/types/pos';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

type PublicOrderResponse = { order: Order; table: Table; config: POSConfig };

function kitchenLabel(status: Order['kitchen_status']) {
  if (status === 'to_cook') return 'Queued';
  if (status === 'preparing') return 'Preparing';
  return 'Ready';
}

export default function PublicOrderTracking() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id') || searchParams.get('orderId') || '';

  const [order, setOrder] = useState<Order | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [config, setConfig] = useState<POSConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const amountText = useMemo(() => {
    if (!order || !config) return '';
    return `${config.currency}${order.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [order, config]);

  const fetchOrder = async () => {
    if (!orderId) {
      setError('Missing order_id in URL');
      setLoading(false);
      return;
    }

    try {
      const data = await apiGet<PublicOrderResponse>(`/api/public/orders/${orderId}`, { auth: false });
      setOrder(data.order);
      setTable(data.table);
      setConfig(data.config);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrder();
    const t = window.setInterval(() => {
      void fetchOrder();
    }, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading status…
        </div>
      </div>
    );
  }

  if (!order || !table || !config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md space-y-3">
          <h1 className="text-xl font-bold">Order Not Available</h1>
          <p className="text-muted-foreground">{error || 'Please contact staff.'}</p>
          <Button onClick={() => navigate('/')} variant="outline">Back</Button>
        </div>
      </div>
    );
  }

  const isPaid = order.payment_status === 'paid';
  const kitchenVariant = order.kitchen_status;
  const kitchenLabelText = kitchenLabel(order.kitchen_status);

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-3xl mx-auto py-6">
        <Card className="shadow-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <span className="text-2xl font-bold">Order Tracking</span>
              <Button size="icon" variant="outline" onClick={() => void fetchOrder()} aria-label="Refresh">
                <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{table.table_number}</p>
                <p className="text-xl font-bold break-all">{order.invoice_number}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="text-2xl font-bold">{amountText}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn('rounded-full px-3 py-1', isPaid ? 'bg-status-completed text-white' : 'bg-status-pending text-white')}>
                {isPaid ? 'Paid' : 'Waiting'}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full px-3 py-1',
                  kitchenVariant === 'to_cook' && 'border-status-pending text-status-pending',
                  kitchenVariant === 'preparing' && 'border-status-preparing text-status-preparing',
                  kitchenVariant === 'completed' && 'border-status-completed text-status-completed'
                )}
              >
                {kitchenLabelText}
              </Badge>
            </div>

            {!isPaid && (
              <div className="rounded-lg border bg-card p-4 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Payment pending. Tap to complete payment.</p>
                <Button onClick={() => navigate(`/pay?order_id=${encodeURIComponent(orderId)}`)}>
                  Pay Now
                </Button>
              </div>
            )}

            <div className="rounded-xl border bg-card p-4">
              <p className="font-semibold mb-3">Items</p>
              <div className="space-y-2 text-sm">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground truncate">{item.quantity}× {item.product.name}</span>
                    <span className="shrink-0 text-muted-foreground">{config.currency}{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Auto-refreshing every 5 seconds.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
