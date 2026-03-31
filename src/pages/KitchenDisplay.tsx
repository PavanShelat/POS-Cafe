import { useState } from 'react';
import { usePOS } from '@/context/POSContext';
import { KitchenOrderCard } from '@/components/kitchen/KitchenOrderCard';
import { KitchenStatus } from '@/types/pos';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChefHat, Clock, Flame, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const columns: { status: KitchenStatus; label: string; icon: typeof Clock; bgClass: string }[] = [
  { status: 'to_cook', label: 'To Cook', icon: Clock, bgClass: 'bg-kitchen-to-cook/10' },
  { status: 'preparing', label: 'Preparing', icon: Flame, bgClass: 'bg-kitchen-preparing/10' },
  { status: 'completed', label: 'Completed', icon: CheckCircle, bgClass: 'bg-kitchen-completed/10' },
];

export default function KitchenDisplay() {
  const { orders, config, updateKitchenStatus } = usePOS();
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  
  // Kitchen receives only confirmed and paid orders
  const kitchenOrders = orders.filter(o => o.status === 'confirmed' && o.payment_status === 'paid');
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="h-8 w-8" />
          <div>
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <p className="text-sm opacity-80">{config.restaurant_name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm opacity-80">Active Orders</p>
          <p className="text-2xl font-bold">{kitchenOrders.filter(o => o.kitchen_status !== 'completed').length}</p>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="flex gap-4 p-6 h-[calc(100vh-80px)] overflow-x-auto">
        {columns.map((column) => {
          const columnOrders = kitchenOrders.filter((order) => {
            if (order.kitchen_status !== column.status) {
              return false;
            }

            if (column.status === 'completed') {
              return new Date(order.created_at) >= startOfToday;
            }

            return true;
          });
          return (
            <div
              key={column.status}
              className={cn('kds-column', column.bgClass)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async () => {
                if (!draggingOrderId) return;
                await updateKitchenStatus(draggingOrderId, column.status);
                setDraggingOrderId(null);
              }}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <column.icon className="h-5 w-5" />
                  <h2 className="font-semibold">{column.label}</h2>
                </div>
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-foreground/10 text-sm font-medium">
                  {columnOrders.length}
                </span>
              </div>

              {/* Orders */}
              <ScrollArea className="h-[calc(100%-40px)]">
                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <column.icon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No orders</p>
                    </div>
                  ) : (
                    columnOrders.map((order) => (
                      <KitchenOrderCard
                        key={order.id}
                        order={order}
                        draggable
                        onDragStart={setDraggingOrderId}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}
