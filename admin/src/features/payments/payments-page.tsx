import * as React from 'react'
import { CheckCircle2, Loader2, Plus, RotateCw, Search, Undo2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { formatDateTime, peso } from '@/lib/format'
import { PAYMENT_METHOD_LABELS, planLabel } from '@/lib/constants'
import type { Payment, PaymentStatus, Profile, SubscriptionPlan } from '@/lib/types'
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
import { PaymentStatusBadge } from '@/components/common/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PaymentRequestsPanel } from './payment-requests-panel'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type PaymentRow = Payment & {
  user: Pick<Profile, 'full_name' | 'email'> | null
  plan: { name: string } | null
}

const PAGE_SIZE = 20

export function PaymentsPage() {
  const [tab, setTab] = React.useState<'transactions' | 'verification'>('verification')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments"
        description="GCash QR verification queue and the payment ledger."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'transactions' | 'verification')}
        className="gap-4"
      >
        <TabsList>
          <TabsTrigger value="verification">Verification queue</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="verification">
          <PaymentRequestsPanel />
        </TabsContent>
        <TabsContent value="transactions">
          <TransactionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TransactionsPanel() {
  const [searchInput, setSearchInput] = React.useState('')
  const search = useDebounced(searchInput)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [methodFilter, setMethodFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [recordOpen, setRecordOpen] = React.useState(false)
  const [statusTarget, setStatusTarget] = React.useState<{ payment: PaymentRow; next: PaymentStatus } | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Reset to page 1 whenever search/filters change (adjust-during-render pattern).
  const [prevFilters, setPrevFilters] = React.useState({ search, statusFilter, methodFilter })
  if (
    prevFilters.search !== search ||
    prevFilters.statusFilter !== statusFilter ||
    prevFilters.methodFilter !== methodFilter
  ) {
    setPrevFilters({ search, statusFilter, methodFilter })
    setPage(1)
  }

  const payments = useAsync(async () => {
    let query = supabase
      .from('payments')
      .select('*, user:profiles(full_name, email), plan:subscription_plans(name)', {
        count: 'exact',
      })
      .order('paid_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (methodFilter !== 'all') query = query.eq('method', methodFilter)
    if (search) {
      const term = sanitizeSearch(search)
      query = query.or(`reference.ilike.%${term}%,notes.ilike.%${term}%`)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(errorMessage(error))
    return { rows: (data ?? []) as PaymentRow[], total: count ?? 0 }
  }, [search, statusFilter, methodFilter, page])

  const plans = useAsync(async () => {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as SubscriptionPlan[]
  }, [])

  async function changeStatus(payment: PaymentRow, next: PaymentStatus) {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: next })
        .eq('id', payment.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`Payment ${payment.reference} marked ${next}.`)
      setStatusTarget(null)
      payments.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const rows = payments.data?.rows ?? []
  const total = payments.data?.total ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments"
        description="Mock payment records — references, methods, statuses, and subscription history."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={payments.reload}>
              <RotateCw className="size-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <Plus className="size-4" />
              Record payment
            </Button>
          </>
        }
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
        All payments here are simulated (mock). No payment gateway is connected — recording a
        succeeded payment activates or extends the subscription immediately.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search reference or notes…"
          className="w-full sm:max-w-xs"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-full sm:w-40"
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'succeeded', label: 'Succeeded' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'refunded', label: 'Refunded' },
          ]}
        />
        <FilterSelect
          label="Method"
          value={methodFilter}
          onChange={setMethodFilter}
          className="w-full sm:w-44"
          options={[
            { value: 'all', label: 'All methods' },
            ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>

      <Card bodyClassName="p-0">
        {payments.loading ? (
          <LoadingRows rows={8} cols={6} />
        ) : payments.error ? (
          <div className="p-4">
            <ErrorState message={payments.error} onRetry={payments.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Search}
              title="No payments found"
              description="Record a mock payment or adjust your filters."
              action={
                <Button size="sm" onClick={() => setRecordOpen(true)}>
                  <Plus className="size-4" />
                  Record payment
                </Button>
              }
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Paid at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-mono text-xs font-medium">{p.reference}</p>
                      {p.notes && (
                        <p className="max-w-[16rem] truncate text-[11px] text-muted-foreground">
                          {p.notes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="truncate text-sm">{p.user?.full_name ?? '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.user?.email}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {p.plan?.name ?? planLabel(p.plan_id)}
                    </TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {peso(Number(p.amount))}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {formatDateTime(p.paid_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {p.status !== 'succeeded' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-400"
                            onClick={() => setStatusTarget({ payment: p, next: 'succeeded' })}
                            title="Mark succeeded"
                          >
                            <CheckCircle2 className="size-3.5" />
                          </Button>
                        )}
                        {p.status === 'succeeded' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-400"
                              onClick={() => setStatusTarget({ payment: p, next: 'refunded' })}
                              title="Mark refunded"
                            >
                              <Undo2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setStatusTarget({ payment: p, next: 'failed' })}
                              title="Mark failed"
                            >
                              <XCircle className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={undefined}
      />

      <RecordPaymentModal
        open={recordOpen}
        plans={plans.data ?? []}
        onClose={() => setRecordOpen(false)}
        onRecorded={() => payments.reload()}
      />

      <ConfirmModal
        open={statusTarget !== null}
        title={`Mark payment ${statusTarget?.next}?`}
        danger={statusTarget?.next === 'failed'}
        busy={busy}
        confirmLabel="Update status"
        message={
          <>
            Payment <strong className="font-mono">{statusTarget?.payment.reference}</strong> will be
            marked as <strong>{statusTarget?.next}</strong>. This change is recorded in the activity
            log.
          </>
        }
        onConfirm={() => statusTarget && void changeStatus(statusTarget.payment, statusTarget.next)}
        onClose={() => setStatusTarget(null)}
      />
    </div>
  )
}

function RecordPaymentModal({
  open,
  plans,
  onClose,
  onRecorded,
}: {
  open: boolean
  plans: SubscriptionPlan[]
  onClose: () => void
  onRecorded: () => void
}) {
  const [userSearch, setUserSearch] = React.useState('')
  const [results, setResults] = React.useState<Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name'>[]>([])
  const [selectedUser, setSelectedUser] = React.useState<Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name'> | null>(null)
  const [planId, setPlanId] = React.useState('')
  const [method, setMethod] = React.useState('mock_gcash')
  const [notes, setNotes] = React.useState('')
  const [activate, setActivate] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const debounced = useDebounced(userSearch, 300)

  React.useEffect(() => {
    if (!open) {
      setUserSearch('')
      setSelectedUser(null)
      setNotes('')
      setActivate(true)
      setMethod('mock_gcash')
      setResults([])
    }
  }, [open])

  React.useEffect(() => {
    if (!open || !debounced.trim() || selectedUser) {
      setResults([])
      return
    }
    let cancelled = false
    void (async () => {
      const term = sanitizeSearch(debounced)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, business_name')
        .eq('role', 'customer')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,business_name.ilike.%${term}%`)
        .limit(8)
      if (!cancelled) {
        if (!error) setResults((data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name'>[])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debounced, open, selectedUser])

  React.useEffect(() => {
    if (open && !planId) {
      setPlanId(plans.find((p) => !p.is_trial)?.id ?? '')
    }
  }, [open, plans, planId])

  async function record() {
    if (!selectedUser || !planId) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_record_mock_payment', {
        target_user: selectedUser.id,
        target_plan: planId,
        p_method: method,
        p_notes: notes || 'Recorded from admin dashboard',
        p_activate: activate,
      })
      if (error) throw new Error(errorMessage(error))
      toast.success(`Mock payment recorded for ${selectedUser.full_name || selectedUser.email}.`)
      onRecorded()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record mock payment">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Customer</Label>
          {selectedUser ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedUser.full_name || '—'}</p>
                <p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUser(null)
                  setUserSearch('')
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                type="text"
                placeholder="Search by name, email, or business…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="rounded-xl border border-border bg-card p-1 shadow-md">
                  {results.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                        onClick={() => {
                          setSelectedUser(u)
                          setResults([])
                        }}
                      >
                        <span className="text-sm font-medium">{u.full_name || u.email}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {debounced && !selectedUser && results.length === 0 && (
                <p className="text-xs text-muted-foreground">No matching customers.</p>
              )}
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans
                .filter((p) => !p.is_trial)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.duration_days} days · {peso(Number(p.price))}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Input
            type="text"
            placeholder="e.g. recorded during support call"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <Switch checked={activate} onCheckedChange={setActivate} />
          <span className="text-sm">Activate / extend the subscription immediately</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !selectedUser || !planId}
            onClick={() => void record()}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Record payment
          </Button>
        </div>
      </div>
    </Modal>
  )
}
