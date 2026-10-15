import * as React from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/state/auth-context'
import { AccountSuspendedError } from '@/lib/account-status'
import { AuthLayout } from './auth-layout'

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [suspended, setSuspended] = React.useState(false)
  const [rememberMe, setRememberMe] = React.useState(true)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const submitting = form.formState.isSubmitting

  // Only auto-redirect an already-signed-in visitor. While a sign-in is in
  // flight we must NOT navigate yet: the local session is created before the
  // account-status check completes, so redirecting early would flash the
  // workspace (and swallow the suspension message) for a suspended account.
  if (user && !submitting) return <Navigate to="/" replace />

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setSuspended(false)
    try {
      const u = await login(values.email, values.password, rememberMe)
      toast.success(`Welcome back, ${u.fullName.split(' ')[0]}!`)
      navigate(from, { replace: true })
    } catch (err) {
      setSuspended(err instanceof AccountSuspendedError)
      setServerError(err instanceof Error ? err.message : 'Login failed.')
    }
  }

  return (
    <AuthLayout
      eyebrow={
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <ShieldCheck className="size-3" aria-hidden />
          Secure sign in
        </span>
      }
      title="Welcome back"
      subtitle="Sign in to continue to your POS workspace."
      footer={
        <>
          New to UniPOS?{' '}
          <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {serverError && (
        <Alert variant="destructive" className="mb-4 border-destructive/30">
          <CircleAlert aria-hidden />
          <AlertTitle>{suspended ? 'Account suspended' : 'Sign in failed'}</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="email"
                    placeholder="juan@bbqhouse.ph"
                    autoComplete="email"
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
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  onClick={() => toast.info('Password reset is not available in the demo build.')}
                >
                  Forgot password?
                </button>
              </div>
              <FormControl>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
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
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(value) => setRememberMe(value === true)}
            disabled={submitting}
          />
          <Label
            htmlFor="remember-me"
            className="text-sm font-normal text-muted-foreground"
          >
            Remember me
          </Label>
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </Form>
    </AuthLayout>
  )
}
