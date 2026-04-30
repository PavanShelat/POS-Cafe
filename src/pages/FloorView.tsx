import { useEffect, useState } from 'react';
import { usePOS } from '@/context/POSContext';
import { POSLayout } from '@/components/pos/POSLayout';
import { TableCard } from '@/components/pos/TableCard';
import { PendingOrderCard } from '@/components/pos/PendingOrderCard';
import { OrderDialog } from '@/components/pos/OrderDialog';
import { Table as TableType } from '@/types/pos';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Bell, LayoutGrid } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function FloorView() {
  const { tables, orders, floors } = usePOS();
  const [selectedFloor, setSelectedFloor] = useState('');
  const [orderDialogTable, setOrderDialogTable] = useState<TableType | null>(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('posSelectedFloor');
    if (stored) {
      setSelectedFloor(stored);
    }
  }, []);

  useEffect(() => {
    if (!selectedFloor && floors.length > 0) {
      const stored = sessionStorage.getItem('posSelectedFloor');
      const resolved = stored && floors.some((f) => f.id === stored) ? stored : floors[0].id;
      setSelectedFloor(resolved);
    }
  }, [floors, selectedFloor]);

  useEffect(() => {
    if (selectedFloor) {
      sessionStorage.setItem('posSelectedFloor', selectedFloor);
    }
  }, [selectedFloor]);

  const filteredTables = tables.filter(t => t.floor_id === selectedFloor && t.active);
  const pendingOrders = orders.filter(o => o.status === 'pending_confirmation');

  const handleTableClick = (table: TableType) => {
    if (table.status === 'pending_confirmation' || table.status === 'occupied') {
      // Don't allow new orders for pending or occupied tables
      return;
    }
    setOrderDialogTable(table);
    setIsOrderDialogOpen(true);
  };

  const getTableOrderCount = (tableId: string) => {
    return orders.filter(o => o.table_id === tableId && o.status === 'confirmed').length;
  };

  return (
    <POSLayout>
      <div className="flex h-full">
        {/* Main Floor View */}
        <div className="flex-1 flex flex-col p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <LayoutGrid className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-2xl font-bold">Floor View</h1>
            </div>
          </div>

          {/* Floor Tabs */}
          <Tabs value={selectedFloor} onValueChange={setSelectedFloor} className="flex-1 flex flex-col">
            <TabsList className="self-start mb-4">
              {floors.map((floor) => (
                <TabsTrigger key={floor.id} value={floor.id}>
                  {floor.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {floors.map((floor) => (
              <TabsContent key={floor.id} value={floor.id} className="flex-1 m-0">
                <div className="pos-grid">
                  {filteredTables.map((table) => (
                    <TableCard
                      key={table.id}
                      table={table}
                      onClick={handleTableClick}
                      orderCount={getTableOrderCount(table.id)}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Pending Orders Sidebar */}
        {pendingOrders.length > 0 && (
          <div className="w-96 border-l bg-muted/30 flex flex-col">
            <div className="p-4 border-b flex items-center gap-3">
              <Bell className="h-5 w-5 text-status-pending" />
              <h2 className="font-semibold">Pending Confirmation</h2>
              <Badge variant="secondary" className="bg-status-pending text-white">
                {pendingOrders.length}
              </Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {pendingOrders.map((order) => (
                  <PendingOrderCard key={order.id} order={order} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Order Dialog */}
      {orderDialogTable && (
        <OrderDialog
          table={orderDialogTable}
          open={isOrderDialogOpen}
          onOpenChange={(open) => setIsOrderDialogOpen(open)}
        />
      )}
    </POSLayout>
  );
}
