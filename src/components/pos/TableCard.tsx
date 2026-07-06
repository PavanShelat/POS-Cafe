import { Table, TableStatus } from '@/types/pos';
import { cn } from '@/lib/utils';
import { Users, Clock, AlertCircle, Lock, Unlock, CheckCircle2 } from 'lucide-react';
import { usePOS } from '@/context/POSContext';

interface TableCardProps {
  table: Table;
  onClick: (table: Table) => void;
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

export function TableCard({ table, onClick }: TableCardProps) {
  const { openCustomerSession, closeCustomerSession, releaseTable } = usePOS();
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

  const handleRelease = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await releaseTable(table.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (table.status === 'occupied' || table.status === 'pending_confirmation') {
          return;
        }
        onClick(table);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (table.status === 'occupied' || table.status === 'pending_confirmation') return;
        e.preventDefault();
        onClick(table);
      }}
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
            'inline-flex px-2 py-0.5 rounded-full text-xs font-medium self-start',
            table.status === 'available' && 'bg-status-available text-white',
            table.status === 'occupied' && 'bg-status-occupied text-white',
            table.status === 'pending_confirmation' && 'bg-status-pending text-white'
          )}
        >
          {config.label}
        </span>

        <div className="flex items-center justify-between gap-2 w-full px-1">
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

          {table.status === 'occupied' && (
            <button
              onClick={handleRelease}
              title="Mark table as available"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-status-available text-white hover:bg-status-available/90"
            >
              <CheckCircle2 className="h-3 w-3" /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
