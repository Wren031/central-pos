import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CreditCard,
  Grid2X2,
  Package,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/empty-state'
import { StatCard } from '@/components/common/stat-card'
import { mockClock, addDays } from '@/lib/mock-clock'
import { peso } from '@/lib/format'
import { productImage } from '@/lib/mock-image'
import { getPosType } from '@/lib/pos-types'
import { getOrders, getProducts } from '@/lib/repos'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'

function last7Days(orders: { createdAt: string; total: number; paymentStatus: string }[]) {
  const now = mockClock.now()
  const days: { label: string; total: number; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const end = addDays(start, 1)
    const inDay = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime()
      return t >= start.getTime() && t < end.getTime()
    })
    days.push({
      label: start.toLocaleDateString('en-PH', { weekday: 'short' }),
      total: inDay.reduce((s, o) => s + o.total, 0),
      count: inDay.length,
    })
  }
  return days
}

export function PosOverviewPage() {
  const { store } = useAuth()
  const { state } = useSubscription()
  const [stats, setStats] = React.useState<{
    todaySales: number
    todayOrders: number
    week: { label: string; total: number; count: number }[]
    lowStock: { id: string; name: string; stock: number; emoji: string; image?: string }[]
    unpaidTotal: number
    productCount: number
    topProducts: { name: string; qty: number; revenue: number }[]
    orders: Awaited<ReturnType<typeof getOrders>>
  } | null>(null)

  React.useEffect(() => {
    if (!store) return
    const load = () => {
      const orders = getOrders(store.id)
      const products = getProducts(store.id)
      const now = mockClock.now()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const today = orders.filter((o) => new Date(o.createdAt).getTime() >= todayStart)
      const qtyMap = new Map<string, { name: string; qty: number; revenue: number }>()
      for (const o of orders) {
        for (const it of o.items) {
          const entry = qtyMap.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0 }
          entry.qty += it.qty
          entry.revenue += it.qty * it.price
          qtyMap.set(it.productId, entry)
        }
      }
      setStats({
        todaySales: today.reduce((s, o) => s + o.total, 0),
        todayOrders: today.length,
        week: last7Days(orders),
        lowStock: products
          .filter((p) => p.stock <= 10)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: p.name, stock: p.stock, emoji: p.emoji, image: p.image })),
        unpaidTotal: orders.filter((o) => o.paymentStatus === 'unpaid').reduce((s, o) => s + o.total, 0),
        productCount: products.length,
        topProducts: [...qtyMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
        orders,
      })
    }
    load()
    const handler = () => load()
    window.addEventListener('cpos:data-changed', handler)
    return () => window.removeEventListener('cpos:data-changed', handler)
  }, [store])

  if (!store) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={Grid2X2}
          title="Set up your POS first"
          description="Pick a POS type to generate your workspace."
          action={
            <Button asChild>
              <Link to="/onboarding">Choose POS type</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const posDef = getPosType(store.posType)
  const accent = posDef.theme.accent
  const maxWeek = stats ? Math.max(...stats.week.map((d) => d.total), 1) : 1

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ backgroundColor: accent }}
          >
            <posDef.icon className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{posDef.name} overview</h1>
            <p className="text-sm text-muted-foreground">{store.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/pos/catalog">
              <ShoppingCart className="size-4" />
              New sale
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/pos/reports">
              <TrendingUp className="size-4" />
              Reports
            </Link>
          </Button>
        </div>
      </div>

      {!state.canSell && (
        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="flex flex-col gap-2 py-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <CreditCard className="size-4 text-amber-600" aria-hidden />
              Subscription expired — checkout is locked. Reports and records stay available.
            </span>
            <Button asChild size="sm" className="bg-amber-600 text-white hover:bg-amber-700">
              <Link to="/subscription">Renew plan</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Wallet} label="Today's sales" value={peso(stats.todaySales)} accent={accent} />
            <StatCard icon={ReceiptText} label="Today's orders" value={String(stats.todayOrders)} hint={`${stats.orders.length} total`} />
            <StatCard icon={CreditCard} label="Unpaid (UT)" value={peso(stats.unpaidTotal)} hint="Collect from customers" />
            <StatCard icon={Package} label="Products" value={String(stats.productCount)} hint={`${stats.lowStock.length} low stock`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="shadow-none lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Last 7 days sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-end gap-2" role="img" aria-label="Bar chart of the last 7 days of sales">
                  {stats.week.map((d) => (
                    <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {d.total > 0 ? peso(d.total).replace('.00', '') : '—'}
                      </span>
                      <div
                        className="w-full rounded-t-md transition-all"
                        style={{
                          height: `${Math.max(4, (d.total / maxWeek) * 100)}%`,
                          backgroundColor: accent,
                          opacity: d.total === 0 ? 0.2 : 0.9,
                        }}
                        title={`${d.label}: ${peso(d.total)} (${d.count} orders)`}
                      />
                      <span className="text-[10px] text-muted-foreground">{d.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-amber-600" aria-hidden />
                  Low stock
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats.lowStock.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    All items well stocked.
                  </p>
                ) : (
                  stats.lowStock.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <img
                          src={p.image || productImage(p.name, p.emoji)}
                          alt=""
                          className="size-6 shrink-0 rounded-md border object-cover"
                          loading="lazy"
                        />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <Badge variant={p.stock === 0 ? 'destructive' : 'outline'} className="shrink-0">
                        {p.stock === 0 ? 'Out' : `${p.stock} left`}
                      </Badge>
                    </div>
                  ))
                )}
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/pos/inventory">Manage inventory</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top selling products (all time)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.topProducts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No sales recorded yet — ring up your first order.
                </p>
              ) : (
                stats.topProducts.map((p, i) => {
                  const max = stats.topProducts[0].qty || 1
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                          {p.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {p.qty} sold · {peso(p.revenue)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(p.qty / max) * 100}%`, backgroundColor: accent }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
