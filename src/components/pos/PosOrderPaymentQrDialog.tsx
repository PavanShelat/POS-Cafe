import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, Copy, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PosOrderPaymentQrDialog({
  open,
  onOpenChange,
  tableNumber,
  order,
  payUrl,
  trackUrl,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNumber: string;
  order: { invoice_number: string; total_amount: number; payment_status: 'paid' | 'unpaid' } | null;
  payUrl: string;
  trackUrl: string;
  onCopy: () => void;
}) {
  const isPaid = order?.payment_status === 'paid';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Customer QR Payment</span>
            <span className="text-sm text-muted-foreground font-normal">{tableNumber}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {payUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-white rounded-xl border">
                <QRCodeSVG value={payUrl} size={220} level="H" includeMargin />
              </div>
              <code className="text-xs bg-muted px-2 py-1 rounded break-all max-w-full">{payUrl}</code>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground">Invoice</p>
              <p className="font-medium">{order?.invoice_number || '-'}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground">Payment</p>
              <p className={cn('font-medium flex items-center gap-1.5', isPaid ? 'text-status-completed' : 'text-status-pending')}>
                {isPaid ? <CheckCircle className="h-4 w-4" /> : null}
                {isPaid ? 'Paid' : 'Waiting'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCopy} disabled={!payUrl}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => window.open(trackUrl, '_blank')}
              disabled={!trackUrl}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Track
            </Button>
          </div>

          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            QR is unique for this order. Amount is locked.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

