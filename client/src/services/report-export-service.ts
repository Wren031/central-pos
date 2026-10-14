import { toCsv } from '@/lib/csv'
import { DATE_RANGE_LABEL, type DateRange } from '@/lib/date-range'
import { mockClock } from '@/lib/mock-clock'
import type { Store } from '@/lib/types'

/** Shape of the computed report data used to build the export. */
export interface SalesReportData {
  paidTotal: number
  unpaidTotal: number
  orderCount: number
  paidCount: number
  avgTicket: number
  byCategory: { name: string; revenue: number; qty: number }[]
  byDay: { label: string; revenue: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
  bestDay: { label: string; revenue: number } | null
}

/**
 * Builds a multi-section CSV of a sales report: summary KPIs, revenue by
 * category, top items, and the day/hour breakdown.
 */
export function buildSalesReportCsv(
  data: SalesReportData,
  range: DateRange,
  store: Pick<Store, 'name'>,
): string {
  const generated = mockClock.now().toLocaleString('en-PH')
  const rows: (string | number)[][] = [
    ['Central POS — Sales Report'],
    ['Store', store.name],
    ['Period', DATE_RANGE_LABEL[range]],
    ['Generated', generated],
    [],
    ['Summary'],
    ['Metric', 'Value'],
    ['Revenue (paid)', data.paidTotal],
    ['Unpaid', data.unpaidTotal],
    ['Orders', data.orderCount],
    ['Paid orders', data.paidCount],
    ['Average ticket', data.avgTicket],
    [range === 'today' ? 'Best hour' : 'Best day', data.bestDay?.label ?? '—'],
    [range === 'today' ? 'Best hour revenue' : 'Best day revenue', data.bestDay?.revenue ?? 0],
    [],
    ['Revenue by category'],
    ['Category', 'Qty sold', 'Revenue'],
    ...data.byCategory.map((c) => [c.name, c.qty, c.revenue]),
    [],
    ['Top items by quantity'],
    ['Item', 'Qty sold', 'Revenue'],
    ...data.topItems.map((it) => [it.name, it.qty, it.revenue]),
    [],
    [range === 'today' ? 'Revenue by hour' : 'Revenue by day'],
    [range === 'today' ? 'Hour' : 'Day', 'Revenue'],
    ...data.byDay.map((d) => [d.label, d.revenue]),
  ]
  return toCsv(rows)
}

/** Triggers a browser download of the report CSV. Mirrors downloadExport(). */
export function downloadSalesReport(csv: string, range: DateRange): void {
  const stamp = mockClock.now().toISOString().slice(0, 10)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `central-pos-sales-report-${range}-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
