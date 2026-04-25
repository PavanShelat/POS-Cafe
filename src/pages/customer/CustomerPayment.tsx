import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CartItem, Table as TableType, PaymentMethod } from '@/types/pos';
import { usePOS } from '@/context/POSContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiPost } from '@/lib/api';
import { calculateCartSubtotal, calculateTaxSummary } from '@/lib/tax';
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  CheckCircle,
  Coffee,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

const paymentMethods: { id: PaymentMethod; label: string; icon: typeof CreditCard; description: string }[] = [
  { id: 'upi', label: 'UPI', icon: CreditCard, description: 'Pay via UPI on Razorpay Checkout' },
  { id: 'digital', label: 'Card / Net Banking', icon: CreditCard, description: 'Pay via Razorpay Checkout' },
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

export default function CustomerPayment() {
  const { tableToken } = useParams();
  const navigate = useNavigate();
  const { config } = usePOS();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [table, setTable] = useState<TableType | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const storedCart = sessionStorage.getItem('customerCart');
    const storedTable = sessionStorage.getItem('customerTable');

    if (storedCart && storedTable) {
      setCart(JSON.parse(storedCart));
      setTable(JSON.parse(storedTable));
    }
  }, []);

  const cartSubtotal = calculateCartSubtotal(cart);
  const cartTaxSummary = calculateTaxSummary(cartSubtotal, 0, config.tax_rate);
  const isCustomerNameValid = customerName.trim().length > 0;
  const isCustomerEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());

  const handlePayment = async () => {
    if (!isCustomerNameValid || !isCustomerEmailValid) {
      setSessionError('Name and valid email are required to place the order.');
      return;
    }

    setIsProcessing(true);
    setSessionError(null);

    const customerSessionToken = sessionStorage.getItem('customerSessionToken');

    if (!customerSessionToken) {
      setSessionError('Your ordering session has expired. Please ask a staff member to unlock your table again.');
      setIsProcessing(false);
      return;
    }

    if (table) {
      try {
        let orderId = sessionStorage.getItem('customerPendingOrderId');

        if (!orderId) {
          const data = await apiPost<{ order: { id: string } }>('/api/orders', {
            table_id: table.id,
            source: 'customer',
            customer_name: customerName.trim(),
            customer_email: customerEmail.trim(),
            customer_phone: customerPhone || undefined,
            discount: 0,
            payment_status: 'unpaid',
            payment_method: paymentMethod,
            customer_session_token: customerSessionToken,
            items: cart.map(item => ({
              product_id: item.product.id,
              quantity: item.quantity,
              notes: item.notes,
            })),
          }, { auth: false });
          orderId = data.order.id;
          sessionStorage.setItem('customerPendingOrderId', orderId);
        }

        const razorpayData = await apiPost<{
          keyId: string;
          razorpayOrderId: string;
          amountPaise: number;
          currency: string;
          name: string;
        }>('/api/payments/razorpay/order', {
          orderId,
          payment_method: paymentMethod,
          customer_session_token: customerSessionToken,
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
          description: `Table ${table.table_number}`,
          prefill: {
            name: customerName.trim(),
            email: customerEmail.trim(),
            contact: customerPhone || undefined,
          },
          notes: {
            app_order_id: orderId,
            table_token: tableToken || '',
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
                customer_session_token: customerSessionToken,
                ...response,
              }, { auth: false });

              sessionStorage.setItem('customerOrderId', orderId);
              sessionStorage.removeItem('customerPendingOrderId');

              sessionStorage.removeItem('customerCart');
              sessionStorage.removeItem('customerTable');

              setIsSuccess(true);
              setIsProcessing(false);

              setTimeout(() => {
                navigate(`/order/${tableToken}/status`);
              }, 500);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              setSessionError(msg || 'Payment verification failed. Please try again.');
              setIsProcessing(false);
            }
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('403') || msg.toLowerCase().includes('session') || msg.toLowerCase().includes('token')) {
          setSessionError('Your ordering session has expired. Please ask a staff member to unlock your table again.');
        } else {
          setSessionError(msg || 'Payment failed. Please try again.');
        }
        setIsProcessing(false);
        return;
      }
    }

    setIsProcessing(false);
  };

  if (!table || cart.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Coffee className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">No Order Found</h1>
          <p className="text-muted-foreground mb-4">Your cart is empty</p>
          <Button onClick={() => navigate(`/order/${tableToken}`)}>
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-status-completed/20 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-status-completed" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Payment Successful!</h1>
          <p className="text-muted-foreground">Your order has been placed</p>
          <p className="text-sm text-muted-foreground mt-2">Redirecting to order status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Payment</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        <div className="bg-card rounded-xl p-4 shadow-card">
          <h2 className="font-semibold mb-3">Order Summary</h2>
          <div className="space-y-2 mb-4">
            {cart.map(item => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.product.name}</span>
                <span>{config.currency}{(item.product.price * item.quantity).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{config.currency}{cartTaxSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">CGST ({cartTaxSummary.cgstRate}%)</span>
              <span>{config.currency}{cartTaxSummary.cgstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">SGST ({cartTaxSummary.sgstRate}%)</span>
              <span>{config.currency}{cartTaxSummary.sgstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold">{config.currency}{cartTaxSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
          <Label htmlFor="name">Your Name *</Label>
          <Input
            id="name"
            placeholder="Enter your name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
          <Label htmlFor="phone">Phone Number (optional)</Label>
          <Input
            id="phone"
            placeholder="Enter your phone number"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card">
          <h2 className="font-semibold mb-4">Payment Method</h2>
          <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
            <div className="space-y-3">
              {paymentMethods.map(method => (
                <label
                  key={method.id}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
                    paymentMethod === method.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  )}
                >
                  <RadioGroupItem value={method.id} id={method.id} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <method.icon className="h-5 w-5 text-accent" />
                      <span className="font-medium">{method.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{method.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </RadioGroup>
        </div>

        {paymentMethod === 'upi' && (
          <div className="bg-card rounded-xl p-6 shadow-card text-center">
            <p className="text-sm text-muted-foreground">
              You will be redirected to Razorpay Checkout to complete your UPI payment.
            </p>
          </div>
        )}

        {sessionError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{sessionError}</p>
          </div>
        )}

        <Button
          className="w-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground text-lg"
          onClick={handlePayment}
          disabled={isProcessing || !isCustomerNameValid || !isCustomerEmailValid}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Pay {config.currency}{cartTaxSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
