import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
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
import { SalesLineChart } from '@/components/common/sales-line-chart'
import { StatCard } from '@/components/common/stat-card'
import { TopProductsBarChart } from '@/components/common/top-products-bar-chart'
import { mockClock, addDays } from '@/lib/mock-clock'
import { peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { productImage } from '@/lib/mock-image'
import { getPosType } from '@/lib/pos-types'
import { getOrders, getProducts } from '@/lib/repos'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'

function last7Days(
  orders: { createdAt: string; total: number; paymentStatus: string }[],
  offsetDays = 0,
) {
  const now = mockClock.now()
  const days: { label: string; dateLabel: string; total: number; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetDays - i)
    const end = addDays(start, 1)
    const inDay = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime()
      return t >= start.getTime() && t < end.getTime()
    })
    days.push({
      label: start.toLocaleDateString('en-PH', { weekday: 'short' }),
      dateLabel: start.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
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
    week: { label: string; dateLabel: string; total: number; count: number }[]
    weekTotal: number
    prevWeekTotal: number
    lowStock: { id: string; name: string; stock: number; emoji: string; image?: string }[]
    unpaidTotal: number
    productCount: number
    topProducts: {
      productId: string
      name: string
      qty: number
      revenue: number
      emoji: string
      image?: string
      rank: number
    }[]
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
      const productById = new Map(products.map((p) => [p.id, p]))
      const qtyMap = new Map<
        string,
        { name: string; qty: number; revenue: number; emoji: string; image?: string }
      >()
      for (const o of orders) {
        for (const it of o.items) {
          const product = productById.get(it.productId)
          const entry = qtyMap.get(it.productId) ?? {
            name: it.name,
            qty: 0,
            revenue: 0,
            emoji: product?.emoji ?? '🛍️',
            image: product?.image,
          }
          entry.qty += it.qty
          entry.revenue += it.qty * it.price
          qtyMap.set(it.productId, entry)
        }
      }
      const week = last7Days(orders)
      const prevWeek = last7Days(orders, 7)
      setStats({
        todaySales: today.reduce((s, o) => s + o.total, 0),
        todayOrders: today.length,
        week,
        weekTotal: week.reduce((s, d) => s + d.total, 0),
        prevWeekTotal: prevWeek.reduce((s, d) => s + d.total, 0),
        lowStock: products
          .filter((p) => p.stock <= 10)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: p.name, stock: p.stock, emoji: p.emoji, image: p.image })),
        unpaidTotal: orders.filter((o) => o.paymentStatus === 'unpaid').reduce((s, o) => s + o.total, 0),
        productCount: products.length,
        topProducts: [...qtyMap.entries()]
          .map(([productId, v]) => ({ productId, ...v }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 10)
          .map((p, i) => ({ ...p, rank: i + 1 })),
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
  const weekTrend =
    stats && stats.prevWeekTotal > 0
      ? ((stats.weekTotal - stats.prevWeekTotal) / stats.prevWeekTotal) * 100
      : null

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
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div>
                    <CardTitle className="text-sm">Last 7 days sales</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">Daily revenue this week</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums">{peso(stats.weekTotal)}</p>
                    {weekTrend === null ? (
                      <p className="text-xs text-muted-foreground">No prior week to compare</p>
                    ) : (
                      <p
                        className={cn(
                          'flex items-center justify-end gap-0.5 text-xs font-medium tabular-nums',
                          weekTrend >= 0 ? 'text-emerald-600' : 'text-rose-600',
                        )}
                      >
                        {weekTrend >= 0 ? (
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDownRight className="size-3.5" aria-hidden />
                        )}
                        {Math.abs(weekTrend).toFixed(1)}% vs last week
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SalesLineChart data={stats.week} accent={accent} />
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
              <div>
                <CardTitle className="text-sm">Top selling products</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Top 10 · units sold · all time</p>
              </div>
            </CardHeader>
            <CardContent>
              {stats.topProducts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No sales recorded yet — ring up your first order.
                </p>
              ) : (
                <TopProductsBarChart data={stats.topProducts} accent={accent} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
