import * as React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { DatabaseGate } from '@/components/common/database-gate'
import { AppShell } from '@/components/layout/app-shell'
import { LoginPage } from '@/features/auth/login-page'
import { RegisterPage } from '@/features/auth/register-page'
import { ConfirmPage } from '@/features/auth/confirm-page'
import { OnboardingPage } from '@/features/onboarding/onboarding-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { SubscriptionPage } from '@/features/subscription/subscription-page'
import { CatalogPage } from '@/features/pos/catalog-page'
import { InventoryPage } from '@/features/pos/inventory-page'
import { OrdersPage } from '@/features/pos/orders-page'
import { PosOverviewPage } from '@/features/pos/pos-overview-page'
import { PosSettingsPage } from '@/features/pos/pos-settings-page'
import { ReportsPage } from '@/features/pos/reports-page'
import { ProfilePage } from '@/features/profile/profile-page'
import { CartProvider } from '@/features/pos/cart-context'
import { NotFoundPage } from '@/routes/not-found-page'
import { ProtectedRoute, PublicOnly } from '@/routes/guards'
import { SuspendedScreen } from '@/features/auth/suspended-screen'
import { AuthProvider, useAuth } from '@/state/auth-context'
import { SubscriptionProvider } from '@/state/subscription-context'
import { DbReadyProvider } from '@/hooks/use-db-ready'

/**
 * Global guard: a suspended account is blocked on EVERY route (including
 * /login) before any route element renders, so the restriction cannot be
 * bypassed by refreshing, reopening, or navigating directly to a protected URL.
 */
function SuspensionGate({ children }: { children: React.ReactNode }) {
  const { suspended } = useAuth()
  if (suspended) return <SuspendedScreen />
  return <>{children}</>
}

export default function App() {
  return (
    <DbReadyProvider>
      <DatabaseGate>
        <BrowserRouter>
          <AuthProvider>
            <SubscriptionProvider>
              <CartProvider>
                <SuspensionGate>
                  <Routes>
                    <Route
                      path="/login"
                      element={
                        <PublicOnly>
                          <LoginPage />
                        </PublicOnly>
                      }
                    />
                    <Route
                      path="/register"
                      element={
                        <PublicOnly>
                          <RegisterPage />
                        </PublicOnly>
                      }
                    />
                    <Route path="/auth/confirm" element={<ConfirmPage />} />
                    <Route
                      path="/onboarding"
                      element={
                        <ProtectedRoute>
                          <OnboardingPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      element={
                        <ProtectedRoute>
                          <AppShell />
                        </ProtectedRoute>
                      }
                    >
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/subscription" element={<SubscriptionPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/pos" element={<PosOverviewPage />} />
                      <Route path="/pos/catalog" element={<CatalogPage />} />
                      <Route path="/pos/inventory" element={<InventoryPage />} />
                      <Route path="/pos/orders" element={<OrdersPage />} />
                      <Route path="/pos/reports" element={<ReportsPage />} />
                      <Route path="/pos/settings" element={<PosSettingsPage />} />
                    </Route>
                    <Route path="/home" element={<Navigate to="/" replace />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </SuspensionGate>
                <Toaster position="top-center" richColors closeButton />
              </CartProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </BrowserRouter>
      </DatabaseGate>
    </DbReadyProvider>
  )
}
