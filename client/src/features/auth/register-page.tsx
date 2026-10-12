import * as React from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Eye, EyeOff, Loader2, Lock, Mail, Phone, Store, User } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { useAuth } from '@/state/auth-context'
import { AuthLayout } from './auth-layout'
import { OtpVerifyStep } from './otp-verify-step'

const schema = z
  .object({
    firstName: z.string().min(1, 'First name is required.'),
    middleName: z.string().optional(),
    lastName: z.string().min(1, 'Last name is required.'),
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
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
  return (
    <div className="mb-6 flex items-center gap-2.5" aria-label={`Step ${current} of 2`}>
      {[1, 2].map((n) => {
        const done = current > n
        const active = current === n
        return (
          <React.Fragment key={n}>
            {n === 2 && (
              <span
                className={cn(
                  'h-px flex-1 transition-colors duration-300',
                  done ? 'bg-foreground/30' : 'bg-border'
                )}
                aria-hidden
              />
            )}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-300',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-foreground/10 text-foreground',
                  !active && !done && 'bg-muted text-muted-foreground'
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span
                className={cn(
                  'hidden text-xs font-medium sm:inline',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {n === 1 ? 'Account details' : 'Verify email'}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = React.useState(false)
  const [step, setStep] = React.useState<'details' | 'verify'>('details')
  const pendingValues = React.useRef<FormValues | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      address: '',
      contactNumber: '',
      businessName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  if (user) return <Navigate to="/" replace />

  function onSubmit(values: FormValues) {
    pendingValues.current = values
    setStep('verify')
  }

  function handleBack() {
    if (pendingValues.current) form.reset(pendingValues.current)
    setStep('details')
  }

  async function handleVerified() {
    const values = pendingValues.current
    if (!values) return
    const fullName = [values.firstName, values.middleName, values.lastName]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ')
    await register({
      fullName,
      address: values.address,
      contactNumber: values.contactNumber,
      businessName: values.businessName,
      email: values.email,
      password: values.password,
    })
    toast.success('Account created — your 30-day free trial is active!')
    navigate('/onboarding', { replace: true })
  }

  const submitting = form.formState.isSubmitting
  const password = form.watch('password')
  const score = passwordScore(password)

  return (
    <AuthLayout
      title={step === 'verify' ? 'Verify your email' : 'Create your account'}
      subtitle={
        step === 'verify'
          ? 'One last step — confirm your email to create your account.'
          : 'Start with a 30-day free trial. No credit card required.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      {step === 'verify' ? (
        <div
          key="verify"
          className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
        >
          <StepIndicator current={2} />
          <OtpVerifyStep
            email={pendingValues.current?.email ?? ''}
            onVerified={handleVerified}
            onBack={handleBack}
          />
        </div>
      ) : (
        <div
          key="details"
          className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
        >
          <StepIndicator current={1} />
      <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <SectionLabel>Owner</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <InputIcon icon={User} />
                      <Input
                        placeholder="Juan"
                        autoComplete="given-name"
                        autoFocus
                        className="pl-9"
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
              name="middleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Middle name</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" autoComplete="additional-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input placeholder="Dela Cruz" autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
                      className="pl-9"
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
                    <Input placeholder="Clara's Carinderia" className="pl-9" {...field} />
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
                      className="pl-9"
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
                      className="pr-10 pl-9"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </FormControl>
                {password.length > 0 && (
                  <div className="space-y-1" aria-live="polite">
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
                      className="pr-10 pl-9"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
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
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Create account &amp; start free trial
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By registering you agree to our mock Terms of Service and Privacy Policy.
          </p>
      </Form>
        </div>
      )}
    </AuthLayout>
  )
}
