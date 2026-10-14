import * as React from 'react'
import {
  getCurrentUser,
  getStoreByUser,
  login as repoLogin,
  logout as repoLogout,
  registerUser,
  subscribeDb,
  syncSubscriptionNotifications,
} from '@/lib/repos'
import { healLocalAccountViaSupabase } from '@/services/supabase-account'
import type { Store, User } from '@/lib/types'

interface AuthValue {
  user: User | null
  store: Store | null
  ready: boolean
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [store, setStore] = React.useState<Store | null>(null)
  const [ready, setReady] = React.useState(false)

  const refresh = React.useCallback(() => {
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
    return () => {
      offDb()
      window.removeEventListener('cpos:clock-changed', onClock)
    }
  }, [refresh])

  const login = React.useCallback(
    async (email: string, password: string) => {
      try {
        const u = await repoLogin(email, password)
        refresh()
        return u
      } catch (err) {
        // Local sign-in failed. If this account was created through Supabase
        // Auth (verified email, no local record yet) we repair it online —
        // existing local accounts keep working fully offline.
        const healed = await healLocalAccountViaSupabase(email, password)
        if (healed) {
          refresh()
          return healed
        }
        throw err
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

  const setStoreLocal = React.useCallback((s: Store) => setStore(s), [])

  const value = React.useMemo(
    () => ({ user, store, ready, login, register, logout, refresh, setStoreLocal }),
    [user, store, ready, login, register, logout, refresh, setStoreLocal]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
