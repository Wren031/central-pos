import * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/state/auth-context'
import { SuspendedScreen } from '@/features/auth/suspended-screen'
import { readRestoreContextFor } from '@/services/cloud-store-config-service'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, store, ready, accountStatus } = useAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  // A suspended account is blocked from EVERY protected route — including on a
  // refresh, an app restart, or a direct URL. Checked before the redirect so a
  // suspended user is never bounced to login and cannot slip through.
  if (accountStatus === 'suspended') {
    return <SuspendedScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // A signed-in account with no local workspace is normally sent to onboarding.
  // `/restore` must stay reachable: it is the ONE screen for an existing account
  // whose data lives on another device, and it is what prevents such a user from
  // being forced through onboarding (and re-choosing a POS type).
  const onboardingExempt = location.pathname === '/onboarding' || location.pathname === '/restore'
  if (!store?.onboarded && !onboardingExempt) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }
  if (user) {
    // An existing account that just signed in on a device with no local data is
    // routed to the restore screen. This redirect lives here (not only in the
    // login form) because it fires the instant the session appears — otherwise
    // this guard would race the login handler and send the user to onboarding.
    const pending = readRestoreContextFor(user.email)
    return <Navigate to={pending ? '/restore' : '/'} replace />
  }
  return <>{children}</>
}
