import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CreditCard,
  History,
  Plus,
  Store,
  TimerReset,
  Users,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { useAuth } from '@/state/auth-context'
import { peso, pesoCompact, formatDate, relativeFromNow } from '@/lib/format'
import { planLabel } from '@/lib/constants'
import type { ActivityLog, DashboardStats } from '@/lib/types'
import { StatCard } from '@/components/common/stat-card'
import { Card, EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PlanDistributionChart,
  RevenueAreaChart,
  SignupTrendChart,
  StatusDonutChart,
} from '@/components/charts/charts'

const ENTITY_TONE: Record<string, string> = {
  'user.suspend': 'border-red-500/30 bg-red-500/10 text-red-300',
  'user.activate': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'user.status_changed': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'subscription.extend': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  'subscription.change_plan': 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  'subscription.cancel': 'border-white/10 bg-white/5 text-muted-foreground',
  'payment.record': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'payment.status_changed': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

const QUICK_ACTIONS = [
  { to: '/users', label: 'Add user', icon: UserPlus },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/logs', label: 'Activity logs', icon: History },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

async function loadStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats')
  if (error) throw new Error(error.message)
  return data as DashboardStats
}

async function loadRecentActivity(): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, actor:profiles(full_name,email)')
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) throw new Error(error.message)
  return (data ?? []) as ActivityLog[]
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
        <Skeleton className="h-32 rounded-2xl sm:col-span-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const stats = useAsync(loadStats, [])
  const activity = useAsync(loadRecentActivity, [])
  const { profile } = useAuth()

  if (stats.loading) return <DashboardSkeleton />

  if (stats.error || !stats.data) {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Overview</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        </div>
        <ErrorState message={stats.error ?? 'No data returned.'} onRetry={stats.reload} />
      </div>
    )
  }

  const t = stats.data.totals

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Overview</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s how the platform is doing today · {todayLabel()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={stats.reload}>
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link to="/users">
              <Plus className="size-3.5" />
              New user
            </Link>
          </Button>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total users"
          value={String(t.customers)}
          hint={`${t.admins} admin account(s)`}
          tone="primary"
        />
        <StatCard
          icon={Store}
          label="Registered stores"
          value={String(t.stores)}
          hint="POS endpoints on the platform"
          tone="secondary"
        />
        <StatCard
          icon={CreditCard}
          label="Active subscriptions"
          value={String(t.active_subscriptions)}
          hint={`${t.trials} on free trial`}
          tone="success"
        />
        <StatCard
          icon={Banknote}
          label="Revenue (all time)"
          value={pesoCompact(t.revenue)}
          hint={`${peso(t.revenue_30d)} in the last 30 days`}
          tone="accent"
        />
      </div>

      {/* Attention row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TimerReset}
          label="Free trials"
          value={String(t.trials)}
          hint={`${t.expiring_soon} expiring within 7 days`}
          tone="info"
        />
        <StatCard
          icon={AlertTriangle}
          label="Expired subscriptions"
          value={String(t.expired)}
          hint={`${t.suspended_users} user(s) suspended`}
          tone="error"
        />
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:col-span-2">
          <p className="text-[13px] font-medium text-muted-foreground">Quick actions</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.to}
                variant="outline"
                size="sm"
                asChild
                className="justify-start gap-2 font-medium"
              >
                <Link to={action.to}>
                  <action.icon className="size-4 text-muted-foreground" aria-hidden />
                  {action.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue + status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Revenue"
          description="Succeeded payments, last 12 months"
          className="lg:col-span-2"
        >
          <RevenueAreaChart data={stats.data.revenue_by_month} />
        </Card>
        <Card title="Subscription status" description="Current rows by status">
          <StatusDonutChart data={stats.data.statuses} />
        </Card>
      </div>

      {/* Plans + signups + expiring */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Plan distribution" description="Active subscribers per plan">
          <PlanDistributionChart data={stats.data.plans} />
        </Card>
        <Card title="New signups" description="Customer accounts, last 12 months">
          <SignupTrendChart data={stats.data.signups_by_month} />
        </Card>
        <Card
          title="Expiring soon"
          description="Subscriptions ending within 7 days"
          bodyClassName="p-0"
        >
          {stats.data.expiring_soon_list.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing expiring this week.
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {stats.data.expiring_soon_list.map((item) => (
                <li key={item.user_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.full_name || item.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {planLabel(item.plan_id)} · until {formatDate(item.expires_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${
                      item.days_left <= 2
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {item.days_left}d
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border/70 px-4 py-2.5">
            <Link
              to="/subscriptions"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Manage subscriptions
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card
        title="Recent activity"
        description="Latest administrative actions"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/logs">
              <History className="size-3.5" />
              View all
            </Link>
          </Button>
        }
        bodyClassName="p-0"
      >
        {activity.loading ? (
          <LoadingRows rows={4} cols={2} />
        ) : activity.error ? (
          <div className="p-4">
            <ErrorState message={activity.error} onRetry={activity.reload} />
          </div>
        ) : (activity.data ?? []).length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Administrative actions will appear here as they happen."
          />
        ) : (
          <ul className="divide-y divide-border/70">
            {(activity.data ?? []).map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                    ENTITY_TONE[log.action] ?? 'border-white/10 bg-white/5 text-muted-foreground'
                  }`}
                >
                  {log.action.replace(/^[a-z]+\./, '')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{log.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.actor?.full_name || log.actor?.email || 'System'} ·{' '}
                    {relativeFromNow(log.created_at)}
                  </p>
                </div>
                <CalendarClock
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground/50"
                  aria-hidden
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
