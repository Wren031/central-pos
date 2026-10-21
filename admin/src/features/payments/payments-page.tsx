import * as React from 'react'
import {
  CheckCircle2,
  Loader2,
  QrCode,
  RotateCw,
  Search,
  Upload,
  Undo2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { formatDateTime, peso } from '@/lib/format'
import { planLabel } from '@/lib/constants'
import {
  fetchGcashQr,
  setGcashQrActive,
  setGcashQrFromFile,
  setGcashQrUrl,
  type GcashQrSetting,
} from '@/lib/payment-requests'
import type { Payment, PaymentStatus, Profile } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { SearchInput } from '@/components/common/search-input'
import { FilterSelect } from '@/components/common/filter-select'
import { Pagination } from '@/components/common/pagination'
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
import { hasReceipt, ReceiptButton, ReceiptViewer } from './receipt-viewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
        title="GCash Payments"
        description="Verify customer GCash transfers, review receipts, and browse the payment ledger."
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

      <GcashQrCard />
    </div>
  )
}

function TransactionsPanel() {
  const [searchInput, setSearchInput] = React.useState('')
  const search = useDebounced(searchInput)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [statusTarget, setStatusTarget] = React.useState<{ payment: PaymentRow; next: PaymentStatus } | null>(null)
  const [receiptTarget, setReceiptTarget] = React.useState<PaymentRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Reset to page 1 whenever search/filters change (adjust-during-render pattern).
  const [prevFilters, setPrevFilters] = React.useState({ search, statusFilter })
  if (prevFilters.search !== search || prevFilters.statusFilter !== statusFilter) {
    setPrevFilters({ search, statusFilter })
    setPage(1)
  }

  const payments = useAsync(async () => {
    let query = supabase
      .from('payments')
      .select(
        '*, user:profiles(full_name, email), plan:subscription_plans(name), payment_request:payment_requests(id, reference_no, proof_path, proof_url, notes, created_at)',
        { count: 'exact' }
      )
      .order('paid_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (search) {
      const term = sanitizeSearch(search)
      query = query.or(`reference.ilike.%${term}%,notes.ilike.%${term}%`)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(errorMessage(error))
    return { rows: (data ?? []) as PaymentRow[], total: count ?? 0 }
  }, [search, statusFilter, page])

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
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={payments.reload}>
          <RotateCw className="size-4" />
          Refresh
        </Button>
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
              description="Approved GCash payments appear here automatically."
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
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Paid at</TableHead>
                  <TableHead>Receipt</TableHead>
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
                      {hasReceipt({
                        proofPath: p.payment_request?.proof_path,
                        proofUrl: p.payment_request?.proof_url,
                      }) ? (
                        <ReceiptButton onClick={() => setReceiptTarget(p)} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
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

      <ReceiptViewer
        subject={
          receiptTarget
            ? {
                reference: receiptTarget.reference,
                amount: Number(receiptTarget.amount),
                planId: receiptTarget.plan_id,
                planName: receiptTarget.plan?.name ?? null,
                submittedAt:
                  receiptTarget.payment_request?.created_at ?? receiptTarget.paid_at,
                notes: receiptTarget.payment_request?.notes ?? receiptTarget.notes,
                proofPath: receiptTarget.payment_request?.proof_path,
                proofUrl: receiptTarget.payment_request?.proof_url,
              }
            : null
        }
        onClose={() => setReceiptTarget(null)}
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

/* -------------------------------------------------------------------------- */
/* GCash QR configuration                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The QR the POS client shows on its subscription page. Lives here (next to the
 * verification queue) instead of Settings, so everything GCash is in one place.
 */
function GcashQrCard() {
  const [open, setOpen] = React.useState(false)
  const [setting, setSetting] = React.useState<GcashQrSetting | null>(null)
  const [url, setUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const qr = useAsync(async () => fetchGcashQr(), [])

  React.useEffect(() => {
    if (qr.data) setSetting(qr.data)
  }, [qr.data])

  async function upload(file: File) {
    setBusy(true)
    try {
      const next = await setGcashQrFromFile(file)
      setSetting(next)
      toast.success('GCash QR code updated and activated.')
      qr.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveUrl() {
    setBusy(true)
    try {
      const next = await setGcashQrUrl(url)
      setSetting(next)
      toast.success('GCash QR URL saved.')
      qr.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(active: boolean) {
    setBusy(true)
    try {
      const next = await setGcashQrActive(active)
      setSetting(next)
      toast.success(active ? 'GCash QR is now visible to customers.' : 'GCash QR hidden.')
      qr.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <QrCode className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-medium">GCash QR code</span>
            <span className="block text-xs text-muted-foreground">
              The QR customers scan on the POS subscription page.
            </span>
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{open ? 'Hide' : 'Manage'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {qr.loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : qr.error ? (
            <ErrorState message={qr.error} onRetry={qr.reload} />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
                {setting?.url ? (
                  <img src={setting.url} alt="GCash QR code" className="size-full object-contain" />
                ) : (
                  <span className="px-3 text-center text-[11px] text-muted-foreground">
                    No QR image configured yet.
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <Switch
                    checked={setting?.active ?? true}
                    disabled={busy}
                    onCheckedChange={(v) => void toggle(v)}
                  />
                  <span className="text-sm">Show this QR to customers</span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void upload(file)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    Upload image
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label>Or use an image URL</Label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://…/gcash-qr.png"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={busy || !url.trim()}
                      onClick={() => void saveUrl()}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Upload your real GCash QR image. The POS client shows a “not configured” notice
                  when this is empty or hidden.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
