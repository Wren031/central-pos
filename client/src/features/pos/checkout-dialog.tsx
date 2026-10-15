import * as React from 'react'
import { Banknote, Check, ChevronDown, CreditCard, Loader2, Minus, Plus, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { peso } from '@/lib/format'
import { addCustomer, createOrder, getCustomers, InsufficientStockError, subscribeDb } from '@/lib/repos'
import { formatQty, unitLabel } from '@/lib/units'
import { printerService } from '@/database/repos/printer'
import { cn } from '@/lib/utils'
import type { Customer, Order } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { useCart } from './cart-context'

function CustomerPicker({
  storeId,
  value,
  onChange,
}: {
  storeId: string
  value: { id: string | null; name: string }
  onChange: (v: { id: string | null; name: string }) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [customers, setCustomers] = React.useState<Customer[]>(() => getCustomers(storeId))
  const [newName, setNewName] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => subscribeDb(() => setCustomers(getCustomers(storeId))), [storeId])

  const filtered = query.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : customers

  async function quickAdd() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const c = await addCustomer(storeId, { name })
      onChange({ id: c.id, name: c.name })
      setNewName('')
      setOpen(false)
      toast.success(`${c.name} added`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">{value.name || 'Walk-in customer'}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          autoFocus
          placeholder="Search customers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-8"
        />
        <div className="max-h-44 overflow-y-auto">
          <button
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
              value.id === null && 'bg-muted font-medium'
            )}
            onClick={() => {
              onChange({ id: null, name: 'Walk-in' })
              setOpen(false)
            }}
          >
            Walk-in customer
            {value.id === null && <Check className="size-3.5" />}
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                value.id === c.id && 'bg-muted font-medium'
              )}
              onClick={() => {
                onChange({ id: c.id, name: c.name })
                setOpen(false)
              }}
            >
              <span className="truncate">
                {c.name}
                {c.phone ? <span className="text-muted-foreground"> · {c.phone}</span> : null}
              </span>
              {value.id === c.id && <Check className="size-3.5" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p>
          )}
        </div>
        <Separator className="my-2" />
        <div className="flex gap-1.5">
          <Input
            placeholder="New customer name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void quickAdd()
              }
            }}
            className="h-8"
          />
          <Button size="sm" variant="secondary" onClick={() => void quickAdd()} disabled={!newName.trim() || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function CheckoutDialog({
  open,
  onOpenChange,
  onOrderCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOrderCreated: (order: Order) => void
}) {
  const { user, store } = useAuth()
  const { items, subtotal, increment, decrement, remove, clear } = useCart()
  const [discount, setDiscount] = React.useState('0')
  const [paid, setPaid] = React.useState(true)
  const [cash, setCash] = React.useState('')
  const [processing, setProcessing] = React.useState(false)
  const [customer, setCustomer] = React.useState<{ id: string | null; name: string }>({
    id: null,
    name: 'Walk-in',
  })

  React.useEffect(() => {
    if (open) {
      setDiscount('0')
      setPaid(true)
      setCash('')
      setProcessing(false)
      setCustomer({ id: null, name: 'Walk-in' })
    }
  }, [open])

  const discountNum = Math.max(0, Number(discount) || 0)
  const total = Math.max(0, subtotal - discountNum)
  const cashNum = Number(cash) || 0
  const change = Math.max(0, cashNum - total)
  const canSubmit = items.length > 0 && (!paid || cashNum >= total)

  async function submit() {
    if (!user || !store || !canSubmit) return
    setProcessing(true)
    try {
      const order = await createOrder({
        storeId: store.id,
        userId: user.id,
        items: items.map(({ maxStock, ...it }) => {
          void maxStock
          return it
        }),
        discount: discountNum,
        paymentStatus: paid ? 'paid' : 'unpaid',
        customerId: customer.id,
        customerName: customer.name || 'Walk-in',
        cashTendered: paid && cashNum > 0 ? cashNum : null,
        change: paid && cashNum > 0 ? change : null,
      })
      clear()
      onOrderCreated(order)
      toast.success(`Order ${order.receiptNo} created`)

      // Auto-print over Bluetooth when enabled and a printer is really connected.
      // Fire-and-forget: the toast below reports the hardware result, never a fake success.
      const ps = printerService.getState()
      if (ps.autoPrint) {
        if (ps.connected) {
          void printerService
            .printOrder(order, store)
            .then((printed) => {
              if (printed) {
                toast.info(`Receipt sent to ${printerService.getState().connected?.name ?? 'printer'}`)
              }
            })
            .catch((err) => {
              toast.error(err instanceof Error ? err.message : 'Printing failed.')
            })
        } else {
          toast.info('Auto-print is on, but no printer is connected.', {
            description: 'Connect a Bluetooth printer in POS settings to print receipts automatically.',
          })
        }
      }
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        toast.error(err.message, { description: 'Stock was not changed — adjust inventory and try again.' })
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not create the order.')
      }
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !processing && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>
            {items.length} item{items.length === 1 ? '' : 's'} · {store?.name}
          </DialogDescription>
        </DialogHeader>

        {processing ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Recording order &amp; updating stock…</p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Your cart is empty. Add products from the catalog.
                </p>
              ) : (
                items.map((it) => (
                  <div
                    key={it.productId}
                    className="flex items-center gap-2 rounded-lg border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {peso(it.price)} per {unitLabel(it.unit)} · max {formatQty(it.maxStock, it.unit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => decrement(it.productId)}
                        aria-label={`Decrease ${it.name}`}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium tabular-nums">{it.qty}</span>
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => increment(it.productId)}
                        disabled={it.qty >= it.maxStock}
                        aria-label={`Increase ${it.name}`}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">
                      {peso(it.price * it.qty)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => remove(it.productId)}
                      aria-label={`Remove ${it.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Payment fields — fixed above the summary; only the item list scrolls. */}
            <div className="shrink-0 rounded-lg border bg-muted/40 p-3">
              <div className="space-y-3">
                <p className="text-sm font-medium">Payment details</p>
                <div className="space-y-2">
                  <Label>Customer</Label>
                  {store && (
                    <CustomerPicker
                      storeId={store.id}
                      value={customer}
                      onChange={setCustomer}
                    />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="discount">Discount (₱)</Label>
                    <Input
                      id="discount"
                      inputMode="decimal"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cash">Cash received (₱)</Label>
                    <Input
                      id="cash"
                      inputMode="decimal"
                      value={cash}
                      disabled={!paid}
                      placeholder="0.00"
                      onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="paid"
                    checked={paid}
                    onCheckedChange={(v) => setPaid(v === true)}
                  />
                  <Label htmlFor="paid" className="text-sm font-normal">
                    Mark as paid
                  </Label>
                  <Badge variant={paid ? 'default' : 'destructive'} className="ml-auto">
                    {paid ? <Banknote className="size-3" /> : <CreditCard className="size-3" />}
                    {paid ? 'Cash sale' : 'Unpaid / UT'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="shrink-0 rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{peso(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">-{peso(discountNum)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{peso(total)}</span>
              </div>
              {paid && cashNum > 0 && (
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Change</span>
                  <span className={cn('tabular-nums', cashNum < total && 'text-destructive')}>
                    {cashNum < total ? `Short ${peso(total - cashNum)}` : peso(change)}
                  </span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSubmit}>
                {processing ? <Loader2 className="size-4 animate-spin" /> : null}
                Complete sale · {peso(total)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
