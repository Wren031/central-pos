import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CreditCard,
  History,
  Store,
  TimerReset,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { peso, pesoCompact, formatDate, relativeFromNow } from '@/lib/format'
import { planLabel } from '@/lib/constants'
import type { ActivityLog, DashboardStats } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
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
  'user.suspend': 'border-red-200 bg-red-50 text-red-700',
  'user.activate': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'user.status_changed': 'border-amber-200 bg-amber-50 text-amber-700',
  'subscription.extend': 'border-sky-200 bg-sky-50 text-sky-700',
  'subscription.change_plan': 'border-indigo-200 bg-indigo-50 text-indigo-700',
  'subscription.cancel': 'border-zinc-200 bg-zinc-100 text-zinc-600',
  'payment.record': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'payment.status_changed': 'border-amber-200 bg-amber-50 text-amber-700',
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

export function DashboardPage() {
  const stats = useAsync(loadStats, [])
  const activity = useAsync(loadRecentActivity, [])

  if (stats.loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dashboard" description="Loading platform statistics…" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  if (stats.error || !stats.data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dashboard" />
        <ErrorState message={stats.error ?? 'No data returned.'} onRetry={stats.reload} />
      </div>
    )
  }

  const t = stats.data.totals

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Subscription platform overview — users, stores, plans, and revenue."
        actions={
          <Button variant="outline" size="sm" onClick={stats.reload}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Total users" value={String(t.customers)} hint={`${t.admins} admin(s)`} tone="primary" />
        <StatCard icon={Store} label="Registered stores" value={String(t.stores)} tone="secondary" />
        <StatCard icon={CreditCard} label="Active subscriptions" value={String(t.active_subscriptions)} tone="success" />
        <StatCard icon={TimerReset} label="Free trials" value={String(t.trials)} hint={`${t.expiring_soon} expiring soon`} tone="info" />
        <StatCard icon={AlertTriangle} label="Expired" value={String(t.expired)} hint={`${t.suspended_users} suspended`} tone="error" />
        <StatCard icon={Banknote} label="Revenue (all time)" value={pesoCompact(t.revenue)} hint={`${peso(t.revenue_30d)} last 30 days`} tone="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Revenue" description="Succeeded payments, last 12 months" className="lg:col-span-2">
          <RevenueAreaChart data={stats.data.revenue_by_month} />
        </Card>
        <Card title="Subscription status" description="Current rows by status">
          <StatusDonutChart data={stats.data.statuses} />
        </Card>
      </div>

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
            <ul className="divide-y divide-border">
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
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {item.days_left}d
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              to="/subscriptions"
              className="text-xs font-medium text-primary hover:underline"
            >
              Manage subscriptions →
            </Link>
          </div>
        </Card>
      </div>

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
          <ul className="divide-y divide-border">
            {(activity.data ?? []).map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                    ENTITY_TONE[log.action] ?? 'border-zinc-200 bg-zinc-100 text-zinc-600'
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
