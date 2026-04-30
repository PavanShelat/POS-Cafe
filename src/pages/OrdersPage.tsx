import { useState } from 'react';
import { usePOS } from '@/context/POSContext';
import { POSLayout } from '@/components/pos/POSLayout';
import { Order } from '@/types/pos';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGetBlob } from '@/lib/api';
import {
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Smartphone,
  Monitor
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function OrdersPage() {
  const { orders, tables, config, deleteOrder } = usePOS();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [periodFilter, setPeriodFilter] = useState<'day' | 'week' | 'month' | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'customer'>('all');

  const now = new Date();
  const getPeriodStart = () => {
    if (periodFilter === 'day') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (periodFilter === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return start;
    }
    if (periodFilter === 'month') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      return start;
    }
    return null;
  };

  const handleDownloadInvoice = async (order: Order) => {
    const blob = await apiGetBlob(`/api/orders/${order.id}/invoice`);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${order.invoice_number}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const periodStart = getPeriodStart();
  const filteredOrders = orders.filter((order) => {
    if (sourceFilter !== 'all' && order.source !== sourceFilter) {
      return false;
    }
    if (periodStart && new Date(order.created_at) < periodStart) {
      return false;
    }
    return true;
  });

  const confirmedOrders = filteredOrders.filter((o) => o.status === 'confirmed');
  const pendingOrders = filteredOrders.filter((o) => o.status === 'pending_confirmation');
  const cancelledOrders = filteredOrders.filter((o) => o.status === 'cancelled');

  const OrderCard = ({ order }: { order: Order }) => {
    const table = tables.find((t) => t.id === order.table_id);
    return (
      <button
        type="button"
        onClick={() => setSelectedOrder(order)}
        className="order-card hover:shadow-card-hover text-left w-full"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{table?.table_number}</span>
              <Badge variant={order.source === 'customer' ? 'default' : 'secondary'} className="text-xs">
                {order.source === 'customer' ? (
                  <><Smartphone className="h-3 w-3 mr-1" /> QR</>
                ) : (
                  <><Monitor className="h-3 w-3 mr-1" /> POS</>
                )}
              </Badge>
            </div>
            {order.customer_name && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                <User className="h-3 w-3" />
                {order.customer_name}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="font-bold text-lg">{config.currency}{order.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">{order.invoice_number}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground mb-3">
          {order.items.map((item) => `${item.quantity} x ${item.product.name}`).join(', ')}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={cn(
              order.status === 'confirmed' && 'bg-status-completed',
              order.status === 'pending_confirmation' && 'bg-status-pending',
              order.status === 'cancelled' && 'bg-status-cancelled'
            )}
          >
            {order.status === 'confirmed' ? 'Confirmed' : order.status === 'pending_confirmation' ? 'Pending' : 'Cancelled'}
          </Badge>
          {order.status === 'confirmed' && (
            <Badge
              variant="outline"
              className={cn(
                order.kitchen_status === 'to_cook' && 'border-kitchen-to-cook text-kitchen-to-cook',
                order.kitchen_status === 'preparing' && 'border-kitchen-preparing text-kitchen-preparing',
                order.kitchen_status === 'completed' && 'border-kitchen-completed text-kitchen-completed'
              )}
            >
              {order.kitchen_status === 'to_cook' ? 'To Cook' : order.kitchen_status === 'preparing' ? 'Preparing' : 'Completed'}
            </Badge>
          )}
          <Badge className={cn(order.payment_status === 'paid' ? 'bg-status-completed' : 'bg-status-pending')}>
            {order.payment_status === 'paid' ? 'Paid' : 'Waiting Payment'}
          </Badge>
        </div>
      </button>
    );
  };

  return (
    <POSLayout>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Orders</h1>
        </div>
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as 'day' | 'week' | 'month' | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="day">Last Day</SelectItem>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as 'all' | 'pos' | 'customer')}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="customer">QR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="confirmed">
          <TabsList>
            <TabsTrigger value="confirmed" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Confirmed
              <Badge variant="secondary">{confirmedOrders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending
              {pendingOrders.length > 0 && (
                <Badge className="bg-status-pending">{pendingOrders.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-2">
              <XCircle className="h-4 w-4" />
              Cancelled
              <Badge variant="secondary">{cancelledOrders.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="confirmed" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {confirmedOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cancelled" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cancelledOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-xl">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between pr-8">
                    <span>Order Details</span>
                    <span className="text-sm text-muted-foreground font-normal">
                      {tables.find((t) => t.id === selectedOrder.table_id)?.table_number || 'Table'}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Source</p>
                      <p className="font-medium">{selectedOrder.source === 'customer' ? 'QR Customer' : 'POS'}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Payment</p>
                      <p className="font-medium">{selectedOrder.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Order Status</p>
                      <p className="font-medium">{selectedOrder.status}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Kitchen Status</p>
                      <p className="font-medium">{selectedOrder.kitchen_status}</p>
                    </div>
                  </div>

                  {(selectedOrder.customer_name || selectedOrder.customer_email || selectedOrder.customer_phone) && (
                    <div className="rounded-md border p-3 text-sm">
                      <p className="text-muted-foreground">Customer</p>
                      {selectedOrder.customer_name && <p className="font-medium">{selectedOrder.customer_name}</p>}
                      {selectedOrder.customer_email && <p className="text-muted-foreground mt-1">{selectedOrder.customer_email}</p>}
                      {selectedOrder.customer_phone && <p className="text-muted-foreground mt-1">{selectedOrder.customer_phone}</p>}
                    </div>
                  )}

                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium mb-2">Items</p>
                    <div className="space-y-2">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span>{item.quantity} x {item.product.name}</span>
                          <span>{config.currency}{(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-muted-foreground">Invoice Number</p>
                      <p className="font-medium">{selectedOrder.invoice_number}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-muted-foreground">Subtotal</p>
                      <p>{config.currency}{selectedOrder.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-muted-foreground">Discount</p>
                      <p>-{config.currency}{selectedOrder.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-muted-foreground">CGST ({selectedOrder.cgst_rate}%)</p>
                      <p>{config.currency}{selectedOrder.cgst_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-muted-foreground">SGST ({selectedOrder.sgst_rate}%)</p>
                      <p>{config.currency}{selectedOrder.sgst_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <p className="font-semibold">Total</p>
                      <p className="text-lg font-bold">{config.currency}{selectedOrder.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Placed {format(new Date(selectedOrder.created_at), 'PPP p')}
                  </p>
                  <Button variant="outline" onClick={() => handleDownloadInvoice(selectedOrder)}>
                    Download Invoice PDF
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!window.confirm('Delete this order?')) return;
                      await deleteOrder(selectedOrder.id);
                      setSelectedOrder(null);
                    }}
                  >
                    Delete Order
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </POSLayout>
  );
}
