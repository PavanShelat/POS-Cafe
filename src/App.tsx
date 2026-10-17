import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { POSProvider } from "@/context/POSContext";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Pages load on demand, so a customer scanning a table QR never downloads the
// staff screens (reports, charts, settings) and vice versa.

// POS Pages
const FloorView = lazy(() => import("./pages/FloorView"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const StaffManagementPage = lazy(() => import("./pages/StaffManagementPage"));

// Customer Pages
const CustomerMenu = lazy(() => import("./pages/customer/CustomerMenu"));
const CustomerPayment = lazy(() => import("./pages/customer/CustomerPayment"));
const CustomerOrderStatus = lazy(() => import("./pages/customer/CustomerOrderStatus"));
const PublicOrderPayment = lazy(() => import("./pages/PublicOrderPayment"));
const PublicOrderTracking = lazy(() => import("./pages/PublicOrderTracking"));

const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

// Staff data (bootstrap polling) only loads once someone with a role is signed in.
const StaffShell = () => (
  <ProtectedRoute>
    <POSProvider>
      <Outlet />
    </POSProvider>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />

              {/* POS Routes - Admin & Cashier */}
              <Route element={<StaffShell />}>
                <Route path="/" element={
                  <ProtectedRoute allowedRoles={['admin', 'cashier']}>
                    <FloorView />
                  </ProtectedRoute>
                } />
                <Route path="/orders" element={
                  <ProtectedRoute allowedRoles={['admin', 'cashier']}>
                    <OrdersPage />
                  </ProtectedRoute>
                } />
                <Route path="/kitchen" element={
                  <ProtectedRoute allowedRoles={['admin', 'kitchen']}>
                    <KitchenDisplay />
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ReportsPage />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <SettingsPage />
                  </ProtectedRoute>
                } />
                <Route path="/staff" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <StaffManagementPage />
                  </ProtectedRoute>
                } />
              </Route>

              {/* Customer QR Ordering Routes - No auth needed */}
              <Route path="/order/:tableToken" element={<CustomerMenu />} />
              <Route path="/order/:tableToken/payment" element={<CustomerPayment />} />
              <Route path="/order/:tableToken/status" element={<CustomerOrderStatus />} />
              <Route path="/pay" element={<PublicOrderPayment />} />
              <Route path="/track-order" element={<PublicOrderTracking />} />

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
