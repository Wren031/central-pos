import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  CircleAlert,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Save,
  Trash2,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatDateTime, peso } from '@/lib/format'
import { planDisplayName } from '@/lib/plan-display'
import { changePassword, deleteAccount, updateProfile } from '@/lib/repos'
import { avatarImage } from '@/lib/mock-image'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'

const profileSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name.'),
  address: z.string().min(10, 'Enter your complete address.'),
  contactNumber: z
    .string()
    .regex(/^(09|\+639)\d{9}$/, 'Enter a valid PH mobile number (e.g. 09171234567).'),
  businessName: z.string().min(2, 'Enter your business name.'),
})

type ProfileValues = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    next: z
      .string()
      .min(8, 'At least 8 characters.')
      .regex(/[A-Za-z]/, 'Include a letter.')
      .regex(/[0-9]/, 'Include a number.'),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

type PasswordValues = z.infer<typeof passwordSchema>

export function ProfilePage() {
  const { user, refresh, logout } = useAuth()
  const { state, sub, transactions } = useSubscription()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState('')
  const [deletePassword, setDeletePassword] = React.useState('')
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [prefs, setPrefs] = React.useState(user?.notificationPrefs ?? {
    expiration: true,
    reminders: true,
    marketing: false,
  })

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: user
      ? {
          fullName: user.fullName,
          address: user.address,
          contactNumber: user.contactNumber,
          businessName: user.businessName,
        }
      : undefined,
  })

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  })

  if (!user) return null

  async function saveProfile(values: ProfileValues) {
    await updateProfile(user!.id, values)
    toast.success('Profile updated')
    refresh()
  }

  async function savePassword(values: PasswordValues) {
    await changePassword(user!.id, values.current, values.next)
    toast.success('Password changed (simulated)')
    passwordForm.reset({ current: '', next: '', confirm: '' })
  }

  async function savePrefs(next: typeof prefs) {
    setPrefs(next)
    await updateProfile(user!.id, { notificationPrefs: next })
    toast.success('Notification preferences saved')
  }

  async function handleDelete() {
    setDeleteError(null)
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.')
      return
    }
    setDeleting(true)
    try {
      await deleteAccount(user!.id, deletePassword)
      toast.success('Your account has been permanently deleted.')
      setDeleteOpen(false)
      // The local session was cleared; go to sign-in (not register — the user
      // deleted on purpose; they can sign up again explicitly if they wish).
      navigate('/login', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.')
    } finally {
      setDeleting(false)
    }
  }

  const subTransactions = transactions.filter((t) => t.type === 'subscription')

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback
            className="text-lg font-semibold"
            style={{ backgroundImage: `url(${avatarImage(user.fullName)})`, backgroundSize: 'cover' }}
          >
            {user.fullName
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{user.fullName}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {user.email} · member since {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personal &amp; store information</CardTitle>
          <CardDescription>Used across your dashboard, receipts, and POS workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm} onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store / business name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={profileForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complete address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="contactNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact number</FormLabel>
                    <FormControl>
                      <Input inputMode="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save changes
              </Button>
          </Form>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Simulated password change — stored locally in your browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm} onSubmit={passwordForm.handleSubmit(savePassword)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="current"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input type={showPassword ? 'text' : 'password'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={passwordForm.control}
                  name="next"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type={showPassword ? 'text' : 'password'} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm new password</FormLabel>
                      <FormControl>
                        <Input type={showPassword ? 'text' : 'password'} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="outline" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  Update password
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {showPassword ? 'Hide' : 'Show'} passwords
                </Button>
              </div>
          </Form>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notification preferences</CardTitle>
          <CardDescription>Choose which mock reminders appear in your dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ['reminders', 'Expiry reminders', 'Notify me a few days before my plan expires.'],
              ['expiration', 'Expiration alerts', 'Notify me when my plan or trial has expired.'],
              ['marketing', 'Product updates', 'Occasional news about new POS types.'],
            ] as const
          ).map(([key, label, desc]) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor={`pref-${key}`} className="text-sm">
                  {label}
                </Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Checkbox
                id={`pref-${key}`}
                checked={prefs[key]}
                onCheckedChange={(v) => void savePrefs({ ...prefs, [key]: v === true })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subscription &amp; billing</CardTitle>
          <CardDescription>
            {planDisplayName(sub)} ·{' '}
            {state.expiresAt ? `expires ${formatDate(state.expiresAt)}` : 'expired'} ·{' '}
            {peso(subTransactions.reduce((s, t) => s + t.amount, 0))} paid to date
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {subTransactions.slice(0, 4).map((t) => (
            <div key={t.id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{t.reference}</span>
                <span className="block text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</span>
              </span>
              <span className="tabular-nums">{peso(t.amount)}</span>
            </div>
          ))}
          {subTransactions.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No payments yet — free trial active.</p>
          )}
          <Button asChild variant="outline" size="sm" onClick={() => navigate('/subscription')}>
            <span>
              <CreditCard className="size-3.5" /> Manage plan
            </span>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-200 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-red-600">
            <AlertTriangle className="size-4" aria-hidden />
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                void logout().then(() => navigate('/login'))
              }}
            >
              <LogOut className="size-4" />
              Log out
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete account
            </Button>
          </div>
          <Alert variant="destructive">
            <AlertTitle>Deleting is permanent</AlertTitle>
            <AlertDescription>
              Your store, products, orders, and billing history will be removed from this browser.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeleteConfirm('')
            setDeletePassword('')
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, store, products, and orders — on this device
              and on the server. Type your store name <strong>{user.businessName}</strong> and enter
              your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={user.businessName}
              aria-label="Confirm store name"
              disabled={deleting}
            />
            <Input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your account password"
              aria-label="Password"
              autoComplete="current-password"
              disabled={deleting}
            />
            {deleteError && (
              <Alert variant="destructive" className="border-destructive/30">
                <CircleAlert aria-hidden />
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deleting || deleteConfirm.trim() !== user.businessName || deletePassword.length === 0
              }
              onClick={(e) => {
                // Keep the dialog open on failure so the error stays visible.
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Separator />
    </div>
  )
}
