import * as React from 'react'
import {
  getCurrentUser,
  getStoreByUser,
  login as repoLogin,
  logout as repoLogout,
  markUserAccountStatus,
  registerUser,
  subscribeDb,
  syncSubscriptionNotifications,
} from '@/lib/repos'
import { healLocalAccountViaSupabase } from '@/services/supabase-account'
import { fetchAccountStatus, verifyAccountStatus } from '@/services/account-status-service'
import { refreshPosCatalog } from '@/services/pos-catalog-service'
import { isOnline, subscribeOnline } from '@/offline/connectivity'
import { nowIso } from '@/database/repos/helpers'
import {
  AccountSuspendedError,
  clearSuspendedMarker,
  readSuspendedMarker,
  writeSuspendedMarker,
  type AccountAccessStatus,
} from '@/lib/account-status'
import type { Store, User } from '@/lib/types'

interface AuthValue {
  user: User | null
  store: Store | null
  ready: boolean
  /**
   * Current account access status. `suspended` blocks the whole workspace;
   * `unverified` allows offline-first use while clearly flagging that the
   * current server status has not been confirmed.
   */
  accountStatus: AccountAccessStatus
  /** True while the account is blocked as suspended (session invalidated). */
  suspended: boolean
  /** Clear the block and return to sign-in (used by the suspended screen). */
  acknowledgeSuspension: () => void
  login: (email: string, password: string) => Promise<User>
  register: (input: {
    fullName: string
    address: string
    contactNumber: string
    businessName: string
    email: string
    password: string
  }) => Promise<User>
  logout: () => Promise<void>
  refresh: () => void
  setStoreLocal: (store: Store) => void
}

const AuthContext = React.createContext<AuthValue | null>(null)

/**
 * How often a signed-in, online device re-checks its status. Suspensions are
 * only noticed at login, session restore, reconnect, on focus/visible, and on
 * this interval — a device that stays online would otherwise never see an
 * admin suspending it mid-session.
 */
const RECHECK_INTERVAL_MS = 90_000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [store, setStore] = React.useState<Store | null>(null)
  const [ready, setReady] = React.useState(false)
  // Set as soon as a suspension is detected so the block applies even after the
  // local session has been deleted. Seeded from the persistent marker so a
  // suspension survives a reload instead of flashing the login page.
  const [forcedSuspended, setForcedSuspended] = React.useState(
    () => readSuspendedMarker() !== null
  )

  // While a sign-in is in flight we must NOT surface the freshly-created local
  // session: the account-status check runs afterward, and exposing the user
  // early would flash the workspace and swallow the suspension message.
  const pendingRef = React.useRef(false)
  // Once a suspension has forced a sign-out, don't keep re-logging out.
  const forcedRef = React.useRef(forcedSuspended)

  const refresh = React.useCallback(() => {
    if (pendingRef.current) return
    const u = getCurrentUser()
    setUser(u)
    setStore(u ? getStoreByUser(u.id) : null)
    if (u) void syncSubscriptionNotifications(u.id)
  }, [])

  React.useEffect(() => {
    refresh()
    setReady(true)
    const offDb = subscribeDb(refresh)
    const onClock = () => refresh()
    window.addEventListener('cpos:clock-changed', onClock)
    // Keep the admin-managed POS-type catalog fresh: fetch on startup and
    // whenever the device comes back online. Never touches business data.
    void refreshPosCatalog()
    const offOnline = subscribeOnline(() => void refreshPosCatalog())
    return () => {
      offDb()
      offOnline()
      window.removeEventListener('cpos:clock-changed', onClock)
    }
  }, [refresh])

  // Self-healing: if a persistent suspension marker exists, re-check it once so
  // an account an admin has REACTIVATED is not stuck on the block screen.
  React.useEffect(() => {
    const email = readSuspendedMarker()
    if (!email) return
    let cancelled = false
    void (async () => {
      const outcome = await fetchAccountStatus(email)
      if (cancelled || outcome !== 'active') return
      clearSuspendedMarker()
      forcedRef.current = false
      setForcedSuspended(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Verify the signed-in account against Supabase on startup (session restore),
  // every time connectivity returns, when the tab regains focus, and on a slow
  // interval. An authoritative `suspended` now HARD SIGNS THE USER OUT.
  const verifyingRef = React.useRef(false)
  React.useEffect(() => {
    const userId = user?.id
    if (!ready || !userId) return
    let cancelled = false

    const check = async () => {
      if (verifyingRef.current || forcedRef.current) return
      const current = getCurrentUser()
      if (!current || current.id !== userId) return
      verifyingRef.current = true
      let result
      try {
        // Best-effort and self-contained: never throws, never signs the user out
        // on a transient failure (which would cause a logout loop).
        result = await verifyAccountStatus(current)
      } finally {
        verifyingRef.current = false
      }
      if (cancelled) return

      if (result.status === 'suspended') {
        // Hard sign-out: invalidate the local session AND remember the block so
        // it survives a reload. Re-login (online or offline) stays blocked.
        forcedRef.current = true
        writeSuspendedMarker(current.email)
        setForcedSuspended(true)
        await repoLogout()
      } else if (result.status === 'active' && (forcedRef.current || readSuspendedMarker())) {
        // Reactivated while we were blocked — lift the block.
        forcedRef.current = false
        clearSuspendedMarker()
        setForcedSuspended(false)
      }

      if (!cancelled) refresh()
    }

    void check()
    const offOnline = subscribeOnline((online) => {
      if (online) void check()
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isOnline()) void check()
    }
    const interval = window.setInterval(() => {
      if (isOnline()) void check()
    }, RECHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      offOnline()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [ready, user?.id, refresh])

  const login = React.useCallback(
    async (email: string, password: string) => {
      pendingRef.current = true
      try {
        let u: User
        try {
          u = await repoLogin(email, password)
        } catch (err) {
          // Local sign-in failed. If this account was created through Supabase
          // Auth (verified email, no local record yet) we repair it online —
          // existing local accounts keep working fully offline.
          const healed = await healLocalAccountViaSupabase(email, password)
          if (!healed) throw err
          u = healed
        }

        // Authoritative online check BEFORE granting access.
        if (isOnline()) {
          const outcome = await fetchAccountStatus(u.email)
          if (outcome === 'suspended') {
            await markUserAccountStatus(u.id, 'suspended', nowIso())
            await repoLogout()
            throw new AccountSuspendedError()
          }
          if (outcome === 'active') {
            await markUserAccountStatus(u.id, 'active', nowIso())
            clearSuspendedMarker()
            forcedRef.current = false
            return u
          }
          // not_found / unknown / error — fall through to the cached status.
        }

        // Offline, or the server could not confirm: a cached suspension still
        // blocks access, so disconnecting never restores a suspended account.
        if (u.accountStatus === 'suspended') {
          await repoLogout()
          throw new AccountSuspendedError()
        }

        return u
      } finally {
        // Release the gate only after the decision is made, then surface the
        // resulting session state (signed-in user, or null after a block).
        pendingRef.current = false
        refresh()
      }
    },
    [refresh]
  )

  const register = React.useCallback(
    async (input: Parameters<typeof registerUser>[0]) => {
      const u = await registerUser(input)
      refresh()
      return u
    },
    [refresh]
  )

  const logout = React.useCallback(async () => {
    await repoLogout()
    refresh()
  }, [refresh])

  const acknowledgeSuspension = React.useCallback(() => {
    clearSuspendedMarker()
    forcedRef.current = false
    setForcedSuspended(false)
  }, [])

  const setStoreLocal = React.useCallback((s: Store) => setStore(s), [])

  const suspended = forcedSuspended || user?.accountStatus === 'suspended'

  const accountStatus = React.useMemo<AccountAccessStatus>(() => {
    if (suspended) return 'suspended'
    if (!user) return 'unknown'
    if (user.accountStatus === 'active') return 'active'
    return 'unverified'
  }, [suspended, user])

  const value = React.useMemo(
    () => ({
      user,
      store,
      ready,
      accountStatus,
      suspended,
      acknowledgeSuspension,
      login,
      register,
      logout,
      refresh,
      setStoreLocal,
    }),
    [
      user,
      store,
      ready,
      accountStatus,
      suspended,
      acknowledgeSuspension,
      login,
      register,
      logout,
      refresh,
      setStoreLocal,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
