import * as React from 'react'
import {
  CheckCircle2,
  ImageOff,
  Link2,
  Loader2,
  RotateCw,
  Search,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { formatDateTime, peso } from '@/lib/format'
import { planLabel } from '@/lib/constants'
import {
  approvePaymentRequest,
  fetchPaymentRequests,
  linkPaymentRequest,
  rejectPaymentRequest,
  resolveProofHref,
} from '@/lib/payment-requests'
import type { PaymentRequest, Profile } from '@/lib/types'
import { Card, EmptyState, ErrorState, LoadingRows, TableWrap } from '@/components/common/states'
import { Modal } from '@/components/common/modal'
import { ConfirmModal } from '@/components/common/states'
import { PaymentRequestStatusBadge } from '@/components/common/status-badge'
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

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending verification' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export function PaymentRequestsPanel() {
  const [statusFilter, setStatusFilter] = React.useState('pending')
  const [busy, setBusy] = React.useState(false)
  const [proofTarget, setProofTarget] = React.useState<PaymentRequest | null>(null)
  const [approveTarget, setApproveTarget] = React.useState<PaymentRequest | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<PaymentRequest | null>(null)
  const [linkTarget, setLinkTarget] = React.useState<PaymentRequest | null>(null)

  const requests = useAsync(() => fetchPaymentRequests(), [])

  const rows = React.useMemo(() => {
    const all = requests.data ?? []
    return statusFilter === 'all' ? all : all.filter((r) => r.status === statusFilter)
  }, [requests.data, statusFilter])

  const pendingCount = (requests.data ?? []).filter((r) => r.status === 'pending').length

  async function runApprove(pr: PaymentRequest) {
    setBusy(true)
    try {
      await approvePaymentRequest(pr.id, 'Approved from admin dashboard')
      toast.success(`Payment ${pr.reference_no} approved — subscription activated.`)
      setApproveTarget(null)
      requests.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function runReject(pr: PaymentRequest, reason: string) {
    setBusy(true)
    try {
      await rejectPaymentRequest(pr.id, reason)
      toast.success(`Payment ${pr.reference_no} rejected.`)
      setRejectTarget(null)
      requests.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
        Manual GCash QR payments. Customers submit a reference number and receipt screenshot; nothing
        is activated until you approve. Submitting a screenshot is <strong>not</strong> proof of
        payment on its own — verify it against your GCash account first.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1" />
        <div className="w-full sm:w-52">
          <Label className="mb-1.5 block text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                  {s.value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={requests.reload}>
          <RotateCw className="size-4" />
          Refresh
        </Button>
      </div>

      <Card bodyClassName="p-0">
        {requests.loading ? (
          <LoadingRows rows={6} cols={6} />
        ) : requests.error ? (
          <div className="p-4">
            <ErrorState message={requests.error} onRetry={requests.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Search}
              title="No payment requests"
              description={
                statusFilter === 'pending'
                  ? 'There are no GCash payments awaiting verification.'
                  : 'No requests match this filter.'
              }
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden lg:table-cell">Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((pr) => (
                  <TableRow key={pr.id}>
                    <TableCell>
                      <p className="font-mono text-xs font-medium">{pr.reference_no}</p>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => setProofTarget(pr)}
                      >
                        View proof
                      </button>
                    </TableCell>
                    <TableCell>
                      <p className="truncate text-sm">
                        {pr.user?.full_name ?? pr.submitter_name ?? '—'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {pr.user?.email ?? pr.submitter_email ?? pr.client_user_id ?? 'Offline device'}
                      </p>
                      {pr.user_id === null && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          <Link2 className="size-2.5" /> unlinked
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {pr.plan?.name ?? planLabel(pr.plan_id)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {peso(Number(pr.amount))}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {formatDateTime(pr.created_at)}
                    </TableCell>
                    <TableCell>
                      <PaymentRequestStatusBadge status={pr.status} />
                      {pr.status === 'rejected' && pr.rejection_reason && (
                        <p className="mt-1 max-w-[14rem] text-[11px] text-muted-foreground">
                          {pr.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {pr.status === 'pending' && (
                          <>
                            {pr.user_id === null && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLinkTarget(pr)}
                                title="Link to a customer"
                              >
                                <Link2 className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-400"
                              disabled={pr.user_id === null}
                              title={
                                pr.user_id === null
                                  ? 'Link this request to a customer first'
                                  : 'Approve & activate'
                              }
                              onClick={() => setApproveTarget(pr)}
                            >
                              <CheckCircle2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setRejectTarget(pr)}
                              title="Reject"
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

      <ProofViewer target={proofTarget} onClose={() => setProofTarget(null)} />

      <ConfirmModal
        open={approveTarget !== null}
        title="Approve GCash payment?"
        busy={busy}
        confirmLabel="Approve & activate"
        message={
          <>
            Approve <strong className="font-mono">{approveTarget?.reference_no}</strong> for{' '}
            <strong>
              {approveTarget?.user?.full_name ??
                approveTarget?.user?.email ??
                approveTarget?.submitter_email}
            </strong>
            ? The {approveTarget?.plan?.name ?? planLabel(approveTarget?.plan_id)} subscription will
            be activated or extended by its duration.
          </>
        }
        onConfirm={() => approveTarget && void runApprove(approveTarget)}
        onClose={() => setApproveTarget(null)}
      />

      <RejectModal
        target={rejectTarget}
        busy={busy}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => rejectTarget && void runReject(rejectTarget, reason)}
      />

      <LinkCustomerModal
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        onLinked={() => {
          setLinkTarget(null)
          requests.reload()
        }}
      />
    </div>
  )
}

function ProofViewer({
  target,
  onClose,
}: {
  target: PaymentRequest | null
  onClose: () => void
}) {
  const [href, setHref] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!target) {
      setHref(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setHref(null)
    void resolveProofHref(target)
      .then((url) => {
        if (!cancelled) setHref(url)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [target])

  return (
    <Modal open={target !== null} onClose={onClose} title="Payment proof" size="lg">
      {target && (
        <div className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Reference: </span>
              <span className="font-mono">{target.reference_no}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Amount: </span>
              {peso(Number(target.amount))}
            </p>
            <p>
              <span className="text-muted-foreground">Plan: </span>
              {target.plan?.name ?? planLabel(target.plan_id)}
            </p>
            <p>
              <span className="text-muted-foreground">Submitted: </span>
              {formatDateTime(target.created_at)}
            </p>
          </div>
          {target.notes && (
            <p className="rounded-lg bg-muted/60 p-3 text-sm">
              <span className="text-muted-foreground">Notes: </span>
              {target.notes}
            </p>
          )}
          <div className="flex min-h-56 items-center justify-center rounded-lg border bg-muted/30 p-3">
            {loading ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : href ? (
              <a href={href} target="_blank" rel="noreferrer" className="block">
                <img
                  src={href}
                  alt={`Payment proof for ${target.reference_no}`}
                  className="max-h-[60vh] w-auto rounded-md object-contain"
                />
              </a>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageOff className="size-7" />
                <p className="text-sm">No receipt image attached to this request.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function RejectModal({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: PaymentRequest | null
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (target) setReason('')
  }, [target])

  return (
    <Modal open={target !== null} onClose={onClose} title="Reject GCash payment">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Rejecting <strong className="font-mono">{target?.reference_no}</strong> does{' '}
          <strong>not</strong> change the customer's subscription. The reason below is shown to them.
        </p>
        <div className="space-y-1.5">
          <Label>Rejection reason (required)</Label>
          <Input
            type="text"
            placeholder="e.g. reference number not found in our GCash account"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Reject payment
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function LinkCustomerModal({
  target,
  onClose,
  onLinked,
}: {
  target: PaymentRequest | null
  onClose: () => void
  onLinked: () => void
}) {
  const [search, setSearch] = React.useState('')
  const debounced = useDebounced(search, 300)
  const [results, setResults] = React.useState<
    Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name'>[]
  >([])
  const [selected, setSelected] = React.useState<
    Pick<Profile, 'id' | 'full_name' | 'email'> | null
  >(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!target) {
      setSearch('')
      setResults([])
      setSelected(null)
    }
  }, [target])

  React.useEffect(() => {
    if (!target || !debounced.trim() || selected) {
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
      if (!cancelled && !error) {
        setResults(
          (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name'>[]
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debounced, target, selected])

  async function link() {
    if (!target || !selected) return
    setBusy(true)
    try {
      await linkPaymentRequest(target.id, selected.id)
      toast.success(`Linked to ${selected.full_name || selected.email}.`)
      onLinked()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title="Link to a customer">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This request has no Supabase customer attached. Link it before approving so the
          subscription can be activated.
        </p>
        {selected ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selected.full_name || '—'}</p>
              <p className="truncate text-xs text-muted-foreground">{selected.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <Input
              type="text"
              placeholder="Search by name, email, or business…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {results.length > 0 && (
              <ul className="rounded-xl border border-border bg-card p-1 shadow-md">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                      onClick={() => {
                        setSelected(u)
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
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !selected} onClick={() => void link()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Link customer
          </Button>
        </div>
      </div>
    </Modal>
  )
}
