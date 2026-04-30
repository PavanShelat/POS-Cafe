import { ReactNode } from 'react';
import { POSSidebar } from './POSSidebar';
import { PosPaymentQrOverlay } from '@/components/pos/PosPaymentQrOverlay';

interface POSLayoutProps {
  children: ReactNode;
}

export function POSLayout({ children }: POSLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <POSSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <PosPaymentQrOverlay />
    </div>
  );
}
