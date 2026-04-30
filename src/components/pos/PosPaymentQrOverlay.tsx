import { useEffect, useMemo, useState } from 'react';
import { usePOS } from '@/context/POSContext';
import { PosOrderPaymentQrDialog } from '@/components/pos/PosOrderPaymentQrDialog';

const STORAGE_ORDER_ID = 'posQrOrderId';
const STORAGE_OPEN = 'posQrOpen';

export function PosPaymentQrOverlay() {
  const { orders, tables } = usePOS();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    const storedOrderId = sessionStorage.getItem(STORAGE_ORDER_ID);
    const storedOpen = sessionStorage.getItem(STORAGE_OPEN);
    if (storedOrderId) {
      setOrderId(storedOrderId);
      setOpen(storedOpen === '1');
    }
  }, []);

  const order = orderId ? orders.find((o) => o.id === orderId) : null;
  const tableNumber = useMemo(() => {
    if (!order) return 'Table';
    return tables.find((t) => t.id === order.table_id)?.table_number || 'Table';
  }, [order, tables]);

  const payUrl = orderId ? `${window.location.origin}/pay?order_id=${encodeURIComponent(orderId)}` : '';
  const trackUrl = orderId ? `${window.location.origin}/track-order?order_id=${encodeURIComponent(orderId)}` : '';

  const copyPayUrl = async () => {
    if (!payUrl) return;
    try {
      await navigator.clipboard.writeText(payUrl);
    } catch {
      window.prompt('Copy this link:', payUrl);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      sessionStorage.setItem(STORAGE_OPEN, '1');
    } else {
      sessionStorage.removeItem(STORAGE_OPEN);
      sessionStorage.removeItem(STORAGE_ORDER_ID);
      setOrderId(null);
    }
  };

  return (
    <PosOrderPaymentQrDialog
      open={open}
      onOpenChange={handleOpenChange}
      tableNumber={tableNumber}
      order={order ? { invoice_number: order.invoice_number, total_amount: order.total_amount, payment_status: order.payment_status } : null}
      payUrl={payUrl}
      trackUrl={trackUrl}
      onCopy={() => void copyPayUrl()}
    />
  );
}

