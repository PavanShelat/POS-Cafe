import { ReactNode } from 'react';
import { POSSidebar } from './POSSidebar';

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
    </div>
  );
}
