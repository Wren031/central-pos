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
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
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
import { PLAN_DAYS, PLAN_LABELS, PLAN_PRICES } from '@/lib/repos'
import { cn } from '@/lib/utils'
import type { PaymentRequest, PaymentRequestStatus, PlanId } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { GcashPaymentDialog } from './gcash-payment-dialog'

const PLAN_FEATURES: Record<Exclude<PlanId, 'trial'>, string[]> = {
  weekly: ['Full POS workspace', 'Product catalog & inventory', 'Order history & receipts', 'Email support'],
  monthly: [
    'Everything in Weekly',
    'Sales reports & analytics',
    'Priority chat support',
    'Free POS type changes',
  ],
  yearly: [
    'Everything in Monthly',
    '2 months free vs monthly',
    'Dedicated onboarding call',
    'Early access to new POS types',
  ],
}

const PLAN_META: Record<
  Exclude<PlanId, 'trial'>,
  { icon: React.ElementType; highlight?: boolean; blurb: string }
> = {
  weekly: { icon: Zap, blurb: 'Try a plan week-to-week' },
  monthly: { icon: BadgeCheck, highlight: true, blurb: 'Most popular for small stores' },
  yearly: { icon: Crown, blurb: 'Best value — save ₱989' },
}

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

function TrialPanel() {
  const { state, sub } = useSubscription()
  if (!sub || sub.plan !== 'trial') return null
  const total = 30
  const used = Math.max(0, Math.min(total, total - state.daysLeft))
  const pct = Math.round((used / total) * 100)
  return (
    <Card className="gap-4 border-emerald-200 bg-gradient-to-br from-emerald-50 to-background shadow-none">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-emerald-600" aria-hidden />
            30-day free trial
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
          GCash payment pending verification — {PLAN_LABELS[request.plan]} plan
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

export function SubscriptionPage() {
  const { user } = useAuth()
  const { sub, state, transactions, paymentRequests } = useSubscription()
  const [checkoutPlan, setCheckoutPlan] = React.useState<Exclude<PlanId, 'trial'> | null>(null)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)

  const subTransactions = transactions.filter((t) => t.type === 'subscription')
  const pendingRequest = paymentRequests.find((r) => r.status === 'pending') ?? null

  function openCheckout(plan: Exclude<PlanId, 'trial'>) {
    setCheckoutPlan(plan)
    setCheckoutOpen(true)
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

      {pendingRequest && <PendingBanner request={pendingRequest} />}

      {sub && (
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {PLAN_LABELS[sub.plan]} plan
                  <StatusBadge status={state.status} />
                </CardTitle>
                <CardDescription>
                  {state.expiresAt ? (
                    <>
                      Active until <strong className="font-medium text-foreground">{formatDate(state.expiresAt)}</strong>
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
                {sub.pricePaid > 0 ? peso(sub.pricePaid) : 'No charge'} ·{' '}
                {PLAN_DAYS[sub.plan as Exclude<PlanId, 'trial'>] ?? 30} days
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Current plan</p>
              <p className="text-sm font-medium">{PLAN_LABELS[sub.plan]}</p>
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
        <h2 id="plans-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Choose a plan
        </h2>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <QrCode className="size-3.5" aria-hidden />
          Pay manually via GCash QR — a pending request is created for admin verification.
        </p>
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          {(['weekly', 'monthly', 'yearly'] as const).map((plan) => {
            const meta = PLAN_META[plan]
            const Icon = meta.icon
            const isCurrent = sub?.plan === plan && state.canSell
            return (
              <Card
                key={plan}
                className={cn(
                  'relative flex flex-col overflow-visible shadow-none',
                  meta.highlight && 'border-primary/40 shadow-md ring-1 ring-primary/20'
                )}
              >
                {meta.highlight && (
                  <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
                    Most popular
                  </span>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg',
                        meta.highlight ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <CardTitle className="text-base">{PLAN_LABELS[plan]}</CardTitle>
                      <CardDescription className="text-xs">{meta.blurb}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight">
                      {peso(PLAN_PRICES[plan]).replace('.00', '')}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      /{plan === 'weekly' ? 'week' : plan === 'monthly' ? 'month' : 'year'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Billed once · {PLAN_DAYS[plan]} days of access
                    {plan === 'yearly' && (
                      <span className="ml-1 font-medium text-emerald-600">(save ₱989)</span>
                    )}
                  </p>
                  <Separator />
                  <ul className="space-y-2">
                    {PLAN_FEATURES[plan].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={meta.highlight ? 'default' : 'outline'}
                    disabled={isCurrent}
                    onClick={() => openCheckout(plan)}
                  >
                    {isCurrent ? (
                      <>
                        <BadgeCheck className="size-4" /> Current plan
                      </>
                    ) : state.status === 'expired' ? (
                      <>
                        <Clock className="size-4" /> Renew with {PLAN_LABELS[plan]}
                      </>
                    ) : (
                      <>
                        <QrCode className="size-4" /> Pay {PLAN_LABELS[plan]} via GCash
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
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
                        <TableCell className="text-sm">{PLAN_LABELS[r.plan]}</TableCell>
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
        currentExpiry={state.canSell ? state.expiresAt : null}
      />
    </div>
  )
}
