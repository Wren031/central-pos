import * as React from 'react'
import { ArrowDown, ArrowUp, History, Loader2, PackagePlus, Wrench } from 'lucide-react'
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
import { formatDateTime } from '@/lib/format'
import { adjustStock, getProductMovements, subscribeDb } from '@/lib/repos'
import type { Product, StockMovement, StockMovementType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'

const TYPES: { value: StockMovementType; label: string; icon: React.ElementType }[] = [
  { value: 'restock', label: 'Restock (+)', icon: PackagePlus },
  { value: 'damage', label: 'Damage / write-off (−)', icon: ArrowDown },
  { value: 'adjust', label: 'Manual correction', icon: Wrench },
]

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
  const [showHistory, setShowHistory] = React.useState(false)
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
      setShowHistory(false)
      loadHistory()
    }
  }, [product, loadHistory])

  React.useEffect(() => subscribeDb(loadHistory), [loadHistory])

  if (!product) return null

  const qtyNum = Math.trunc(Number(qty) || 0)
  const signed = type === 'restock' ? Math.abs(qtyNum) : type === 'damage' ? -Math.abs(qtyNum) : qtyNum
  const nextStock = product.stock + signed
  const canSubmit = signed !== 0 && nextStock >= 0

  async function submit() {
    if (!product || !canSubmit) return
    setSaving(true)
    try {
      const updated = await adjustStock(product.id, signed, type, reason)
      toast.success(`${product.name}: stock is now ${updated.stock}`)
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Adjust stock
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => setShowHistory((h) => !h)}
              aria-label="Toggle stock history"
            >
              <History className="size-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            {product.name} · {product.sku} · currently <strong>{product.stock}</strong> on hand
          </DialogDescription>
        </DialogHeader>

        {showHistory ? (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {movements.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No stock history yet.</p>
            ) : (
              movements.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.type}{' '}
                      <span className={cn('tabular-nums', m.qtyDelta >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                        {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                      </span>
                    </p>
                    <p className="truncate text-muted-foreground">{m.reason}</p>
                  </div>
                  <div className="shrink-0 text-right text-muted-foreground">
                    <p className="tabular-nums">→ {m.stockAfter}</p>
                    <p>{formatDateTime(m.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          {!showHistory && (
            <Button onClick={() => void submit()} disabled={!canSubmit || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Apply adjustment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
