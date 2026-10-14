import * as React from 'react'
import { Link, Navigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  Sparkles,
  Store,
  User,
  WifiOff,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  clearPendingRegistration,
  isEmailRegistered,
  stagePendingRegistration,
} from '@/lib/repos'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { authErrorMessage, startSignup } from '@/services/auth-service'
import { useAuth } from '@/state/auth-context'
import { AuthLayout } from './auth-layout'
import { ConfirmEmailStep } from './confirm-email-step'

const schema = z
  .object({
    fullName: z.string().min(2, 'Full name is required.'),
    address: z.string().min(10, 'Enter the store address (street, barangay, city/province).'),
    contactNumber: z
      .string()
      .regex(/^(09|\+639)\d{9}$/, 'Enter a valid PH mobile number (e.g. 09171234567).'),
    businessName: z.string().min(2, 'Enter your store or business name.'),
    email: z.string().email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .regex(/[A-Za-z]/, 'Password must include a letter.')
      .regex(/[0-9]/, 'Password must include a number.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

/** 0 (empty/weak) to 4 (strong). */
function passwordScore(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++
  if (pw.length >= 14 && /[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}

const STRENGTH_LABEL = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_BAR = [
  'bg-muted',
  'bg-destructive',
  'bg-amber-500',
  'bg-amber-400',
  'bg-emerald-500',
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-3 first:pt-0">
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}

function InputIcon({ icon: Icon }: { icon: typeof User }) {
  return (
    <Icon
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden
    />
  )
}

function StepIndicator({ current }: { current: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: 'Account details' },
    { n: 2 as const, label: 'Confirm email' },
  ]
  return (
    <ol className="mb-6 flex items-center gap-3" aria-label={`Step ${current} of 2`}>
      {steps.map((s, i) => {
        const done = current > s.n
        const active = current === s.n
        return (
          <React.Fragment key={s.n}>
            {i > 0 && (
              <span
                className={cn('h-px w-8 transition-colors', done ? 'bg-foreground/30' : 'bg-border')}
                aria-hidden
              />
            )}
            <li
              className="flex items-center gap-2"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-foreground/10 text-foreground',
                  !active && !done && 'bg-muted text-muted-foreground'
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : s.n}
              </span>
              <span
                className={cn(
                  'text-xs font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </li>
          </React.Fragment>
        )
      })}
    </ol>
  )
}

export function RegisterPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [showPassword, setShowPassword] = React.useState(false)
  const [step, setStep] = React.useState<'details' | 'verify'>('details')
  const [signupError, setSignupError] = React.useState<string | null>(null)
  const [sendingLink, setSendingLink] = React.useState(false)
  const pendingValues = React.useRef<FormValues | null>(null)
  // Email whose Supabase account we already created this session, so a
  // back-and-forth does not re-trigger signUp (which would look like a dup).
  const signupEmailRef = React.useRef<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      address: '',
      contactNumber: '',
      businessName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  if (user) return <Navigate to="/" replace />

  async function onSubmit(values: FormValues) {
    const email = values.email.trim().toLowerCase()
    setSignupError(null)

    // Already have a local account for this email? Send them to sign in
    // instead of creating a duplicate account or a second trial.
    if (await isEmailRegistered(email)) {
      setSignupError('This email is already registered. Please sign in instead.')
      return
    }

    // Registration is online-first: the confirmation email cannot be sent offline.
    if (signupEmailRef.current !== email) {
      if (!online) {
        setSignupError(
          'You are offline. Connect to the internet to create your account and confirm your email.'
        )
        return
      }
      setSendingLink(true)
      try {
        // Stage the local account (password hashed locally) so the /auth/confirm
        // redirect can finalize it, then ask Supabase to email the link.
        await stagePendingRegistration({
          fullName: values.fullName,
          address: values.address,
          contactNumber: values.contactNumber,
          businessName: values.businessName,
          email,
          password: values.password,
        })
        await startSignup({
          fullName: values.fullName,
          address: values.address,
          contactNumber: values.contactNumber,
          businessName: values.businessName,
          email,
          password: values.password,
        })
        signupEmailRef.current = email
      } catch (err) {
        // Signup failed — drop the staged record so it can't be finalized later.
        await clearPendingRegistration(email)
        setSignupError(authErrorMessage(err).message)
        return
      } finally {
        setSendingLink(false)
      }
    }

    pendingValues.current = values
    setStep('verify')
  }

  function handleBack() {
    if (pendingValues.current) form.reset(pendingValues.current)
    setSignupError(null)
    setStep('details')
  }

  const submitting = form.formState.isSubmitting

  if (step === 'verify') {
    return (
      <AuthLayout
        title="Confirm your email"
        subtitle="We sent you a confirmation link. Click it to finish creating your account."
        footer={
          <>
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </>
        }
      >
        <StepIndicator current={2} />
        <ConfirmEmailStep
          email={pendingValues.current?.email.trim().toLowerCase() ?? ''}
          onBack={handleBack}
        />
      </AuthLayout>
    )
  }

  const password = form.watch('password')
  const score = passwordScore(password)

  return (
    <AuthLayout
      eyebrow={
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="size-3" aria-hidden />
          30-day free trial · No card required
        </span>
      }
      title="Create your account"
      subtitle="Set up your business and POS workspace in a few minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <StepIndicator current={1} />

      <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {!online && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-3.5 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
            <WifiOff className="size-4 shrink-0" aria-hidden />
            You are offline. Connect to the internet to register and confirm your email.
          </div>
        )}
        {signupError && (
          <Alert variant="destructive" className="border-destructive/30">
            <CircleAlert aria-hidden />
            <AlertTitle>Could not send verification email</AlertTitle>
            <AlertDescription>{signupError}</AlertDescription>
          </Alert>
        )}

        <SectionLabel>Owner</SectionLabel>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <div className="relative">
                  <InputIcon icon={User} />
                  <Input
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                    autoFocus
                    className="h-11 pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact number</FormLabel>
              <FormControl>
                <div className="relative">
                  <InputIcon icon={Phone} />
                  <Input
                    placeholder="09171234567"
                    inputMode="tel"
                    autoComplete="tel"
                    className="h-11 pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SectionLabel>Store</SectionLabel>
        <FormField
          control={form.control}
          name="businessName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store / business name</FormLabel>
              <FormControl>
                <div className="relative">
                  <InputIcon icon={Store} />
                  <Input placeholder="Clara's Carinderia" className="h-11 pl-9" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store address</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Unit 5, 45 Mabini Street, Brgy. Poblacion, Makati City, Metro Manila"
                  rows={2}
                  autoComplete="street-address"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SectionLabel>Account</SectionLabel>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <div className="relative">
                  <InputIcon icon={Mail} />
                  <Input
                    type="email"
                    placeholder="maria@carinderia.ph"
                    autoComplete="email"
                    className="h-11 pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <InputIcon icon={Lock} />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    className="h-11 pr-10 pl-9"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute inset-y-0 right-1 my-auto"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </FormControl>
              {password.length > 0 && (
                <div className="space-y-1.5" aria-live="polite">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors',
                          score >= i ? STRENGTH_BAR[score] : 'bg-muted'
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Password strength: <span className="font-medium">{STRENGTH_LABEL[score]}</span>
                  </p>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <div className="relative">
                  <InputIcon icon={Lock} />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    className="h-11 pr-10 pl-9"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute inset-y-0 right-1 my-auto"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-1">
          <Button type="submit" size="lg" className="h-11 w-full" disabled={submitting || !online}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {sendingLink ? 'Sending confirmation link…' : 'Send confirmation link'}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </Form>
    </AuthLayout>
  )
}
