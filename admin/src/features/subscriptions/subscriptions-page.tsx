import * as React from 'react'
import {
  CalendarPlus,
  CircleSlash,
  CreditCard,
  Loader2,
  Repeat2,
  RotateCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { daysUntil, formatDate, initials, peso } from '@/lib/format'
import { planLabel } from '@/lib/constants'
import type { Profile, Subscription, SubscriptionPlan } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { SearchInput } from '@/components/common/search-input'
import { FilterSelect } from '@/components/common/filter-select'
import { Pagination } from '@/components/common/pagination'
import { Modal } from '@/components/common/modal'
import { ConfirmModal } from '@/components/common/states'
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  TableWrap,
} from '@/components/common/states'
import { PlanBadge, StatusBadge } from '@/components/common/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type SubRow = Subscription & {
  user: Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name' | 'status'> | null
  plan: Pick<SubscriptionPlan, 'id' | 'name' | 'duration_days' | 'price' | 'is_trial'> | null
}

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function SubscriptionsPage() {
  const [searchInput, setSearchInput] = React.useState('')
  const search = useDebounced(searchInput)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)

  const [extendTarget, setExtendTarget] = React.useState<SubRow | null>(null)
  const [planTarget, setPlanTarget] = React.useState<SubRow | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<SubRow | null>(null)
  const [payTarget, setPayTarget] = React.useState<SubRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Reset to page 1 whenever search/filters change (adjust-during-render pattern).
  const [prevFilters, setPrevFilters] = React.useState({ search, statusFilter, planFilter })
  if (
    prevFilters.search !== search ||
    prevFilters.statusFilter !== statusFilter ||
    prevFilters.planFilter !== planFilter
  ) {
    setPrevFilters({ search, statusFilter, planFilter })
    setPage(1)
  }

  const plans = useAsync(async () => {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as SubscriptionPlan[]
  }, [])

  const subs = useAsync(async () => {
    let query = supabase
      .from('subscriptions')
      .select(
        '*, user:profiles(id, full_name, email, business_name, status), plan:subscription_plans(id, name, duration_days, price, is_trial)',
        { count: 'exact' }
      )
      .order('expires_at', { ascending: true })

    if (planFilter !== 'all') query = query.eq('plan_id', planFilter)

    const nowIso = new Date().toISOString()
    const weekIso = new Date(Date.now() + 7 * 86400000).toISOString()
    if (statusFilter === 'expiring') {
      query = query.in('status', ['trial', 'active']).gt('expires_at', nowIso).lte('expires_at', weekIso)
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (search) {
      const term = sanitizeSearch(search)
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`, {
        foreignTable: 'profiles',
      })
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(errorMessage(error))
    return { rows: (data ?? []) as SubRow[], total: count ?? 0 }
  }, [search, statusFilter, planFilter, page])

  async function runRpc(
    fn: string,
    args: Record<string, unknown>,
    successMessage: string
  ) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc(fn, args)
      if (error) throw new Error(errorMessage(error))
      toast.success(successMessage)
      setExtendTarget(null)
      setPlanTarget(null)
      setCancelTarget(null)
      setPayTarget(null)
      subs.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const rows = subs.data?.rows ?? []
  const total = subs.data?.total ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subscriptions"
        description="Free trials and paid plans — extend, change, cancel, and renew."
        actions={
          <Button variant="outline" size="sm" onClick={subs.reload}>
            <RotateCw className="size-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by user name or email…"
          className="w-full sm:max-w-xs"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-full sm:w-44"
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          label="Plan"
          value={planFilter}
          onChange={setPlanFilter}
          className="w-full sm:w-40"
          options={[
            { value: 'all', label: 'All plans' },
            ...(plans.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </div>

      <Card bodyClassName="p-0">
        {subs.loading ? (
          <LoadingRows rows={8} cols={6} />
        ) : subs.error ? (
          <div className="p-4">
            <ErrorState message={subs.error} onRetry={subs.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CreditCard}
              title="No subscriptions found"
              description="Every registered user gets a 30-day trial automatically."
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sub) => {
                  const days = daysUntil(sub.expires_at)
                  const active = sub.status === 'trial' || sub.status === 'active'
                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {initials(sub.user?.full_name, 'U')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{sub.user?.full_name ?? '—'}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {sub.user?.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlanBadge planId={sub.plan_id} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={sub.status} />
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {formatDate(sub.started_at)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{formatDate(sub.expires_at)}</p>
                          {active && (
                            <p
                              className={`text-[11px] font-medium ${
                                days < 0
                                  ? 'text-destructive'
                                  : days <= 3
                                    ? 'text-amber-400'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              {days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'expired'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
                        {peso(Number(sub.price_paid ?? 0))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExtendTarget(sub)}
                            title="Extend subscription"
                          >
                            <CalendarPlus className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPlanTarget(sub)}
                            title="Change plan"
                          >
                            <Repeat2 className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPayTarget(sub)}
                            title="Record mock payment"
                          >
                            <CreditCard className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setCancelTarget(sub)}
                            disabled={sub.status === 'cancelled'}
                            title="Cancel subscription"
                          >
                            <CircleSlash className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {/* Extend */}
      <ExtendModal
        target={extendTarget}
        busy={busy}
        onClose={() => setExtendTarget(null)}
        onConfirm={(days, reason) =>
          void runRpc(
            'admin_extend_subscription',
            { target_user: extendTarget?.user_id, extra_days: days, reason },
            `Extended ${extendTarget?.user?.full_name ?? 'user'} by ${days} day(s).`
          )
        }
      />

      {/* Change plan */}
      <ChangePlanModal
        target={planTarget}
        plans={plans.data ?? []}
        busy={busy}
        onClose={() => setPlanTarget(null)}
        onConfirm={(planId, reason) =>
          void runRpc(
            'admin_change_plan',
            { target_user: planTarget?.user_id, new_plan: planId, reason },
            `Plan changed to ${planLabel(planId)}.`
          )
        }
      />

      {/* Record payment */}
      <RecordPaymentForUserModal
        target={payTarget}
        plans={plans.data ?? []}
        busy={busy}
        onClose={() => setPayTarget(null)}
        onConfirm={(planId, method, notes) =>
          void runRpc(
            'admin_record_mock_payment',
            {
              target_user: payTarget?.user_id,
              target_plan: planId,
              p_method: method,
              p_notes: notes,
              p_activate: true,
            },
            'Mock payment recorded and subscription activated.'
          )
        }
      />

      <ConfirmModal
        open={cancelTarget !== null}
        title="Cancel subscription?"
        danger
        busy={busy}
        confirmLabel="Cancel subscription"
        message={
          <>
            Cancel the subscription for{' '}
            <strong>{cancelTarget?.user?.full_name || cancelTarget?.user?.email}</strong>? Access
            continues until {formatDate(cancelTarget?.expires_at)} and will not renew.
          </>
        }
        onConfirm={() =>
          cancelTarget &&
          void runRpc(
            'admin_cancel_subscription',
            { target_user: cancelTarget.user_id, reason: 'Cancelled from admin dashboard' },
            'Subscription cancelled.'
          )
        }
        onClose={() => setCancelTarget(null)}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function ExtendModal({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: SubRow | null
  busy: boolean
  onClose: () => void
  onConfirm: (days: number, reason: string) => void
}) {
  const [days, setDays] = React.useState(30)
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (target) {
      setDays(30)
      setReason('')
    }
  }, [target])

  return (
    <Modal open={target !== null} onClose={onClose} title="Extend subscription">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Extending <strong>{target?.user?.full_name || target?.user?.email}</strong> — currently{' '}
          {planLabel(target?.plan_id)}, expires {formatDate(target?.expires_at)}.
        </p>
        <Field label="Days to add">
          <div className="flex gap-2">
            {[7, 14, 30, 90].map((d) => (
              <Button
                key={d}
                type="button"
                variant={days === d ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={1}
            max={3650}
            className="mt-2"
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
          />
        </Field>
        <Field label="Reason (optional, stored in activity logs)">
          <Input
            type="text"
            placeholder="e.g. goodwill extension after outage"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onConfirm(days, reason || 'Extended from admin dashboard')}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Extend {days} days
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ChangePlanModal({
  target,
  plans,
  busy,
  onClose,
  onConfirm,
}: {
  target: SubRow | null
  plans: SubscriptionPlan[]
  busy: boolean
  onClose: () => void
  onConfirm: (planId: string, reason: string) => void
}) {
  const [planId, setPlanId] = React.useState('')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (target) {
      setPlanId(plans.find((p) => !p.is_trial)?.id ?? plans[0]?.id ?? '')
      setReason('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const selected = plans.find((p) => p.id === planId)

  return (
    <Modal open={target !== null} onClose={onClose} title="Change plan">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Switch <strong>{target?.user?.full_name || target?.user?.email}</strong> from{' '}
          {planLabel(target?.plan_id)}. The new plan's duration is added on top of the current
          expiry.
        </p>
        <Field label="New plan">
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.duration_days} days · {peso(Number(p.price))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {selected && (
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            Access until{' '}
            <strong>
              {formatDate(
                new Date(
                  Math.max(
                    Date.now(),
                    target ? new Date(target.expires_at).getTime() : Date.now()
                  ) +
                    selected.duration_days * 86400000
                )
              )}
            </strong>
          </div>
        )}
        <Field label="Reason (optional)">
          <Input
            type="text"
            placeholder="e.g. customer upgraded by phone"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !planId}
            onClick={() => onConfirm(planId, reason || 'Plan changed from admin dashboard')}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Change plan
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RecordPaymentForUserModal({
  target,
  plans,
  busy,
  onClose,
  onConfirm,
}: {
  target: SubRow | null
  plans: SubscriptionPlan[]
  busy: boolean
  onClose: () => void
  onConfirm: (planId: string, method: string, notes: string) => void
}) {
  const [planId, setPlanId] = React.useState('')
  const [method, setMethod] = React.useState('mock_gcash')
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (target) {
      setPlanId(plans.find((p) => !p.is_trial)?.id ?? plans[0]?.id ?? '')
      setMethod('mock_gcash')
      setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return (
    <Modal open={target !== null} onClose={onClose} title="Record mock payment">
      <div className="space-y-4">
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-300">
          Mock payments are simulated — no real gateway is contacted. The subscription is activated
          or extended immediately.
        </div>
        <p className="text-sm text-muted-foreground">
          For <strong>{target?.user?.full_name || target?.user?.email}</strong> (currently{' '}
          {planLabel(target?.plan_id)}).
        </p>
        <Field label="Plan">
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans
                .filter((p) => !p.is_trial)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {peso(Number(p.price))}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Method">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock_gcash">GCash (mock)</SelectItem>
              <SelectItem value="mock_card">Card (mock)</SelectItem>
              <SelectItem value="mock_bank">Bank transfer (mock)</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Input
            type="text"
            placeholder="e.g. walk-in payment recorded by support"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !planId}
            onClick={() => onConfirm(planId, method, notes)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Record payment
          </Button>
        </div>
      </div>
    </Modal>
  )
}
