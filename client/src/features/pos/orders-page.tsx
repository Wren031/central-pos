import * as React from 'react'
import { Link } from 'react-router-dom'
import { Eye, ReceiptText, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { formatDateTime, peso } from '@/lib/format'
import { DATE_RANGE_DEFAULT, rangeCutoff, type DateRange } from '@/lib/date-range'
import { mockClock } from '@/lib/mock-clock'
import { getOrders, setOrderPaymentStatus } from '@/lib/repos'
import type { Order } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { DateRangeSelect } from './date-range-select'
import { ReceiptDialog } from './receipt-dialog'
import { toast } from 'sonner'

export function OrdersPage() {
  const { user, store } = useAuth()
  const [orders, setOrders] = React.useState<Order[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'paid' | 'unpaid'>('all')
  const [range, setRange] = React.useState<DateRange>(DATE_RANGE_DEFAULT)
  const [detail, setDetail] = React.useState<Order | null>(null)
  const [receipt, setReceipt] = React.useState<Order | null>(null)
  const [receiptOpen, setReceiptOpen] = React.useState(false)

  const refresh = React.useCallback(() => {
    if (!store) return
    setOrders(getOrders(store.id))
  }, [store])

  React.useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('cpos:data-changed', handler)
    return () => window.removeEventListener('cpos:data-changed', handler)
  }, [refresh])

  if (!store) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={ReceiptText}
          title="No store configured"
          description="Set up a POS type to start recording orders."
          action={
            <Button asChild>
              <Link to="/onboarding">Set up POS</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const cutoff = rangeCutoff(range, mockClock.now())
  const inRange = (orders ?? []).filter((o) => new Date(o.createdAt).getTime() >= cutoff)
  const filtered = inRange.filter((o) => {
    if (status !== 'all' && o.paymentStatus !== status) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      o.receiptNo.toLowerCase().includes(q) ||
      o.items.some((it) => it.name.toLowerCase().includes(q))
    )
  })

  const totalSales = inRange.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0)
  const unpaidCount = inRange.filter((o) => o.paymentStatus === 'unpaid').length

  async function togglePaid(order: Order) {
    const next = order.paymentStatus === 'paid' ? 'unpaid' : 'paid'
    await setOrderPaymentStatus(order.id, next)
    toast.success(`${order.receiptNo} marked as ${next}`)
    refresh()
  }

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {orders === null ? '—' : inRange.length} orders · collected {peso(totalSales)}
            {unpaidCount > 0 && ` · ${unpaidCount} unpaid`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search receipt or item…"
              className="pl-9 sm:w-56"
              aria-label="Search orders"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Filter by payment status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          <DateRangeSelect value={range} onChange={setRange} />
        </div>
      </div>

      {orders === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No orders found"
          description={
            query || status !== 'all' || range !== DATE_RANGE_DEFAULT
              ? 'Try different filters.'
              : 'Orders appear here after you ring up sales.'
          }
          action={
            <Button asChild>
              <Link to="/pos/catalog">Go to sell screen</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs font-medium">{o.receiptNo}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {formatDateTime(o.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">
                    {o.items.map((it) => `${it.name} ×${it.qty}`).join(', ')}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{peso(o.total)}</TableCell>
                  <TableCell>
                    <Badge variant={o.paymentStatus === 'paid' ? 'outline' : 'destructive'}>
                      {o.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => setDetail(o)} aria-label={`View ${o.receiptNo}`}>
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          setReceipt(o)
                          setReceiptOpen(true)
                        }}
                        aria-label={`Receipt for ${o.receiptNo}`}
                      >
                        <ReceiptText className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.receiptNo}</DialogTitle>
            <DialogDescription>
              {detail && formatDateTime(detail.createdAt)}
              {detail?.customerName ? ` · ${detail.customerName}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border">
                {detail.items.map((it) => (
                  <div key={it.productId} className="flex justify-between border-b px-3 py-2 last:border-0">
                    <span>
                      {it.name} <span className="text-muted-foreground">× {it.qty}</span>
                    </span>
                    <span className="tabular-nums">{peso(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{peso(detail.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="tabular-nums">-{peso(detail.discount)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{peso(detail.total)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => togglePaid(detail)}>
                  Mark as {detail.paymentStatus === 'paid' ? 'unpaid' : 'paid'}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setReceipt(detail)
                    setDetail(null)
                    setReceiptOpen(true)
                  }}
                >
                  <ReceiptText className="size-4" /> View receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceiptDialog
        order={receipt}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        storeName={store.name}
        storeAddress={user?.address ?? ''}
      />
    </div>
  )
}
