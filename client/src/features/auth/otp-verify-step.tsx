import * as React from 'react'
import {
  ArrowLeft,
  CircleAlert,
  FlaskConical,
  Loader2,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { resendOtp, sendOtp, verifyOtp } from '@/services/otp-service'

const RESEND_COOLDOWN_S = 30
const CODE_LENGTH = 6

interface OtpVerifyStepProps {
  email: string
  onVerified: () => Promise<void>
  onBack: () => void
}

export function OtpVerifyStep({ email, onVerified, onBack }: OtpVerifyStepProps) {
  const [digits, setDigits] = React.useState<string[]>(() => Array(CODE_LENGTH).fill(''))
  const [mockCode, setMockCode] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(true)
  const [verifying, setVerifying] = React.useState(false)
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_S)
  const boxRefs = React.useRef<Array<HTMLInputElement | null>>([])

  const code = digits.join('')
  const complete = code.length === CODE_LENGTH
  const hasError = error !== null

  function focusBox(index: number) {
    boxRefs.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))]?.focus()
  }

  React.useEffect(() => {
    let active = true
    sendOtp(email)
      .then(({ code }) => {
        if (!active) return
        setMockCode(code)
        toast.info(`Mock code sent to ${email} — code: ${code}`)
        focusBox(0)
      })
      .catch(() => {
        if (active) setError('Could not send the verification code. Try again.')
      })
      .finally(() => {
        if (active) setSending(false)
      })
    return () => {
      active = false
    }
  }, [email])

  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  function handleChange(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value.replace(/\D/g, '')
    setError(null)
    if (!raw) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    const next = [...digits]
    let last = index
    for (const ch of raw) {
      if (last >= CODE_LENGTH) break
      next[last] = ch
      last++
    }
    setDigits(next)
    focusBox(Math.min(last, CODE_LENGTH - 1))
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      focusBox(index - 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  function useMockCode() {
    if (!mockCode) return
    setDigits(mockCode.split(''))
    setError(null)
    focusBox(CODE_LENGTH - 1)
  }

  async function handleResend() {
    if (sending || verifying || cooldown > 0) return
    setSending(true)
    setError(null)
    try {
      const { code: fresh } = await resendOtp(email)
      setMockCode(fresh)
      setDigits(Array(CODE_LENGTH).fill(''))
      setCooldown(RESEND_COOLDOWN_S)
      toast.info(`Code resent to ${email} — code: ${fresh}`)
      focusBox(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.')
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (sending || verifying) return
    if (!complete) {
      setError('Enter the 6-digit verification code.')
      focusBox(code.length)
      return
    }
    setVerifying(true)
    setError(null)
    try {
      await verifyOtp(email, code)
      await onVerified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
      setDigits(Array(CODE_LENGTH).fill(''))
      focusBox(0)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center space-y-3 text-center">
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/10 transition-opacity',
            sending && 'opacity-60'
          )}
        >
          <Mail className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Enter the 6-digit code we sent to</p>
          <p className="font-semibold text-foreground break-all">{email}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <FlaskConical className="size-3.5 shrink-0" aria-hidden />
          <span>Demo mode — no email was sent</span>
        </div>
        {mockCode ? (
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="font-mono text-sm font-bold tracking-[0.2em] text-foreground">
              {mockCode}
            </span>
            <button
              type="button"
              onClick={useMockCode}
              className="rounded-md border border-amber-500/40 px-2 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
            >
              Use code
            </button>
          </div>
        ) : (
          <Skeleton className="h-4 w-28 shrink-0" />
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div
          className="flex justify-center gap-2 sm:gap-2.5"
          role="group"
          aria-label="Verification code"
        >
          {digits.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => {
                boxRefs.current[index] = el
              }}
              value={digit}
              onChange={(event) => handleChange(index, event)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onFocus={(event) => event.target.select()}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${index + 1}`}
              aria-invalid={hasError || undefined}
              disabled={verifying}
              className={cn(
                'h-12 w-11 rounded-xl px-0 text-center font-mono text-lg font-semibold tabular-nums md:text-lg',
                'focus-visible:ring-ring/50',
                digit && 'border-foreground/20 bg-muted/40',
                hasError &&
                  'border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/20'
              )}
            />
          ))}
        </div>

        <div aria-live="polite" className="min-h-5">
          {error && (
            <p
              role="alert"
              className="flex animate-in items-center justify-center gap-1.5 text-center text-sm font-medium text-destructive fade-in-0 duration-200"
            >
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={sending || verifying || !complete}
        >
          {verifying && <Loader2 className="size-4 animate-spin" />}
          {verifying ? 'Verifying…' : 'Verify & create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t get a code?{' '}
        {cooldown > 0 ? (
          <span className="font-medium text-foreground tabular-nums">
            Resend in {cooldown}s
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={sending || verifying}
            className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4 transition-colors hover:no-underline disabled:opacity-50"
          >
            {sending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Resend code
          </button>
        )}
      </p>

      <div className="flex flex-col items-center gap-3 border-t pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={verifying}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to registration details
        </button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          Code expires in 5 minutes
        </p>
      </div>
    </div>
  )
}
