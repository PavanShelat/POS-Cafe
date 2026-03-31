import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { POSProvider } from "@/context/POSContext";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// POS Pages
import FloorView from "./pages/FloorView";
import OrdersPage from "./pages/OrdersPage";
import KitchenDisplay from "./pages/KitchenDisplay";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import StaffManagementPage from "./pages/StaffManagementPage";

// Customer Pages
import CustomerMenu from "./pages/customer/CustomerMenu";
import CustomerPayment from "./pages/customer/CustomerPayment";
import CustomerOrderStatus from "./pages/customer/CustomerOrderStatus";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <POSProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />

              {/* POS Routes - Admin & Cashier */}
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

              {/* Customer QR Ordering Routes - No auth needed */}
              <Route path="/order/:tableToken" element={<CustomerMenu />} />
              <Route path="/order/:tableToken/payment" element={<CustomerPayment />} />
              <Route path="/order/:tableToken/status" element={<CustomerOrderStatus />} />

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </POSProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
