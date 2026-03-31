import { Table, TableStatus } from '@/types/pos';
import { cn } from '@/lib/utils';
import { Users, Clock, AlertCircle, Lock, Unlock } from 'lucide-react';
import { usePOS } from '@/context/POSContext';

interface TableCardProps {
  table: Table;
  onClick: (table: Table) => void;
  orderCount?: number;
}

const statusConfig: Record<TableStatus, { label: string; className: string; icon?: typeof Clock }> = {
  available: {
    label: 'Available',
    className: 'border-status-available bg-status-available/10 hover:bg-status-available/20',
  },
  occupied: {
    label: 'Occupied',
    className: 'border-status-occupied bg-status-occupied/10 hover:bg-status-occupied/20',
    icon: Clock,
  },
  pending_confirmation: {
    label: 'Pending',
    className: 'border-status-pending bg-status-pending/10 hover:bg-status-pending/20 pulse-subtle',
    icon: AlertCircle,
  },
};

export function TableCard({ table, onClick, orderCount = 0 }: TableCardProps) {
  const { openCustomerSession, closeCustomerSession } = usePOS();
  const config = statusConfig[table.status];
  const StatusIcon = config.icon;
  const isUnlocked = Boolean(table.customer_session_token);

  const handleLockToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnlocked) {
      await closeCustomerSession(table.id);
    } else {
      await openCustomerSession(table.id);
    }
  };

  return (
    <button
      onClick={() => onClick(table)}
      disabled={table.status === 'occupied' || table.status === 'pending_confirmation'}
      className={cn(
        'table-card min-h-[152px]',
        config.className,
        (table.status === 'occupied' || table.status === 'pending_confirmation') && 'opacity-70 cursor-not-allowed'
      )}
    >
      {StatusIcon && (
        <div className="absolute top-2 right-2">
          <StatusIcon
            className={cn(
              'h-4 w-4',
              table.status === 'pending_confirmation' ? 'text-status-pending' : 'text-status-occupied'
            )}
          />
        </div>
      )}

      <div className="text-3xl font-bold text-foreground mb-2">
        {table.table_number}
      </div>

      <div className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
        <Users className="h-4 w-4" />
        <span>{table.seats} seats</span>
      </div>

      <div className="mt-3 space-y-2">
        <span
          className={cn(
            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
            table.status === 'available' && 'bg-status-available text-white',
            table.status === 'occupied' && 'bg-status-occupied text-white',
            table.status === 'pending_confirmation' && 'bg-status-pending text-white'
          )}
        >
          {config.label}
        </span>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleLockToggle}
            title={isUnlocked ? 'QR ordering is ON - tap to lock' : 'QR ordering is OFF - tap to unlock'}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
              isUnlocked
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {isUnlocked ? (
              <>
                <Unlock className="h-3 w-3" /> Open
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" /> Locked
              </>
            )}
          </button>

          <div className="min-w-[52px] text-right text-xs text-muted-foreground">
            {orderCount > 0 ? `${orderCount} order${orderCount > 1 ? 's' : ''}` : ''}
          </div>
        </div>
      </div>
    </button>
  );
}
