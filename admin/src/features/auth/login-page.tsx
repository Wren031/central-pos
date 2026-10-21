import * as React from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { BrandLogo } from '@/components/common/brand-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/state/auth-context'
import { supabaseConfigured } from '@/lib/supabase'
import { ConfigErrorScreen } from '@/routes/guards'
import { SITE } from '@/features/landing/site'

/** Marketing copy for the desktop brand panel. */
const HIGHLIGHTS = [
  {
    icon: Building2,
    title: 'Every merchant in one view',
    description: 'Search users and stores, review status, and act without leaving the page.',
  },
  {
    icon: CreditCard,
    title: 'Subscriptions & payments',
    description: 'Extend plans, record renewals, and verify GCash payment requests.',
  },
  {
    icon: ShieldCheck,
    title: 'Auditable by default',
    description: 'Every admin action is written to an append-only activity log.',
  },
] as const

export function LoginPage() {
  const { session, profile, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  // `/users` is the first console route; falling back to `/` would land on the
  // public marketing page.
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/users'

  if (!supabaseConfigured) {
    return (
      <ConfigErrorScreen message="Set your Supabase project URL and publishable key in admin/.env.local before signing in." />
    )
  }

  if (!loading && session && profile?.role === 'admin') {
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    setBusy(true)
    try {
      const p = await login(email, password)
      toast.success(`Welcome back, ${p.full_name?.split(' ')[0] || 'admin'}!`)
      navigate(from, { replace: true })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative isolate flex min-h-svh flex-col justify-center overflow-hidden bg-background text-foreground">
      {/* Ambient depth — soft indigo light and a faint grid, matching the landing hero. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-14rem] size-[38rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute -bottom-48 -right-32 size-[28rem] rounded-full bg-violet-500/10 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, oklch(1 0 0 / 9%) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_minmax(0,25rem)] lg:gap-16">
          {/* Brand panel — desktop only; the form stays above the fold on mobile. */}
          <section className="hidden lg:block">
            <BrandLogo tone="mono" className="h-7" />

            <h2 className="mt-7 max-w-lg text-4xl font-semibold leading-[1.1] tracking-tight text-balance">
              The control room behind every UniPOS store.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-pretty text-muted-foreground">
              Manage merchants, subscriptions, and payments from a single console — with a
              complete audit trail of every action.
            </p>

            <ul className="mt-9 space-y-5">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-primary">
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-9 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" aria-hidden />
              Admin access only · role checked in the database
            </p>
          </section>

          {/* Sign-in panel */}
          <section aria-labelledby="login-heading" className="mx-auto w-full max-w-md lg:max-w-none">
            <div className="mb-6 flex justify-center lg:hidden">
              <BrandLogo tone="mono" className="h-6" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-card/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
              <h1 id="login-heading" className="text-xl font-semibold tracking-tight">
                Sign in
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Use your UniPOS admin credentials.
              </p>

              {serverError && (
                <div
                  id="login-error"
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{serverError}</span>
                </div>
              )}

              <form
                onSubmit={onSubmit}
                className="mt-6 space-y-4"
                aria-describedby={serverError ? 'login-error' : undefined}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email address</Label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="login-email"
                      type="email"
                      inputMode="email"
                      className="h-11 rounded-lg pl-9"
                      placeholder="admin@centralpos.ph"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="h-11 rounded-lg pl-9 pr-11"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="h-11 w-full"
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 border-t border-white/10 pt-4 text-xs text-muted-foreground">
                Trouble signing in?{' '}
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="font-medium text-foreground underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white/60"
                >
                  Contact support
                </a>
              </p>
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
              Merchant accounts sign in through the POS app, not here.
            </p>
            <p className="mt-2 text-center text-xs">
              <Link
                to="/"
                className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                ← Back to website
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
