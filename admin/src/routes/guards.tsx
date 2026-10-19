import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/state/auth-context'

function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10">
            <ShieldAlert className="size-5 text-destructive" />
          </div>
          <h1 className="text-base font-semibold text-foreground">Configuration required</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <pre className="mt-3 w-full overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key`}
        </pre>
      </div>
    </div>
  )
}

/** Route wrapper: requires a signed-in admin (session + profile.role === 'admin'). */
export function RequireAuth() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullscreenLoader label="Checking your session…" />
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (!profile || profile.role !== 'admin') return <Navigate to="/login" replace />
  return <Outlet />
}
