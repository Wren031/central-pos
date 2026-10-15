import { toCsv } from '@/lib/csv'
import { DATE_RANGE_LABEL, type DateRange } from '@/lib/date-range'
import { mockClock } from '@/lib/mock-clock'
import { peso } from '@/lib/format'
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

/** `central-pos-sales-report-<range>-<date>` — shared by every format. */
function reportBaseName(range: DateRange): string {
  return `central-pos-sales-report-${range}-${mockClock.now().toISOString().slice(0, 10)}`
}

/** Triggers a browser download of a Blob with the given file name. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Minimal HTML-entity escaping for user-entered names in report markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `${reportBaseName(range)}.csv`)
}

/**
 * A self-contained, print-ready HTML document for the sales report. Shared by
 * the Word (.doc) and PDF (print) exports so all formats show identical data.
 * Kept dependency-free — no PDF/Word libraries are bundled.
 */
export function buildSalesReportHtml(
  data: SalesReportData,
  range: DateRange,
  store: Pick<Store, 'name'>,
): string {
  const generated = mockClock.now().toLocaleString('en-PH')
  const breakdownLabel = range === 'today' ? 'Revenue by hour' : 'Revenue by day'
  const unitLabel = range === 'today' ? 'Hour' : 'Day'
  const bestLabel = range === 'today' ? 'Best hour' : 'Best day'

  const kpis: [string, string][] = [
    ['Revenue (paid)', peso(data.paidTotal)],
    ['Unpaid', peso(data.unpaidTotal)],
    ['Orders', String(data.orderCount)],
    ['Paid orders', String(data.paidCount)],
    ['Average ticket', peso(data.avgTicket)],
    [bestLabel, data.bestDay ? `${data.bestDay.label} · ${peso(data.bestDay.revenue)}` : '—'],
  ]

  const kpiHtml = kpis
    .map(
      ([label, value]) =>
        `<div class="kpi"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`,
    )
    .join('')

  const categoryRows = data.byCategory.length
    ? data.byCategory
        .map(
          (c) =>
            `<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.qty}</td><td class="num">${escapeHtml(
              peso(c.revenue),
            )}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="empty">No sales in this period.</td></tr>'

  const itemRows = data.topItems.length
    ? data.topItems
        .map(
          (it) =>
            `<tr><td>${escapeHtml(it.name)}</td><td class="num">${it.qty}</td><td class="num">${escapeHtml(
              peso(it.revenue),
            )}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="empty">No items sold in this period.</td></tr>'

  const breakdownRows = data.byDay.length
    ? data.byDay
        .map(
          (d) =>
            `<tr><td>${escapeHtml(d.label)}</td><td class="num">${escapeHtml(peso(d.revenue))}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="2" class="empty">No data.</td></tr>'

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(reportBaseName(range))}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #111827; }
  .muted { color: #6b7280; font-size: 12px; }
  .meta { margin: 0 0 18px; line-height: 1.6; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-bottom: 4px; }
  .kpi { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
  .kpi span:last-child { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.empty { text-align: center; color: #9ca3af; padding: 12px; }
  .footer { margin-top: 26px; color: #9ca3af; font-size: 10px; }
</style>
</head>
<body>
  <h1>Central POS — Sales Report</h1>
  <div class="meta muted">
    <div>Store: ${escapeHtml(store.name)}</div>
    <div>Period: ${escapeHtml(DATE_RANGE_LABEL[range])}</div>
    <div>Generated: ${escapeHtml(generated)}</div>
  </div>

  <div class="kpis">${kpiHtml}</div>

  <h2>Revenue by category</h2>
  <table>
    <thead><tr><th>Category</th><th class="num">Qty sold</th><th class="num">Revenue</th></tr></thead>
    <tbody>${categoryRows}</tbody>
  </table>

  <h2>Top items by quantity</h2>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty sold</th><th class="num">Revenue</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <h2>${escapeHtml(breakdownLabel)}</h2>
  <table>
    <thead><tr><th>${escapeHtml(unitLabel)}</th><th class="num">Revenue</th></tr></thead>
    <tbody>${breakdownRows}</tbody>
  </table>

  <div class="footer">Generated by Central POS.</div>
</body>
</html>`
}

/**
 * Downloads the report as a Word-openable `.doc`. Uses an HTML document with
 * the Word XML namespace headers and a UTF-8 BOM so Word renders the peso sign
 * and accented names correctly. No `docx` dependency required.
 */
export function downloadSalesReportWord(
  data: SalesReportData,
  range: DateRange,
  store: Pick<Store, 'name'>,
): void {
  const html = buildSalesReportHtml(data, range, store)
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  downloadBlob(blob, `${reportBaseName(range)}.doc`)
}

/**
 * Opens the browser print dialog for a print-optimized report view, so the user
 * can choose "Save as PDF". Renders inside a hidden iframe (no popups) and
 * cleans up afterwards. Dependency-free.
 */
export function printSalesReport(
  data: SalesReportData,
  range: DateRange,
  store: Pick<Store, 'name'>,
): void {
  const html = buildSalesReportHtml(data, range, store)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    cleanup()
    throw new Error('Printing is not supported in this browser.')
  }

  let printed = false
  const runPrint = () => {
    if (printed) return
    printed = true
    win.onafterprint = cleanup
    try {
      win.focus()
      win.print()
    } finally {
      // Fallback for browsers that never fire onafterprint.
      setTimeout(cleanup, 60_000)
    }
  }

  doc.open()
  doc.write(html)
  doc.close()

  if (doc.readyState === 'complete') {
    setTimeout(runPrint, 150)
  } else {
    iframe.onload = () => setTimeout(runPrint, 150)
  }
}
