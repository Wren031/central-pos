import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import type { Profile } from '@/lib/types'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  login: (email: string, password: string) => Promise<Profile>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(errorMessage(error))
  return (data as Profile | null) ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [loading, setLoading] = React.useState(true)

  const applySession = React.useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setProfile(null)
      return
    }
    try {
      setProfile(await fetchProfile(s.user.id))
    } catch {
      setProfile(null)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!cancelled) await applySession(data.session)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      void applySession(s)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [applySession])

  const login = React.useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error) throw new Error(errorMessage(error, 'Sign in failed.'))
      const p = await fetchProfile(data.user.id)
      if (!p) {
        await supabase.auth.signOut()
        throw new Error('No profile exists for this account.')
      }
      if (p.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('This account does not have admin access.')
      }
      if (p.status !== 'active') {
        await supabase.auth.signOut()
        throw new Error('This admin account is suspended. Contact support.')
      }
      setSession(data.session)
      setProfile(p)
      return p
    },
    []
  )

  const logout = React.useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const refreshProfile = React.useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) setProfile(await fetchProfile(user.id))
  }, [])

  const value = React.useMemo(
    () => ({ session, profile, loading, login, logout, refreshProfile }),
    [session, profile, loading, login, logout, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
