import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CircleAlert,
  Inbox,
  Loader2,
  MailCheck,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { authErrorMessage, resendConfirmation } from '@/services/auth-service'
import { useOnlineStatus } from '@/hooks/use-online-status'

const RESEND_COOLDOWN_S = 30

/** Masks an email for display, e.g. maria@carinderia.ph -> ma•••@carinderia.ph */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  if (local.length <= 2) return `${local[0] ?? ''}•••@${domain}`
  return `${local.slice(0, 2)}•••@${domain}`
}

const STEPS = [
  'Open the confirmation email we just sent.',
  'Click the “Confirm email address” button.',
  'You’ll be brought back here to finish setup automatically.',
]

interface ConfirmEmailStepProps {
  email: string
  onBack: () => void
}

export function ConfirmEmailStep({ email, onBack }: ConfirmEmailStepProps) {
  const online = useOnlineStatus()
  // The link was already sent by the signup step, so start the cooldown now.
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_S)
  const [resending, setResending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  async function handleResend() {
    if (resending || cooldown > 0 || !online) return
    setResending(true)
    setError(null)
    try {
      await resendConfirmation(email)
      setCooldown(RESEND_COOLDOWN_S)
      setSent(true)
    } catch (err) {
      setError(authErrorMessage(err).message)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center space-y-4 text-center">
        <span className="relative flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/10">
          <Inbox className="size-7" aria-hidden />
          <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-emerald-500 text-white">
            <MailCheck className="size-3.5" aria-hidden />
          </span>
        </span>
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">We sent a confirmation link to</p>
          <p
            className="mx-auto w-fit max-w-full truncate rounded-full border bg-muted/40 px-3 py-1 font-medium text-foreground"
            title={email}
          >
            {maskEmail(email)}
          </p>
        </div>
      </div>

      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-3.5 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          You are offline. Reconnect to receive and open your confirmation link.
        </div>
      )}

      <ol className="space-y-3 rounded-xl border bg-muted/30 p-4">
        {STEPS.map((text, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-foreground ring-1 ring-border">
              {i + 1}
            </span>
            <span className="leading-relaxed">{text}</span>
          </li>
        ))}
        <li className="pl-8 text-xs text-muted-foreground/80">
          Can’t find it? Check your spam or junk folder.
        </li>
      </ol>

      {sent && !error && (
        <p
          aria-live="polite"
          className="flex items-center justify-center gap-1.5 text-center text-sm font-medium text-emerald-600"
        >
          <MailCheck className="size-4 shrink-0" aria-hidden />
          Confirmation link sent again.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-center justify-center gap-1.5 text-center text-sm font-medium text-destructive"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t get the email?{' '}
        {cooldown > 0 ? (
          <span className="font-medium text-foreground tabular-nums">Resend in {cooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || !online}
            className={cn(
              'inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4 transition-colors hover:no-underline',
              'disabled:opacity-50'
            )}
          >
            {resending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Resend link
          </button>
        )}
      </p>

      <div className="flex flex-col items-center gap-3 border-t pt-5">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
        >
          Already confirmed? Sign in
        </Link>
        <button
          type="button"
          onClick={onBack}
          disabled={resending}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to registration details
        </button>
        <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          Your account is created only after Supabase confirms your email.
        </p>
      </div>
    </div>
  )
}
