import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  History,
  Loader2,
  PackagePlus,
  ShoppingCart,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime, relativeFromNow } from '@/lib/format'
import { adjustStock, getProductMovements, subscribeDb } from '@/lib/repos'
import { formatQty } from '@/lib/units'
import type { Product, StockMovement, StockMovementType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'

const TYPES: { value: StockMovementType; label: string; icon: React.ElementType }[] = [
  { value: 'restock', label: 'Restock (+)', icon: PackagePlus },
  { value: 'damage', label: 'Damage / write-off (−)', icon: ArrowDown },
  { value: 'adjust', label: 'Manual correction', icon: Wrench },
]

/** Friendly label, icon, and tone for each kind of stock movement. */
const MOVEMENT_META: Record<
  StockMovementType,
  { label: string; icon: React.ElementType; tone: string }
> = {
  initial: { label: 'Initial stock', icon: Sparkles, tone: 'text-muted-foreground' },
  restock: { label: 'Restock', icon: PackagePlus, tone: 'text-emerald-600' },
  sale: { label: 'Sale', icon: ShoppingCart, tone: 'text-muted-foreground' },
  adjust: { label: 'Manual correction', icon: Wrench, tone: 'text-amber-600' },
  damage: { label: 'Damage / write-off', icon: ArrowDown, tone: 'text-destructive' },
}

export function AdjustStockDialog({
  product,
  onOpenChange,
  onAdjusted,
}: {
  product: Product | null
  onOpenChange: (open: boolean) => void
  onAdjusted: () => void
}) {
  const { store } = useAuth()
  const [type, setType] = React.useState<StockMovementType>('restock')
  const [qty, setQty] = React.useState('1')
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [tab, setTab] = React.useState<'adjust' | 'history'>('adjust')
  const [movements, setMovements] = React.useState<StockMovement[]>([])

  const loadHistory = React.useCallback(() => {
    if (!store || !product) return
    setMovements(getProductMovements(store.id, product.id))
  }, [store, product])

  React.useEffect(() => {
    if (product) {
      setType('restock')
      setQty('1')
      setReason('')
      setSaving(false)
      setTab('adjust')
      loadHistory()
    }
  }, [product, loadHistory])

  React.useEffect(() => subscribeDb(loadHistory), [loadHistory])

  if (!product) return null

  const qtyNum = Math.trunc(Number(qty) || 0)
  const signed = type === 'restock' ? Math.abs(qtyNum) : type === 'damage' ? -Math.abs(qtyNum) : qtyNum
  const nextStock = product.stock + signed
  const canSubmit = signed !== 0 && nextStock >= 0

  function close() {
    if (!saving) onOpenChange(false)
  }

  async function submit() {
    if (!product || !canSubmit) return
    setSaving(true)
    try {
      const updated = await adjustStock(product.id, signed, type, reason)
      toast.success(`${product.name}: stock is now ${formatQty(updated.stock, product.unit)}`)
      onAdjusted()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not adjust stock.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product.name} · {product.sku} · currently{' '}
            <strong className="font-medium text-foreground">
              {formatQty(product.stock, product.unit)}
            </strong>{' '}
            on hand
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'adjust' | 'history')}>
          <TabsList className="w-full">
            <TabsTrigger value="adjust">
              <Wrench className="size-4" aria-hidden />
              Adjust
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-4" aria-hidden />
              History
              {movements.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                  {movements.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="adjust" className="space-y-3 pt-1">
            <div className="space-y-2">
              <Label>Adjustment type</Label>
              <Select value={type} onValueChange={(v) => setType(v as StockMovementType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <t.icon className="size-3.5" /> {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adj-qty">Quantity</Label>
                <Input
                  id="adj-qty"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
                />
              </div>
              <div className="space-y-2">
                <Label>Resulting stock</Label>
                <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3">
                  <Badge variant={nextStock < 0 ? 'destructive' : 'secondary'} className="tabular-nums">
                    {nextStock}
                  </Badge>
                  {type === 'restock' && signed > 0 && <ArrowUp className="size-3.5 text-emerald-600" />}
                  {signed < 0 && <ArrowDown className="size-3.5 text-destructive" />}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-reason">Reason (optional)</Label>
              <Input
                id="adj-reason"
                value={reason}
                placeholder="e.g. delivery from supplier, broken pack…"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="pt-1">
            {movements.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-8 text-center">
                <History className="size-5 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">No stock history yet</p>
                <p className="text-xs text-muted-foreground">
                  Adjustments and sales for this product will appear here.
                </p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                {movements.map((m) => {
                  const meta = MOVEMENT_META[m.type] ?? MOVEMENT_META.adjust
                  const Icon = meta.icon
                  return (
                    <li
                      key={m.id}
                      className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40',
                          meta.tone
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{meta.label}</p>
                          <span
                            className={cn(
                              'shrink-0 text-sm font-semibold tabular-nums',
                              m.qtyDelta >= 0 ? 'text-emerald-600' : 'text-destructive'
                            )}
                          >
                            {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                          </span>
                        </div>
                        {m.reason && (
                          <p className="truncate text-xs text-muted-foreground">{m.reason}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          <span className="tabular-nums">
                            → {formatQty(m.stockAfter, product.unit)}
                          </span>{' '}
                          · {relativeFromNow(m.createdAt)} · {formatDateTime(m.createdAt)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {tab === 'adjust' ? (
            <>
              <Button variant="outline" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={!canSubmit || saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Apply adjustment
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
