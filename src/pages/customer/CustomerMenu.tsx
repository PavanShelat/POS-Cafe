import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePOS } from '@/context/POSContext';
import { CartItem, Product } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  ShoppingCart,
  Plus,
  Minus,
  Coffee,
  ChevronRight,
  MapPin,
  Trash2,
  Lock,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';
import { calculateCartSubtotal, calculateTaxSummary } from '@/lib/tax';

export default function CustomerMenu() {
  const { tableToken } = useParams();
  const navigate = useNavigate();
  const { tables, allProducts: products, categories, config } = usePOS();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null); // null = loading
  const [sessionCheckDone, setSessionCheckDone] = useState(false);

  // Validate the customer session with the server on mount
  useEffect(() => {
    if (!tableToken) return;
    apiGet<{ valid: boolean; table?: object; customer_session_token?: string; reason?: string }>(
      `/api/customer/validate-session?qr_token=${tableToken}`
    ).then((data) => {
      if (data.valid && data.customer_session_token) {
        setSessionValid(true);
        sessionStorage.setItem('customerSessionToken', data.customer_session_token);
      } else {
        setSessionValid(false);
        sessionStorage.removeItem('customerSessionToken');
      }
      setSessionCheckDone(true);
    }).catch(() => {
      setSessionValid(false);
      setSessionCheckDone(true);
    });
  }, [tableToken]);

  // Find table by token (for display)
  const table = tables.find(t => t.qr_token === tableToken);

  if (tables.length === 0 || !sessionCheckDone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-spin" />
          <h1 className="text-xl font-bold mb-2">Loading...</h1>
          <p className="text-muted-foreground">Please wait a moment</p>
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Coffee className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid QR Code</h1>
          <p className="text-muted-foreground">Please scan a valid table QR code</p>
        </div>
      </div>
    );
  }

  // Session not active — cashier hasn't unlocked this table yet
  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Table Not Ready</h1>
          <p className="text-muted-foreground">
            This table's ordering is currently inactive.
            Please ask a staff member to unlock your table.
          </p>
          <div className="mt-4 px-3 py-2 bg-muted rounded-lg inline-block">
            <span className="text-sm font-medium text-muted-foreground">
              Table {table.table_number}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (table.status === 'occupied') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Coffee className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Table Occupied</h1>
          <p className="text-muted-foreground">This table currently has an active order. Please wait until it's available.</p>
        </div>
      </div>
    );
  }

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category === selectedCategory && p.active)
    : products.filter(p => p.active);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const cartSubtotal = calculateCartSubtotal(cart);
  const cartTaxSummary = calculateTaxSummary(cartSubtotal, 0, config.tax_rate);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleProceedToPayment = () => {
    sessionStorage.setItem('customerCart', JSON.stringify(cart));
    sessionStorage.setItem('customerTable', JSON.stringify(table));
    navigate(`/order/${tableToken}/payment`);
  };

  const getCartItemQuantity = (productId: string) => {
    const item = cart.find(i => i.product.id === productId);
    return item?.quantity || 0;
  };

  return (
    <div className="min-h-screen bg-muted/50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coffee className="h-6 w-6" />
            <span className="font-semibold">{config.restaurant_name}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-primary-foreground/20 rounded-full px-3 py-1">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-medium">{table.table_number}</span>
          </div>
        </div>
      </header>

      {/* Category Filter */}
      <div className="sticky top-[60px] z-30 bg-background border-b px-4 py-3">
        <div className="overflow-x-auto w-full">
          <div className="flex gap-2 whitespace-nowrap">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="shrink-0"
            >
              All
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className="shrink-0"
              >
                {cat.icon ? <span className="mr-1.5">{cat.icon}</span> : null}
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="p-4 space-y-3">
        {filteredProducts.map(product => {
          const qty = getCartItemQuantity(product.id);
          return (
            <div
              key={product.id}
              className={cn(
                'menu-item-card',
                qty > 0 && 'ring-2 ring-accent'
              )}
            >
              <div className="flex-1">
                <h3 className="font-semibold">{product.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                <p className="mt-2 font-bold text-accent">{config.currency}{product.price}</p>
              </div>

              {qty === 0 ? (
                <Button
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-full bg-accent hover:bg-accent/90"
                  onClick={() => addToCart(product)}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={() => updateQuantity(product.id, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center font-bold">{qty}</span>
                  <Button
                    size="icon"
                    className="h-8 w-8 rounded-full bg-accent hover:bg-accent/90"
                    onClick={() => updateQuantity(product.id, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cart Sheet */}
      {cartCount > 0 && (
        <Sheet>
          <SheetTrigger asChild>
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
              <Button className="w-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground shadow-elevated">
                <ShoppingCart className="h-5 w-5 mr-3" />
                <span className="flex-1 text-left">View Cart ({cartCount} items)</span>
                <span className="font-bold">{config.currency}{cartTaxSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </SheetTrigger>

          <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
            <SheetHeader className="pb-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Your Order
              </SheetTitle>
            </SheetHeader>

            <ScrollArea className="h-[calc(100%-180px)] mt-4">
              <div className="space-y-4 pr-4">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {config.currency}{item.product.price} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center font-medium">{item.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right w-20">
                      <p className="font-semibold">{config.currency}{(item.product.price * item.quantity).toLocaleString()}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Cart Summary */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{config.currency}{cartTaxSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">CGST ({cartTaxSummary.cgstRate}%)</span>
                <span className="font-medium">{config.currency}{cartTaxSummary.cgstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">SGST ({cartTaxSummary.sgstRate}%)</span>
                <span className="font-medium">{config.currency}{cartTaxSummary.sgstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-lg">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-xl">{config.currency}{cartTaxSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <Button
                className="w-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground text-lg"
                onClick={handleProceedToPayment}
              >
                Proceed to Payment
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
