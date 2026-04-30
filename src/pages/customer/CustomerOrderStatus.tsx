import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Order, Table } from '@/types/pos';
import { usePOS } from '@/context/POSContext';
import { apiGet } from '@/lib/api';
import { Coffee, Clock, ChefHat, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type CustomerOrderStatusResponse = {
  table: Table | null;
  order: Order | null;
};

const statusSteps = [
  { id: 'payment', label: 'Payment', icon: CheckCircle, description: 'Complete payment to proceed' },
  { id: 'confirmed', label: 'Order Confirmed', icon: CheckCircle, description: 'POS has accepted your order' },
  { id: 'preparing', label: 'Preparing', icon: ChefHat, description: 'Our kitchen is preparing your order' },
  { id: 'ready', label: 'Ready', icon: Coffee, description: 'Your order is ready' },
] as const;

function getOrderProgress(order: Order | null) {
  if (!order) {
    return {
      isCancelled: false,
      currentStepIndex: 0,
      title: 'Waiting for Order',
      subtitle: 'No active customer order found for this table',
      icon: Coffee,
      iconClass: 'text-muted-foreground',
      iconBg: 'bg-muted',
    };
  }

  if (order.status === 'cancelled') {
    return {
      isCancelled: true,
      currentStepIndex: -1,
      title: 'Order Cancelled',
      subtitle: 'Please contact counter staff for assistance',
      icon: XCircle,
      iconClass: 'text-status-cancelled',
      iconBg: 'bg-status-cancelled/20',
    };
  }

  if (order.payment_status !== 'paid') {
    return {
      isCancelled: false,
      currentStepIndex: 0,
      title: 'Waiting for Payment',
      subtitle: 'Complete the payment to place your order',
      icon: Clock,
      iconClass: 'text-status-pending',
      iconBg: 'bg-status-pending/20',
    };
  }

  if (order.status === 'pending_confirmation') {
    return {
      isCancelled: false,
      currentStepIndex: 0,
      title: 'Waiting for POS Confirmation',
      subtitle: 'Payment received. Awaiting confirmation',
      icon: Clock,
      iconClass: 'text-status-pending',
      iconBg: 'bg-status-pending/20',
    };
  }

  if (order.kitchen_status === 'to_cook') {
    return {
      isCancelled: false,
      currentStepIndex: 1,
      title: 'Order Confirmed',
      subtitle: 'Kitchen will start preparation shortly',
      icon: CheckCircle,
      iconClass: 'text-status-completed',
      iconBg: 'bg-status-completed/20',
    };
  }

  if (order.kitchen_status === 'preparing') {
    return {
      isCancelled: false,
      currentStepIndex: 2,
      title: 'Preparing Your Order',
      subtitle: 'Estimated wait: 10-15 mins',
      icon: ChefHat,
      iconClass: 'text-status-preparing',
      iconBg: 'bg-status-preparing/20',
    };
  }

  return {
    isCancelled: false,
    currentStepIndex: 3,
    title: 'Your order is ready',
    subtitle: 'Please collect your order from the counter',
    icon: Coffee,
    iconClass: 'text-status-completed',
    iconBg: 'bg-status-completed/20',
  };
}

export default function CustomerOrderStatus() {
  const { tableToken } = useParams();
  const navigate = useNavigate();
  const { config } = usePOS();
  const [table, setTable] = useState<Table | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orderId = sessionStorage.getItem('customerOrderId');

  useEffect(() => {
    if (!tableToken) {
      setError('Invalid table token');
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchStatus = async () => {
      try {
        const query = orderId ? `?order_id=${encodeURIComponent(orderId)}` : '';
        const data = await apiGet<CustomerOrderStatusResponse>(`/api/customer/order-status/${tableToken}${query}`, { auth: false });
        if (!mounted) return;
        setTable(data.table);
        setOrder(data.order);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load order status');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchStatus();
    const interval = window.setInterval(fetchStatus, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [tableToken, orderId]);

  const progress = useMemo(() => getOrderProgress(order), [order]);
  const TitleIcon = progress.icon;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-10 w-10 mx-auto animate-spin text-muted-foreground mb-3" />
          <h1 className="text-xl font-bold mb-1">Loading order status...</h1>
          <p className="text-muted-foreground">Please wait</p>
        </div>
      </div>
    );
  }

  if (error || !table) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <XCircle className="h-14 w-14 mx-auto text-status-cancelled mb-4" />
          <h1 className="text-2xl font-bold mb-2">Unable to load order status</h1>
          <p className="text-muted-foreground">{error || 'Invalid link'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="bg-primary text-primary-foreground px-4 py-6 text-center">
        <Coffee className="h-10 w-10 mx-auto mb-2" />
        <h1 className="text-xl font-bold">{config.restaurant_name || 'POS Cafe'}</h1>
        <p className="text-sm opacity-80">Table {table.table_number}</p>
      </header>

      <div className="p-4 -mt-4">
        <div className="bg-card rounded-2xl shadow-elevated p-6">
          <div className="text-center mb-8">
            <div className={cn('w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center', progress.iconBg)}>
              <TitleIcon className={cn('h-10 w-10', progress.iconClass, !progress.isCancelled && progress.currentStepIndex === 2 && 'pulse-subtle')} />
            </div>
            <h2 className="text-2xl font-bold mb-1">{progress.title}</h2>
            <p className="text-muted-foreground">{progress.subtitle}</p>
          </div>

          {!progress.isCancelled && (
            <div className="space-y-4">
              {statusSteps.map((step, index) => {
                const isCompleted = index < progress.currentStepIndex;
                const isCurrent = index === progress.currentStepIndex;
                const isCurrentSuccess = isCurrent && (step.id === 'confirmed' || step.id === 'ready');
                const isCurrentPending = isCurrent && (step.id === 'payment' || step.id === 'preparing');

                return (
                  <div key={step.id} className="flex items-start gap-4">
                    <div className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                      isCompleted && 'bg-status-completed text-white',
                      isCurrentSuccess && 'bg-status-completed text-white',
                      isCurrentPending && 'bg-status-pending text-white',
                      !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                    )}>
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 pb-4 border-b border-border last:border-0">
                      <h3 className={cn(
                        'font-medium',
                        (isCompleted || isCurrent) ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {step.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    {isCompleted && (
                      <CheckCircle className="h-5 w-5 text-status-completed shrink-0" />
                    )}
                    {isCurrentSuccess && (
                      <CheckCircle className="h-5 w-5 text-status-completed shrink-0" />
                    )}
                    {isCurrentPending && (
                      <Clock className="h-5 w-5 text-status-pending shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          {order ? `Order #${order.id.slice(0, 8).toUpperCase()}` : 'No active order'}
        </p>
        {/* Allow the customer to place another round of items */}
        <button
          onClick={() => navigate(`/order/${tableToken}`)}
          className="w-full py-3 px-6 rounded-xl border-2 border-accent text-accent font-semibold hover:bg-accent/10 transition-colors"
        >
          + Order More Items
        </button>
        <p className="text-xs text-muted-foreground">Each round is a separate payment</p>
      </div>
    </div>
  );
}
