import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AdminShell } from '@/components/layout/admin-shell'
import { RequireAuth } from '@/routes/guards'
import { AuthProvider } from '@/state/auth-context'
import { LoginPage } from '@/features/auth/login-page'
import { LandingPage } from '@/features/landing/landing-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { UsersPage } from '@/features/users/users-page'
import { UserDetailPage } from '@/features/users/user-detail-page'
import { StoresPage } from '@/features/stores/stores-page'
import { StoreDetailPage } from '@/features/stores/store-detail-page'
import { SubscriptionsPage } from '@/features/subscriptions/subscriptions-page'
import { PaymentsPage } from '@/features/payments/payments-page'
import { PosTypesPage } from '@/features/pos-types/pos-types-page'
import { PosTypeCategoriesPage } from '@/features/pos-types/pos-type-categories-page'
import { DownloadsPage } from '@/features/downloads/downloads-page'
import { LogsPage } from '@/features/logs/logs-page'
import { SettingsPage } from '@/features/settings/settings-page'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AdminShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:userId" element={<UserDetailPage />} />
              <Route path="/stores" element={<StoresPage />} />
              <Route path="/stores/:storeId" element={<StoreDetailPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/pos-types" element={<PosTypesPage />} />
              <Route path="/pos-types/:posTypeId/categories" element={<PosTypeCategoriesPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  )
}
