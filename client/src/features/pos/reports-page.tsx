import * as React from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, TrendingUp, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { StatCard } from '@/components/common/stat-card'
import {
  DATE_RANGE_DEFAULT,
  DATE_RANGE_LABEL,
  rangeCutoff,
  type DateRange,
} from '@/lib/date-range'
import { mockClock } from '@/lib/mock-clock'
import { peso } from '@/lib/format'
import { getOrders, getProducts } from '@/lib/repos'
import { useAuth } from '@/state/auth-context'
import { DateRangeSelect } from './date-range-select'

/** Hour-of-day label like "3 PM" for the Today view's best-hour stat. */
function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString('en-PH', { hour: 'numeric' })
}

export function ReportsPage() {
  const { store } = useAuth()
  const [range, setRange] = React.useState<DateRange>(DATE_RANGE_DEFAULT)
  const [loading, setLoading] = React.useState(true)
  const [data, setData] = React.useState<{
    paidTotal: number
    unpaidTotal: number
    orderCount: number
    paidCount: number
    avgTicket: number
    byCategory: { name: string; revenue: number; qty: number }[]
    byDay: { label: string; revenue: number }[]
    topItems: { name: string; qty: number; revenue: number }[]
    bestDay: { label: string; revenue: number } | null
  } | null>(null)

  React.useEffect(() => {
    if (!store) return
    setLoading(true)
    const timer = setTimeout(() => {
      const all = getOrders(store.id)
      const categoryByProduct = new Map(getProducts(store.id).map((p) => [p.id, p.category]))
      const now = mockClock.now()
      const cutoff = rangeCutoff(range, now)
      const orders = all.filter((o) => new Date(o.createdAt).getTime() >= cutoff)
      const paid = orders.filter((o) => o.paymentStatus === 'paid')
      const paidTotal = paid.reduce((s, o) => s + o.total, 0)
      const unpaidTotal = orders.filter((o) => o.paymentStatus === 'unpaid').reduce((s, o) => s + o.total, 0)

      const catMap = new Map<string, { revenue: number; qty: number }>()
      const itemMap = new Map<string, { qty: number; revenue: number }>()
      const dayMap = new Map<string, number>()
      const hourMap = new Map<number, number>()
      for (const o of paid) {
        const created = new Date(o.createdAt)
        if (range === 'today') {
          const h = created.getHours()
          hourMap.set(h, (hourMap.get(h) ?? 0) + o.total)
        } else {
          const dayKey = created.toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
          })
          dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + o.total)
        }
        for (const it of o.items) {
          const cat = categoryByProduct.get(it.productId) ?? 'Other'
          const c = catMap.get(cat) ?? { revenue: 0, qty: 0 }
          c.revenue += it.price * it.qty
          c.qty += it.qty
          catMap.set(cat, c)
          const item = itemMap.get(it.name) ?? { qty: 0, revenue: 0 }
          item.qty += it.qty
          item.revenue += it.price * it.qty
          itemMap.set(it.name, item)
        }
      }
      const byDay =
        range === 'today'
          ? [...hourMap.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([hour, revenue]) => ({ label: hourLabel(hour), revenue }))
          : [...dayMap.entries()].map(([label, revenue]) => ({ label, revenue }))
      const bestDay = byDay.length
        ? byDay.reduce((a, b) => (b.revenue > a.revenue ? b : a))
        : null

      setData({
        paidTotal,
        unpaidTotal,
        orderCount: orders.length,
        paidCount: paid.length,
        avgTicket: paid.length ? paidTotal / paid.length : 0,
        byCategory: [...catMap.entries()]
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.revenue - a.revenue),
        byDay,
        topItems: [...itemMap.entries()]
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 8),
        bestDay,
      })
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [store, range])

  if (!store) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={TrendingUp}
          title="No store configured"
          description="Set up a POS type to see sales reports."
          action={
            <Button asChild>
              <Link to="/onboarding">Set up POS</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const maxCat = data && data.byCategory.length ? data.byCategory[0].revenue || 1 : 1

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales reports</h1>
          <p className="text-sm text-muted-foreground">
            Performance insights from paid orders · {DATE_RANGE_LABEL[range]}
          </p>
        </div>
        <DateRangeSelect value={range} onChange={setRange} className="sm:w-44" />
      </div>

      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Wallet} label="Revenue (paid)" value={peso(data.paidTotal)} />
            <StatCard icon={TrendingUp} label="Average ticket" value={peso(data.avgTicket)} />
            <StatCard icon={CalendarRange} label="Orders" value={String(data.orderCount)} hint={`${data.paidCount} paid`} />
            <StatCard
              icon={CalendarRange}
              label={range === 'today' ? 'Best hour' : 'Best day'}
              value={data.bestDay ? peso(data.bestDay.revenue) : '—'}
              hint={data.bestDay?.label ?? 'No data'}
            />
          </div>

          {data.orderCount === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No sales in this period"
              description="Try a longer date range or ring up some sales."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Revenue by category</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.byCategory.map((c) => (
                    <div key={c.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {c.qty} sold · {peso(c.revenue)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(c.revenue / maxCat) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top items by quantity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topItems.map((it) => (
                        <TableRow key={it.name}>
                          <TableCell className="font-medium">{it.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                          <TableCell className="text-right tabular-nums">{peso(it.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {data.unpaidTotal > 0 && (
            <Card className="border-amber-200 bg-amber-50 shadow-none">
              <CardContent className="flex items-center justify-between py-4 text-sm text-amber-900">
                <span>
                  <strong>{peso(data.unpaidTotal)}</strong> in unpaid orders — collect these from
                  customers.
                </span>
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
                  UT
                </Badge>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
