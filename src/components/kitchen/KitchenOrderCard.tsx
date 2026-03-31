import { usePOS } from '@/context/POSContext';
import { Order, KitchenStatus } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Clock, ChefHat, CheckCircle, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const statusConfig: Record<KitchenStatus, { label: string; icon: typeof Clock; color: string; nextStatus?: KitchenStatus; nextLabel?: string }> = {
  to_cook: { 
    label: 'To Cook', 
    icon: Clock, 
    color: 'border-l-kitchen-to-cook',
    nextStatus: 'preparing',
    nextLabel: 'Start Preparing'
  },
  preparing: { 
    label: 'Preparing', 
    icon: ChefHat, 
    color: 'border-l-kitchen-preparing',
    nextStatus: 'completed',
    nextLabel: 'Mark Complete'
  },
  completed: { 
    label: 'Completed', 
    icon: CheckCircle, 
    color: 'border-l-kitchen-completed'
  },
};

interface KitchenOrderCardProps {
  order: Order;
  draggable?: boolean;
  onDragStart?: (orderId: string) => void;
}

export function KitchenOrderCard({ order, draggable, onDragStart }: KitchenOrderCardProps) {
  const { updateKitchenStatus, tables, config } = usePOS();
  const table = tables.find(t => t.id === order.table_id);
  const statusInfo = statusConfig[order.kitchen_status];

  const handleAdvanceStatus = () => {
    if (statusInfo.nextStatus) {
      updateKitchenStatus(order.id, statusInfo.nextStatus);
    }
  };

  return (
    <div
      className={cn('kds-order-card', statusInfo.color)}
      draggable={draggable}
      onDragStart={() => onDragStart?.(order.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xl font-bold">{table?.table_number}</span>
          {order.customer_name && (
            <span className="ml-2 text-sm text-muted-foreground">({order.customer_name})</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
        </div>
      </div>

      {/* Order Items */}
      <div className="space-y-2 mb-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {item.quantity}
            </span>
            <span className="font-medium">{item.product.name}</span>
            {item.notes && (
              <span className="text-sm text-muted-foreground italic">({item.notes})</span>
            )}
          </div>
        ))}
      </div>

      {/* Source badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className={cn(
          'px-2 py-0.5 rounded text-xs font-medium',
          order.source === 'customer' ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground'
        )}>
          {order.source === 'customer' ? '📱 QR Order' : '💻 POS Order'}
        </span>
      </div>

      {/* Action Button */}
      {statusInfo.nextStatus && (
        <Button 
          onClick={handleAdvanceStatus}
          className={cn(
            'w-full',
            order.kitchen_status === 'to_cook' && 'bg-kitchen-preparing hover:bg-kitchen-preparing/90',
            order.kitchen_status === 'preparing' && 'bg-kitchen-completed hover:bg-kitchen-completed/90'
          )}
        >
          {statusInfo.nextLabel}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}
    </div>
  );
}
