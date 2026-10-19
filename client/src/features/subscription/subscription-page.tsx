import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Crown,
  FileText,
  Hourglass,
  QrCode,
  RefreshCw,
  Sparkles,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
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
import { StatusBadge } from '@/components/common/status-badge'
import { formatDate, formatDateTime, peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from '@/hooks/use-online-status'
import type { PaymentRequest, PaymentRequestStatus, PlanRecord } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { GcashPaymentDialog } from './gcash-payment-dialog'

const PLAN_ICONS = [Zap, BadgeCheck, Crown] as const

const REQUEST_STATUS: Record<PaymentRequestStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending Verification',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  approved: {
    label: 'Approved',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
}

function PaymentRequestStatusBadge({ status }: { status: PaymentRequestStatus }) {
  const cfg = REQUEST_STATUS[status]
  return (
    <Badge variant="outline" className={cn('font-medium', cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

/** "week" / "month" / "year" for the common durations, else "N days". */
function periodLabel(days: number): string {
  if (days === 7) return 'week'
  if (days === 30 || days === 31) return 'month'
  if (days === 365 || days === 366) return 'year'
  return `${days} days`
}

function TrialPanel() {
  const { state, sub } = useSubscription()
  if (!sub || sub.plan !== 'trial') return null
  const total = sub.durationDays && sub.durationDays > 0 ? sub.durationDays : 30
  const used = Math.max(0, Math.min(total, total - state.daysLeft))
  const pct = Math.round((used / total) * 100)
  return (
    <Card className="gap-4 border-emerald-200 bg-gradient-to-br from-emerald-50 to-background shadow-none">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-emerald-600" aria-hidden />
            {total}-day free trial
          </CardTitle>
          <StatusBadge status={state.status} />
        </div>
        <CardDescription>
          Full access to every feature. When the trial ends, selling and checkout lock until you
          choose a plan — your data stays intact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="text-sm font-medium">{formatDate(sub.startedAt)}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Expires</p>
            <p className="text-sm font-medium">{formatDate(sub.expiresAt)}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Days remaining</p>
            <p className="text-sm font-semibold text-emerald-700">{state.daysLeft} days left</p>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>Trial progress</span>
            <span>
              {used}/{total} days used
            </span>
          </div>
          <Progress value={pct} className="h-2" aria-label={`${pct}% of trial used`} />
        </div>
      </CardContent>
    </Card>
  )
}

function PendingBanner({ request }: { request: PaymentRequest }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Hourglass className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          GCash payment pending verification — {request.planName ?? request.plan} plan
        </p>
        <p className="text-xs text-amber-700/90">
          Reference <span className="font-mono">{request.referenceNo}</span> · submitted{' '}
          {formatDateTime(request.createdAt)}. Your plan activates once an administrator approves it.
        </p>
      </div>
      <PaymentRequestStatusBadge status="pending" />
    </div>
  )
}

function PlanCardSkeleton() {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-9 w-full" />
      </CardFooter>
    </Card>
  )
}

export function SubscriptionPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const {
    sub,
    state,
    transactions,
    paymentRequests,
    plans,
    plansLoading,
    plansError,
    gcashQr,
    refreshRemote,
  } = useSubscription()
  const [checkoutPlan, setCheckoutPlan] = React.useState<PlanRecord | null>(null)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  const subTransactions = transactions.filter((t) => t.type === 'subscription')
  const pendingRequest = paymentRequests.find((r) => r.status === 'pending') ?? null
  const showSkeleton = plansLoading && plans.length === 0
  const showError = !plansLoading && plans.length === 0 && Boolean(plansError)
  const showEmpty = !plansLoading && plans.length === 0 && !plansError

  const currentPlanName =
    sub?.planName ?? (sub?.plan === 'trial' ? 'Free trial' : sub?.plan ?? 'No plan')

  function openCheckout(plan: PlanRecord) {
    setCheckoutPlan(plan)
    setCheckoutOpen(true)
  }

  async function checkStatus() {
    setRefreshing(true)
    try {
      await refreshRemote()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Subscription & billing"
        description="Choose a plan, pay manually via GCash, and track your payment verification."
        actions={
          state.status === 'expired' ? (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
              Selling locked — renew to continue
            </Badge>
          ) : undefined
        }
      />

      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <WifiOff className="size-3.5 shrink-0" aria-hidden />
          You are offline. Plans and the GCash QR shown below are the last saved versions — an
          internet connection is required to submit a payment or check its status.
        </div>
      )}

      {pendingRequest && <PendingBanner request={pendingRequest} />}

      {sub && (
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {currentPlanName}
                  <StatusBadge status={state.status} />
                </CardTitle>
                <CardDescription>
                  {state.expiresAt ? (
                    <>
                      Active until{' '}
                      <strong className="font-medium text-foreground">{formatDate(state.expiresAt)}</strong>
                      {state.canSell && (
                        <>
                          {' '}
                          · {state.daysLeft} day{state.daysLeft === 1 ? '' : 's'} remaining
                        </>
                      )}
                    </>
                  ) : (
                    'No active subscription'
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden />
                {sub.pricePaid > 0 ? peso(sub.pricePaid) : 'No charge'}
                {sub.durationDays ? ` · ${sub.durationDays} days` : ''}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Current plan</p>
              <p className="text-sm font-medium">{currentPlanName}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Start date</p>
              <p className="text-sm font-medium">{formatDate(sub.startedAt)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Expiration date</p>
              <p className="text-sm font-medium">{formatDate(sub.expiresAt)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <TrialPanel />

      <section aria-labelledby="plans-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="plans-heading" className="text-lg font-semibold tracking-tight">
            Choose a plan
          </h2>
          <Button variant="outline" size="sm" onClick={() => void checkStatus()} disabled={refreshing || !online}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Check for updates
          </Button>
        </div>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <QrCode className="size-3.5" aria-hidden />
          Pay manually via GCash QR — a pending request is created for admin verification.
        </p>

        {showSkeleton ? (
          <div className="mt-2 grid gap-4 md:grid-cols-3">
            <PlanCardSkeleton />
            <PlanCardSkeleton />
            <PlanCardSkeleton />
          </div>
        ) : showError ? (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <EmptyState
              icon={WifiOff}
              title="Couldn’t load subscription plans"
              description={plansError ?? 'Please try again.'}
              className="border-0 bg-transparent py-10"
              action={
                <Button variant="outline" size="sm" onClick={() => void checkStatus()} disabled={refreshing}>
                  <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                  Retry
                </Button>
              }
            />
          </div>
        ) : showEmpty ? (
          <EmptyState
            icon={FileText}
            title="No plans available right now"
            description="The administrator hasn’t published any active subscription plans yet. Please check back soon."
          />
        ) : (
          <div className="mt-2 grid gap-4 md:grid-cols-3">
            {plans.map((plan, idx) => {
              const Icon = PLAN_ICONS[idx % PLAN_ICONS.length]
              const isCurrent = sub?.plan === plan.id && state.canSell
              return (
                <Card key={plan.id} className="relative flex flex-col overflow-visible shadow-none">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div>
                        <CardTitle className="text-base">{plan.name}</CardTitle>
                        {plan.description && (
                          <CardDescription className="text-xs">{plan.description}</CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-semibold tracking-tight">
                        {peso(plan.price).replace('.00', '')}
                      </span>
                      <span className="text-sm text-muted-foreground">/{periodLabel(plan.durationDays)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Billed once · {plan.durationDays} days of access
                    </p>
                    {plan.features.length > 0 && (
                      <>
                        <Separator />
                        <ul className="space-y-2">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-sm">
                              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={isCurrent || !online}
                      title={!online ? 'Connect to the internet to purchase a plan' : undefined}
                      onClick={() => openCheckout(plan)}
                    >
                      {isCurrent ? (
                        <>
                          <BadgeCheck className="size-4" /> Current plan
                        </>
                      ) : state.status === 'expired' ? (
                        <>
                          <Clock className="size-4" /> Renew with {plan.name}
                        </>
                      ) : (
                        <>
                          <QrCode className="size-4" /> Pay {plan.name} via GCash
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}

        {plans.length > 0 && plansError && (
          <p className="mt-3 text-xs text-amber-700">
            Showing the last saved plans. {plansError}
          </p>
        )}
      </section>

      <section aria-labelledby="requests-heading">
        <h2 id="requests-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Payment requests
        </h2>
        <Card className="shadow-none">
          <CardContent className="p-0">
            {paymentRequests.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No payment requests yet"
                description="When you submit a GCash payment, it appears here awaiting verification."
                className="border-0"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="hidden sm:table-cell">Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-mono text-xs">{r.referenceNo}</p>
                          {r.notes && (
                            <p className="max-w-[16rem] truncate text-[11px] text-muted-foreground">
                              {r.notes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.planName ?? r.plan}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {formatDateTime(r.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <PaymentRequestStatusBadge status={r.status} />
                            {r.status === 'approved' && (
                              <p className="text-[11px] text-emerald-700">
                                Approved {r.reviewedAt ? formatDate(r.reviewedAt) : ''}
                              </p>
                            )}
                            {r.status === 'rejected' && r.rejectionReason && (
                              <p className="flex items-start gap-1 text-[11px] text-red-600">
                                <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                                {r.rejectionReason}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{peso(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="billing-heading">
        <h2 id="billing-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Billing & transaction history
        </h2>
        <Card className="shadow-none">
          <CardContent className="p-0">
            {subTransactions.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No payments yet"
                description="You are on the free trial. Your first approved payment will appear here."
                className="border-0"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                        <TableCell>{t.description}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(t.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{peso(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground">
        After expiry: selling and checkout are locked, but your products, inventory, orders, and
        reports remain fully accessible.{' '}
        {user && <Link to="/profile" className="underline underline-offset-2">Account settings</Link>}
      </p>

      <GcashPaymentDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        plan={checkoutPlan}
        gcashQrUrl={gcashQr.url}
        gcashQrError={gcashQr.error ?? null}
        currentExpiry={state.canSell ? state.expiresAt : null}
      />
    </div>
  )
}
