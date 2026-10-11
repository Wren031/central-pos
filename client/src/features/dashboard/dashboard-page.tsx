import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Grid2X2,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  TrendingUp,
  User,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { StatusBadge } from '@/components/common/status-badge'
import { formatDate, formatDateTime, peso, relativeFromNow } from '@/lib/format'
import { getPosType } from '@/lib/pos-types'
import { getOrders, getProducts, PLAN_LABELS } from '@/lib/repos'
import { mockClock } from '@/lib/mock-clock'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'

function QuickAction({
  to,
  icon: Icon,
  label,
  description,
  accent,
}: {
  to: string
  icon: React.ElementType
  label: string
  description: string
  accent?: string
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border bg-background p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
        style={accent ? { backgroundColor: `${accent}1a`, color: accent } : { backgroundColor: 'var(--muted)' }}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  )
}

export function DashboardPage() {
  const { user, store, ready } = useAuth()
  const { sub, state, notifications, transactions } = useSubscription()
  const navigate = useNavigate()
  const [todaySales, setTodaySales] = React.useState<{ total: number; orders: number; lowStock: number } | null>(null)

  React.useEffect(() => {
    if (!store) return
    const orders = getOrders(store.id)
    const products = getProducts(store.id)
    const now = mockClock.now()
    const today = orders.filter((o) => {
      const d = new Date(o.createdAt)
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      )
    })
    setTodaySales({
      total: today.reduce((s, o) => s + o.total, 0),
      orders: today.length,
      lowStock: products.filter((p) => p.stock <= 10).length,
    })
  }, [store, transactions.length])

  if (!ready || !user) {
    return (
      <div className="w-full space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const posDef = store ? getPosType(store.posType) : null
  const firstName = user.fullName.split(' ')[0]
  const timeOfDay = (() => {
    const h = mockClock.now().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const subTransactions = transactions.filter((t) => t.type === 'subscription').slice(0, 5)
  const orderTransactions = transactions.filter((t) => t.type === 'order').slice(0, 6)

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title={`${timeOfDay}, ${firstName}!`}
        description={
          store?.onboarded
            ? `Here's what's happening at ${store.name} today.`
            : 'Finish setting up your store to start selling.'
        }
        actions={
          store?.onboarded && (
            <Button onClick={() => navigate('/pos')}>
              <Grid2X2 className="size-4" />
              Open POS workspace
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-4 shadow-none lg:col-span-2">
          <CardHeader className="pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                    {store?.name
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase() ?? 'ST'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-base">{store?.name ?? user.businessName}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Store className="size-3.5" aria-hidden />
                    {posDef ? posDef.name : 'POS not configured'}
                    <Badge variant="secondary" className="text-[10px]">
                      {user.address.split(',').slice(-2).join(',').trim() || 'Philippines'}
                    </Badge>
                  </CardDescription>
                </div>
              </div>
              {store?.onboarded && (
                <span
                  className="flex size-12 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: posDef?.theme.accent }}
                  title={posDef?.name}
                >
                  {posDef && <posDef.icon className="size-6" aria-hidden />}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {state.canSell ? (
                <div className="min-w-0">
                  <p className="font-medium">
                    {sub?.plan === 'trial' ? 'Free trial' : `${PLAN_LABELS[sub?.plan ?? 'monthly']} subscription`}{' '}
                    · <span className="text-emerald-700">{state.daysLeft} day{state.daysLeft === 1 ? '' : 's'} left</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expires {state.expiresAt ? formatDate(state.expiresAt) : '—'} · selling stays
                    active until then
                  </p>
                </div>
              ) : (
                <div className="min-w-0">
                  <p className="font-medium text-red-600">Subscription expired — selling is locked</p>
                  <p className="text-xs text-muted-foreground">
                    Renew a plan to resume checkout. Your data is safe.
                  </p>
                </div>
              )}
              <Button asChild size="sm" variant="outline" className="ml-auto shrink-0">
                <Link to="/subscription">Manage plan</Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickAction
                to="/pos"
                icon={ShoppingCart}
                label="Open POS"
                description="Start selling from the workspace"
                accent={posDef?.theme.accent}
              />
              <QuickAction to="/onboarding" icon={Grid2X2} label="Change POS type" description="Switch to another industry POS" />
              <QuickAction to="/subscription" icon={CreditCard} label="Manage subscription" description="Plans, renewals & billing history" />
              <QuickAction to="/profile" icon={User} label="Edit profile" description="Personal info, store & preferences" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="gap-3 shadow-none">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="size-4" aria-hidden />
                Notifications
                {notifications.filter((n) => !n.read).length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {notifications.filter((n) => !n.read).length} new
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notifications.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No notifications. Reminders appear here before your plan expires.
                </p>
              ) : (
                notifications.slice(0, 5).map((n) => (
                  <div key={n.id} className="flex gap-2.5">
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.read ? 'bg-muted' : 'bg-blue-500'
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {relativeFromNow(n.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 shadow-none">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <StatusBadge status={state.status} />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Owner</span>
                <span className="truncate font-medium">{user.fullName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate font-medium">{user.email}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Contact</span>
                <span className="truncate font-medium">{user.contactNumber}</span>
              </div>
              <Separator />
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to="/profile">
                  <Settings className="size-3.5" /> Edit profile
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Today's sales"
          value={todaySales ? peso(todaySales.total) : '—'}
          hint={store?.onboarded ? 'From paid orders' : 'Set up your POS first'}
          accent={posDef?.theme.accent}
        />
        <StatCard icon={ReceiptText} label="Today's orders" value={todaySales ? String(todaySales.orders) : '—'} />
        <StatCard icon={Package} label="Low stock items" value={todaySales ? String(todaySales.lowStock) : '—'} hint="10 pcs or fewer" />
        <StatCard icon={CalendarClock} label="Subscription" value={`${state.daysLeft} days`} hint={state.canSell ? 'Remaining access' : 'Expired'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent sales transactions</CardTitle>
            <CardDescription>Latest paid orders from your POS</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {orderTransactions.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="No sales yet"
                description="Ring up your first sale in the POS workspace."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/pos/catalog">Go to catalog</Link>
                  </Button>
                }
                className="border-0"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(t.createdAt)}</TableCell>
                        <TableCell className="text-right font-medium">{peso(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Subscription history</CardTitle>
            <CardDescription>Payments made for your plan</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {subTransactions.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No plan payments yet"
                description="You're on the free trial. Choose a plan when you're ready."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/subscription">View plans</Link>
                  </Button>
                }
                className="border-0"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <span className="font-medium">{t.reference}</span>
                          <span className="block text-xs text-muted-foreground">{t.description}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(t.createdAt)}</TableCell>
                        <TableCell className="text-right font-medium">{peso(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
