import { Order } from '@/types/pos';
import { usePOS } from '@/context/POSContext';
import { Button } from '@/components/ui/button';
import { Check, X, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PendingOrderCardProps {
  order: Order;
}

export function PendingOrderCard({ order }: PendingOrderCardProps) {
  const { confirmOrder, rejectOrder, config, tables } = usePOS();
  const table = tables.find(t => t.id === order.table_id);

  return (
    <div className="order-card border-l-4 border-l-status-pending animate-slide-up">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{table?.table_number}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-status-pending text-white">
              Awaiting Confirmation
            </span>
          </div>
          {order.customer_name && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <User className="h-3.5 w-3.5" />
              {order.customer_name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
        </div>
      </div>

      {/* Order items */}
      <div className="space-y-1.5 mb-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              <span className="font-medium">{item.quantity}×</span> {item.product.name}
            </span>
            <span className="text-muted-foreground">
              {config.currency}{(item.price * item.quantity).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex justify-between items-center py-2 border-t border-border">
        <span className="font-medium">Total</span>
        <span className="font-bold text-lg">{config.currency}{order.total_amount.toLocaleString()}</span>
      </div>

      {/* Payment status */}
      <div className="flex items-center gap-2 py-2 text-sm">
        <span className="px-2 py-0.5 rounded bg-status-completed/20 text-status-completed font-medium">
          ✓ Paid via {order.source === 'customer' ? 'QR Order' : 'POS'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <Button
          onClick={() => confirmOrder(order.id)}
          className="flex-1 bg-status-completed hover:bg-status-completed/90"
        >
          <Check className="h-4 w-4 mr-2" />
          Confirm & Send to Kitchen
        </Button>
        <Button
          onClick={() => rejectOrder(order.id)}
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
