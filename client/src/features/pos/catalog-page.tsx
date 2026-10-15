import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CreditCard,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/empty-state'
import { formatDateTime, peso } from '@/lib/format'
import { productImage } from '@/lib/mock-image'
import { formatQty, unitLabel } from '@/lib/units'
import { getPosType } from '@/lib/pos-types'
import { getCategories, getOrders, getProducts } from '@/lib/repos'
import { cn } from '@/lib/utils'
import type { Order, Product } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { useCart } from './cart-context'
import { CheckoutDialog } from './checkout-dialog'
import { ReceiptDialog } from './receipt-dialog'

function CartLines() {
  const { items, increment, decrement, remove } = useCart()
  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Cart is empty. Tap a product to add it.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.productId} className="flex items-center gap-2 rounded-lg border p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{it.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {peso(it.price)} × {formatQty(it.qty, it.unit)} = {peso(it.price * it.qty)}
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
            <span className="w-5 text-center text-sm tabular-nums">{it.qty}</span>
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
      ))}
    </div>
  )
}

function CartSummary({ onCheckout }: { onCheckout: () => void }) {
  const { items, subtotal, clear } = useCart()
  return (
    <div className="space-y-3 border-t p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Items</span>
        <span className="font-medium tabular-nums">{items.length} lines</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Subtotal</span>
        <span className="text-xl font-semibold tabular-nums">{peso(subtotal)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={onCheckout} disabled={items.length === 0}>
          <CreditCard className="size-4" />
          Charge {peso(subtotal)}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={clear}
          disabled={items.length === 0}
          aria-label="Clear cart"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function CatalogPage() {
  const { user, store } = useAuth()
  const { state } = useSubscription()
  const { add, count, subtotal } = useCart()
  const [products, setProducts] = React.useState<Product[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<string>('All')
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [lastOrder, setLastOrder] = React.useState<Order | null>(null)
  const [receiptOpen, setReceiptOpen] = React.useState(false)
  const [cartOpen, setCartOpen] = React.useState(false)
  const [gridMax, setGridMax] = React.useState(false)

  React.useEffect(() => {
    const root = document.documentElement
    if (!gridMax) {
      root.removeAttribute('data-pos-fullscreen')
      return
    }
    root.setAttribute('data-pos-fullscreen', 'true')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGridMax(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.removeAttribute('data-pos-fullscreen')
      window.removeEventListener('keydown', onKey)
    }
  }, [gridMax])

  const refreshProducts = React.useCallback(() => {
    if (!store) return
    setProducts(getProducts(store.id))
  }, [store])

  React.useEffect(() => {
    refreshProducts()
    const handler = () => refreshProducts()
    window.addEventListener('cpos:data-changed', handler)
    return () => window.removeEventListener('cpos:data-changed', handler)
  }, [refreshProducts])

  const posDef = store ? getPosType(store.posType) : null
  // Categories come from the store's (Supabase-derived) category config.
  const categories = store ? ['All', ...getCategories(store.id).map((c) => c.name)] : ['All']

  const filtered = React.useMemo(() => {
    if (!products) return []
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (category !== 'All' && p.category !== category) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      )
    })
  }, [products, query, category])

  if (!store || !posDef) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={ShoppingCart}
          title="No POS workspace yet"
          description="Choose a POS type to generate your catalog."
          action={
            <Button asChild>
              <Link to="/onboarding">Choose POS type</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const locked = !state.canSell

  return (
    <div className="-mb-20 flex h-full min-h-0 flex-col p-4 pb-24 sm:p-6 md:-mb-6 md:pb-6">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sell</h1>
          <p className="text-sm text-muted-foreground">
            {posDef.name} · tap products to build the cart
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products or SKU…"
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={gridMax ? 'Restore cart panel' : 'Maximize product grid'}
            title={gridMax ? 'Show cart' : 'Maximize grid'}
            onClick={() => setGridMax((m) => !m)}
          >
            {gridMax ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>

      {locked && (
        <div className="mb-4 flex shrink-0 flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Lock className="size-4 shrink-0 text-amber-600" aria-hidden />
            <span>
              <strong>Selling is locked.</strong> Your subscription expired — browse the catalog and
              review orders freely, or renew to checkout.
            </span>
          </div>
          <Button asChild size="sm" className="bg-amber-600 text-white hover:bg-amber-700">
            <Link to="/subscription">Renew now</Link>
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-4 flex shrink-0 flex-wrap gap-1.5 pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === c
                    ? 'border-transparent text-white'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
                style={category === c ? { backgroundColor: posDef.theme.accent } : undefined}
                aria-pressed={category === c}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-24 lg:pb-4">
            {products === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No products found"
                description="Try a different search or category."
              />
            ) : (
              <div
                className={cn(
                  'grid gap-4',
                  gridMax
                    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6'
                    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                )}
              >
                {filtered.map((p) => {
                  const out = p.stock <= 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out || locked}
                      onClick={() => add(p)}
                      className={cn(
                        'group overflow-hidden rounded-xl border bg-card text-left transition-all',
                        out || locked
                          ? 'cursor-not-allowed opacity-60'
                          : 'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md'
                      )}
                      aria-label={`Add ${p.name} to cart`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <img
                          src={p.image || productImage(p.name, p.emoji)}
                          alt=""
                          className="size-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        {out && (
                          <span className="absolute top-2 left-2 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                            Out of stock
                          </span>
                        )}
                        {!out && p.stock <= 10 && (
                          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            <AlertTriangle className="size-3" aria-hidden />
                            {formatQty(p.stock, p.unit)} left
                          </span>
                        )}
                      </div>
                      <div className="p-3.5">
                        <p className="line-clamp-1 text-[15px] font-medium">{p.name}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-base font-semibold tabular-nums">
                            {peso(p.price)}
                            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                              /{unitLabel(p.unit)}
                            </span>
                          </span>
                          <Badge variant="secondary" className="text-[11px]">
                            {p.category}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* recent strip */}
            <RecentOrders
              storeId={store.id}
              accent={posDef.theme.accent}
              onOpenReceipt={(o) => {
                setLastOrder(o)
                setReceiptOpen(true)
              }}
            />
          </div>
        </div>

        <Card className="hidden w-80 shrink-0 flex-col gap-0 self-stretch shadow-none lg:flex">
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="size-4" aria-hidden />
              Current sale
            </h2>
            <Badge variant="secondary">{count}</Badge>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-2">
            <CartLines />
          </ScrollArea>
          <div className="shrink-0">
            <CartSummary onCheckout={() => setCheckoutOpen(true)} />
          </div>
        </Card>
      </div>

      {/* Mobile floating cart bar */}
      <div className="pos-cart-bar fixed inset-x-3 bottom-20 z-40 lg:hidden">
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetTrigger asChild>
            <Button
              size="lg"
              className="w-full shadow-lg"
              disabled={count === 0}
              style={{ backgroundColor: posDef.theme.accent }}
            >
              <ShoppingCart className="size-4" />
              {count} item{count === 1 ? '' : 's'} · {peso(subtotal)}
              <span className="ml-auto text-xs opacity-90">View cart</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex max-h-[85svh] flex-col gap-0 rounded-t-2xl">
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2">
                Current sale
                <Badge variant="secondary">{count}</Badge>
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 px-4 py-3">
              <CartLines />
            </ScrollArea>
            <CartSummary
              onCheckout={() => {
                setCartOpen(false)
                setCheckoutOpen(true)
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onOrderCreated={() => {
          // No receipt pop-up after a sale — the receipt prints automatically
          // over Bluetooth (see CheckoutDialog.submit) when auto-print is on.
          setCheckoutOpen(false)
        }}
      />

      <ReceiptDialog
        order={lastOrder}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        storeName={store.name}
        storeAddress={user?.address ?? ''}
      />
    </div>
  )
}

function RecentOrders({
  storeId,
  accent,
  onOpenReceipt,
}: {
  storeId: string
  accent: string
  onOpenReceipt: (order: Order) => void
}) {
  const [orders, setOrders] = React.useState<Order[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const load = () => setOrders(getOrders(storeId).slice(0, 8))
    load()
    const handler = () => load()
    window.addEventListener('cpos:data-changed', handler)
    return () => window.removeEventListener('cpos:data-changed', handler)
  }, [storeId])

  return (
    <section className="mt-6" aria-label="Recent orders">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Recent orders</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show last 8'}
        </Button>
      </div>
      {open && (
        <div className="grid gap-2 sm:grid-cols-2">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onOpenReceipt(o)}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span>
                  <span className="block text-sm font-medium" style={{ color: accent }}>
                    {o.receiptNo}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(o.createdAt)} · {o.items.length} item(s)
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">{peso(o.total)}</span>
                  <Badge
                    variant={o.paymentStatus === 'paid' ? 'outline' : 'destructive'}
                    className="text-[10px]"
                  >
                    {o.paymentStatus}
                  </Badge>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
}
