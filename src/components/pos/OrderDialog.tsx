import { useEffect, useState } from 'react';
import { usePOS } from '@/context/POSContext';
import { PaymentMethod, Table as TableType } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Plus, Minus, ShoppingCart, Send, CreditCard, QrCode, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateTaxSummary } from '@/lib/tax';

interface OrderDialogProps {
  table: TableType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDialog({ table, open, onOpenChange }: OrderDialogProps) {
  const {
    allProducts,
    categories,
    cart,
    addToCart,
    updateCartQuantity,
    clearCart,
    cartTotal,
    createOrder,
    config
  } = usePOS();

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');

  useEffect(() => {
    if (!selectedCategory && categories.length > 0) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (!open) {
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setDiscount('0');
      setPaymentMethod('cash');
    }
  }, [open]);

  const taxSummary = calculateTaxSummary(cartTotal, Number(discount || 0), config.tax_rate);
  const isCustomerNameValid = customerName.trim().length > 0;
  const isCustomerEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());

  const handleSubmitOrder = async () => {
    if (cart.length > 0 && isCustomerNameValid && isCustomerEmailValid) {
      await createOrder(table.id, cart, 'pos', {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || undefined,
        discount: Number(discount || 0),
        paymentStatus: 'paid',
        paymentMethod,
      });
      clearCart();
      onOpenChange(false);
    }
  };

  const getCartItemQuantity = (productId: string) => {
    const item = cart.find(i => i.product.id === productId);
    return item?.quantity || 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl font-bold">{table.table_number}</span>
            <span className="text-muted-foreground font-normal">New Order</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Menu Section */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 border-r">
            {/* Categories */}
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex flex-col h-full">
              <ScrollArea className="w-full border-b">
                <TabsList className="w-max justify-start gap-1 px-4 py-3 bg-muted/50 rounded-none">
                  {categories.map((cat) => {
                    const showIcon = Boolean(cat.icon && /[^a-zA-Z0-9 ]/.test(cat.icon));
                    return (
                      <TabsTrigger
                        key={cat.id}
                        value={cat.id}
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        {showIcon ? <span className="mr-1.5">{cat.icon}</span> : null}
                        {cat.name}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </ScrollArea>

              {categories.map((cat) => {
                const categoryProducts = allProducts.filter(
                  (product) => product.category === cat.id && product.active
                );
                return (
                  <TabsContent key={cat.id} value={cat.id} className="flex-1 m-0 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                        {categoryProducts.map((product) => {
                          const qty = getCartItemQuantity(product.id);
                          return (
                            <div
                              key={product.id}
                              className={cn(
                                'relative p-4 rounded-xl border-2 transition-all cursor-pointer',
                                qty > 0
                                  ? 'border-accent bg-accent/5'
                                  : 'border-border hover:border-accent/50 hover:bg-muted/50'
                              )}
                              onClick={() => addToCart(product)}
                            >
                              {qty > 0 && (
                                <span className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                                  {qty}
                                </span>
                              )}
                              <h4 className="font-medium">{product.name}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-1">{product.description}</p>
                              <p className="mt-2 font-semibold text-accent">{config.currency}{product.price}</p>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          {/* Cart Section */}
          <div className="w-full lg:w-[340px] shrink-0 flex flex-col min-h-0 bg-muted/30">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                <span className="font-semibold">Order</span>
              </div>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive">
                  Clear
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Add items to order</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3 bg-card p-3 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {config.currency}{item.product.price} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCartQuantity(item.product.id, item.quantity - 1);
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center font-medium">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCartQuantity(item.product.id, item.quantity + 1);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Cart Footer */}
            <div className="border-t p-4 space-y-3 overflow-y-auto max-h-[40vh]">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pos-customer-name" className="text-xs text-muted-foreground">Customer Name *</Label>
                  <Input
                    id="pos-customer-name"
                    placeholder="Required"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos-customer-email" className="text-xs text-muted-foreground">Customer Email *</Label>
                  <Input
                    id="pos-customer-email"
                    type="email"
                    placeholder="Required"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos-customer-phone" className="text-xs text-muted-foreground">Customer Phone</Label>
                  <Input
                    id="pos-customer-phone"
                    placeholder="Optional"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos-discount" className="text-xs text-muted-foreground">Discount</Label>
                  <Input
                    id="pos-discount"
                    type="number"
                    min="0"
                    max={cartTotal}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Payment Method</Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                  className="grid grid-cols-3 gap-2"
                >
                  <Label htmlFor="pay-cash" className="cursor-pointer">
                    <div className={cn("rounded-md border p-2 text-center text-xs", paymentMethod === 'cash' && 'border-primary bg-primary/5')}>
                      <RadioGroupItem id="pay-cash" value="cash" className="sr-only" />
                      <Wallet className="h-4 w-4 mx-auto mb-1" />
                      Cash
                    </div>
                  </Label>
                  <Label htmlFor="pay-digital" className="cursor-pointer">
                    <div className={cn("rounded-md border p-2 text-center text-xs", paymentMethod === 'digital' && 'border-primary bg-primary/5')}>
                      <RadioGroupItem id="pay-digital" value="digital" className="sr-only" />
                      <CreditCard className="h-4 w-4 mx-auto mb-1" />
                      Card
                    </div>
                  </Label>
                  <Label htmlFor="pay-upi" className="cursor-pointer">
                    <div className={cn("rounded-md border p-2 text-center text-xs", paymentMethod === 'upi' && 'border-primary bg-primary/5')}>
                      <RadioGroupItem id="pay-upi" value="upi" className="sr-only" />
                      <QrCode className="h-4 w-4 mx-auto mb-1" />
                      UPI
                    </div>
                  </Label>
                </RadioGroup>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{config.currency}{taxSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-semibold">-{config.currency}{taxSummary.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">CGST ({taxSummary.cgstRate}%)</span>
                <span className="font-semibold">{config.currency}{taxSummary.cgstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">SGST ({taxSummary.sgstRate}%)</span>
                <span className="font-semibold">{config.currency}{taxSummary.sgstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-lg">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-xl">{config.currency}{taxSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <Button 
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={cart.length === 0 || !isCustomerNameValid || !isCustomerEmailValid}
                onClick={handleSubmitOrder}
              >
                <Send className="h-4 w-4 mr-2" />
                Pay & Send to Kitchen
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
