import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PaymentMethod, Order, Table, POSConfig } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, CreditCard, Loader2 } from 'lucide-react';

type PublicOrderResponse = { order: Order; table: Table; config: POSConfig };

const paymentMethods: { id: Extract<PaymentMethod, 'upi' | 'digital'>; label: string; description: string }[] = [
  { id: 'upi', label: 'UPI', description: 'Pay via UPI on Razorpay Checkout' },
  { id: 'digital', label: 'Card / Net Banking', description: 'Pay via Razorpay Checkout' },
];

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="checkout"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay Checkout')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpay = 'checkout';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load Razorpay Checkout')));
    document.body.appendChild(script);
  });
}

export default function PublicOrderPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id') || searchParams.get('orderId') || '';

  const [order, setOrder] = useState<Order | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [config, setConfig] = useState<POSConfig | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<Extract<PaymentMethod, 'upi' | 'digital'>>('upi');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const amountText = useMemo(() => {
    if (!order || !config) return '';
    return `${config.currency}${order.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [order, config]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orderId) {
        setError('Missing order_id in URL');
        setIsLoading(false);
        return;
      }

      try {
        const data = await apiGet<PublicOrderResponse>(`/api/public/orders/${orderId}`, { auth: false });
        if (cancelled) return;
        setOrder(data.order);
        setTable(data.table);
        setConfig(data.config);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Failed to load order');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const handlePay = async () => {
    if (!orderId || !order || !table || !config) return;
    if (order.payment_status === 'paid') {
      navigate(`/track-order?order_id=${encodeURIComponent(orderId)}`);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const razorpayData = await apiPost<{
        keyId: string;
        razorpayOrderId: string;
        amountPaise: number;
        currency: string;
        name: string;
      }>('/api/payments/razorpay/order', {
        orderId,
        payment_method: paymentMethod,
      }, { auth: false });

      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout failed to load');
      }

      const options: RazorpayCheckoutOptions = {
        key: razorpayData.keyId,
        order_id: razorpayData.razorpayOrderId,
        amount: razorpayData.amountPaise,
        currency: razorpayData.currency,
        name: razorpayData.name,
        description: `Order ${order.invoice_number}`,
        prefill: {
          name: order.customer_name || undefined,
          email: order.customer_email || undefined,
          contact: order.customer_phone || undefined,
        },
        notes: {
          app_order_id: orderId,
        },
        theme: { color: '#0f172a' },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
        handler: async (response) => {
          try {
            await apiPost('/api/payments/razorpay/verify', {
              orderId,
              ...response,
            }, { auth: false });

            setSuccess(true);
            setIsProcessing(false);

            setTimeout(() => {
              navigate(`/track-order?order_id=${encodeURIComponent(orderId)}`);
            }, 500);
          } catch (verifyErr) {
            const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
            setError(msg || 'Payment verification failed. Please contact staff.');
            setIsProcessing(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Payment failed');
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading order…
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-status-completed/20 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-status-completed" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Payment Successful</h1>
          <p className="text-muted-foreground">Redirecting to order tracking…</p>
        </div>
      </div>
    );
  }

  if (!order || !table || !config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-bold mb-2">Unable to Load Order</h1>
          <p className="text-muted-foreground">{error || 'Please scan the QR again or contact staff.'}</p>
        </div>
      </div>
    );
  }

  const isPaid = order.payment_status === 'paid';

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Pay for Order</span>
              <span className="text-sm text-muted-foreground">{table.table_number}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Invoice</p>
                <p className="font-medium">{order.invoice_number}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="text-xl font-bold">{amountText}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold mb-2">Order Summary</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-4">
                    <span className="truncate">{item.quantity}× {item.product.name}</span>
                    <span className="shrink-0">{config.currency}{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Payment Method</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as Extract<PaymentMethod, 'upi' | 'digital'>)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                {paymentMethods.map((m) => (
                  <Label key={m.id} htmlFor={`pay-${m.id}`} className="cursor-pointer">
                    <div className={cn('rounded-md border p-3 text-sm', paymentMethod === m.id && 'border-primary bg-primary/5')}>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id={`pay-${m.id}`} value={m.id} className="sr-only" />
                        <CreditCard className="h-4 w-4" />
                        <div>
                          <p className="font-medium">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                      </div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button className="w-full" onClick={handlePay} disabled={isProcessing}>
              {isPaid ? 'View Tracking' : isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Opening Checkout…
                </>
              ) : (
                'Proceed to Pay'
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Amount is locked. Do not refresh while payment is processing.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

