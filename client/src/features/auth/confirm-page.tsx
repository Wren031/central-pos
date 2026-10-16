import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleAlert, Loader2, MailWarning } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { finalizePendingRegistration } from '@/lib/repos'
import { authErrorMessage, readConfirmedUserFromRedirect, signOutSupabase } from '@/services/auth-service'
import { useAuth } from '@/state/auth-context'
import { AuthLayout } from './auth-layout'

type Phase = 'working' | 'confirmed' | 'unconfirmed' | 'no-local' | 'error'

/**
 * Landing route for the Supabase confirmation link (/auth/confirm).
 *
 * Reads the confirmed session from the redirect, finalizes the staged local
 * account (and its 30-day trial), drops the transient Supabase session, signs
 * the user in locally, and sends them to onboarding. Nothing is finalized
 * unless Supabase reports the email as confirmed.
 */
export function ConfirmPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [phase, setPhase] = React.useState<Phase>('working')
  const [message, setMessage] = React.useState('')

  React.useEffect(() => {
    let active = true

    void (async () => {
      try {
        const { email, confirmed } = await readConfirmedUserFromRedirect()
        if (!active) return

        if (!confirmed) {
          setPhase('unconfirmed')
          return
        }

        const user = await finalizePendingRegistration(email)
        await signOutSupabase()
        if (!active) return

        if (!user) {
          // Confirmed elsewhere (or local data cleared) — let them sign in; the
          // login path repairs the local account from Supabase.
          setPhase('no-local')
          return
        }

        setPhase('confirmed')
        refresh()
        toast.success('Email confirmed — let’s set up your workspace!')
        navigate('/onboarding', { replace: true })
      } catch (err) {
        if (!active) return
        setMessage(authErrorMessage(err).message)
        setPhase('error')
      }
    })()

    return () => {
      active = false
    }
  }, [navigate, refresh])

  const title =
    phase === 'error'
      ? 'We couldn’t confirm your email'
      : phase === 'unconfirmed'
        ? 'Email not confirmed yet'
        : phase === 'no-local'
          ? 'Email confirmed'
          : 'Confirming your email'

  const subtitle =
    phase === 'no-local'
      ? 'Please sign in to finish setting up your account.'
      : phase === 'working' || phase === 'confirmed'
        ? 'Hang tight — this only takes a moment.'
        : 'Follow the steps below to continue.'

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      footer={
        <>
          Need to start over?{' '}
          <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        {(phase === 'working' || phase === 'confirmed') && (
          <>
            <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/10">
              {phase === 'confirmed' ? (
                <CheckCircle2 className="size-7 animate-in zoom-in-50 duration-300" aria-hidden />
              ) : (
                <Loader2 className="size-7 animate-spin" aria-hidden />
              )}
            </span>
            <p className="text-sm text-muted-foreground">
              {phase === 'confirmed'
                ? 'Your account is ready. Taking you to setup…'
                : 'Confirming your email with Supabase…'}
            </p>
          </>
        )}

        {phase === 'unconfirmed' && (
          <>
            <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <MailWarning className="size-7" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This link didn&apos;t confirm an email yet. If you opened it by mistake, use the link
              in your inbox. Otherwise, sign up again to get a fresh confirmation email.
            </p>
            <div className="flex w-full flex-col gap-2 pt-1">
              <Button asChild size="lg" className="h-11 w-full">
                <Link to="/login">Go to sign in</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full">
                <Link to="/register">Back to sign up</Link>
              </Button>
            </div>
          </>
        )}

        {phase === 'no-local' && (
          <>
            <span className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="size-7" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your email is confirmed. Sign in with the password you chose to finish setting up your
              account on this device.
            </p>
            <Button asChild size="lg" className="h-11 w-full">
              <Link to="/login">Sign in</Link>
            </Button>
          </>
        )}

        {phase === 'error' && (
          <>
            <span className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <CircleAlert className="size-7" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
            <div className="flex w-full flex-col gap-2 pt-1">
              <Button asChild size="lg" className="h-11 w-full">
                <Link to="/login">Go to sign in</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full">
                <Link to="/register">Back to sign up</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
