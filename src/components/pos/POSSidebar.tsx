import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutGrid, 
  ClipboardList, 
  ChefHat, 
  Settings, 
  BarChart3,
  Coffee,
  LogOut,
  Shield,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePOS } from '@/context/POSContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const allNavItems = [
  { href: '/', label: 'Floor View', icon: LayoutGrid, roles: ['admin', 'cashier'] },
  { href: '/orders', label: 'Orders', icon: ClipboardList, roles: ['admin', 'cashier'] },
  { href: '/kitchen', label: 'Kitchen', icon: ChefHat, roles: ['admin', 'kitchen'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin'] },
  { href: '/staff', label: 'Staff', icon: Users, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export function POSSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, config } = usePOS();
  const { role, signOut, user } = useAuth();

  const navItems = allNavItems.filter(item => !role || item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary">
          <Coffee className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-sm">{config.restaurant_name}</h1>
          <p className="text-xs text-sidebar-foreground/60">POS Terminal</p>
        </div>
      </div>

      {/* Session Status */}
      {session?.is_active && (
        <div className="mx-4 mt-4 rounded-lg bg-sidebar-accent p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-sidebar-foreground/70">Session Active</span>
            <span className="h-2 w-2 rounded-full bg-status-available animate-pulse" />
          </div>
          <p className="mt-1 text-lg font-semibold">{config.currency}{session.total_sales.toLocaleString()}</p>
          <p className="text-xs text-sidebar-foreground/60">{session.orders_count} orders</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4 space-y-2">
        {user && (
          <div className="px-3 py-2 text-xs text-sidebar-foreground/60">
            <p className="font-medium text-sidebar-foreground/80">{user.email}</p>
            <p className="capitalize">{role || 'staff'}</p>
          </div>
        )}
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
