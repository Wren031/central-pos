import { EscPos, PAPER_COLS, columnsFor, type PaperWidth } from './escpos'
import { formatDateTime } from '../format'
import { unitLabel } from '../units'
import {
  DEFAULT_RECEIPT_LAYOUT,
  receiptFontPlan,
  type Order,
  type ReceiptLayout,
} from '../types'

export interface ReceiptOptions {
  storeName: string
  storeAddress?: string
  paperWidth?: PaperWidth
  layout?: ReceiptLayout
}

const PAYMENT_LABEL: Record<Order['paymentStatus'], string> = {
  paid: 'PAID',
  unpaid: 'UNPAID',
}

/** Magnification factor implied by a GS ! / ESC ! flag (0x10 / 0x11 double the width). */
function widthFactor(flag: number): 1 | 2 {
  return flag === 0x00 ? 1 : 2
}

/**
 * Build a complete ESC/POS receipt for an order, honoring the store's
 * saved layout. Real commands only — no layout faking.
 */
export function buildReceipt(order: Order, opts: ReceiptOptions): Uint8Array {
  const layout = { ...DEFAULT_RECEIPT_LAYOUT, ...opts.layout }
  const plan = receiptFontPlan(layout.fontSize)
  const width = opts.paperWidth ?? 80
  // Body columns follow the font actually selected — Font B is narrower (9 vs
  // 12 dots), so it fits more characters per line. Using Font A columns with
  // Font B would leave the ticket short of the paper edge.
  const cols = Math.floor(columnsFor(width, plan.fontB ? 'b' : 'a') / widthFactor(plan.flag))
  // The header is always Font A, so it keeps its own Font-A width budget.
  const fontACols = PAPER_COLS[width]
  const headerCols = Math.floor(fontACols / 2)
  const maxName = Math.max(8, Math.min(24, cols - 10))
  const p = new EscPos()
  const compact = layout.headerStyle === 'compact'

  p.init()

  // Header — Font A so the store name stays the visual anchor.
  p.fontB(false)
  p.align(1)
  if (!compact) p.bold(true).size(0x11)
  p.text(opts.storeName.toUpperCase().slice(0, compact ? fontACols : headerCols))
  // Body — switch to the configured font + magnification before any body text.
  p.bold(false).fontB(plan.fontB).size(plan.flag)
  if (layout.showAddress && opts.storeAddress) {
    p.align(1).text(opts.storeAddress.slice(0, cols))
  }
  if (layout.showTin) {
    p.align(1).text('VAT Reg. TIN 000-000-000-000'.slice(0, cols))
  }
  p.dashLine(cols)

  // Order meta.
  p.align(0).text(`Receipt No: ${order.receiptNo}`)
  p.text(`Date:       ${formatDateTime(order.createdAt)}`)
  if (layout.showCustomer && order.customerName) {
    p.text(`Customer:   ${order.customerName}`)
  }
  p.dashLine(cols)

  // Line items.
  p.text('Item                           Qty    Amount'.slice(0, cols))
  for (const item of order.items) {
    const name = item.name.length > maxName ? `${item.name.slice(0, maxName - 1)}?` : item.name
    const qtyText = `${item.qty} ${unitLabel(item.unit)}`
    const qty = layout.showUnitPrice
      ? `${qtyText} x ${item.price.toFixed(2)}`
      : qtyText
    p.row(`${name} ${qty}`, (item.price * item.qty).toFixed(2), cols)
  }
  p.dashLine(cols)

  // Totals.
  if (layout.showBreakdown) {
    p.row('Subtotal', order.subtotal.toFixed(2), cols)
    if (order.discount > 0) {
      p.row('Discount', `-${order.discount.toFixed(2)}`, cols)
    }
  }
  p.bold(true).row('TOTAL', order.total.toFixed(2), cols).bold(false)
  if (order.paymentStatus === 'paid' && order.cashTendered != null) {
    p.row('Cash', order.cashTendered.toFixed(2), cols)
    p.row('Change', (order.change ?? 0).toFixed(2), cols)
  }
  p.dashLine(cols)

  // Payment status.
  p.align(1).bold(true).text(`STATUS: ${PAYMENT_LABEL[order.paymentStatus]}`).bold(false)
  if (layout.footerText.trim()) {
    p.align(1).text(layout.footerText.trim())
  }

  // Feed, then partial cut.
  p.feed(4)
  p.cut(true)

  return p.toUint8Array()
}

/** Small self-test page printed from the printer settings card. */
export function buildTestReceipt(
  storeName: string,
  paperWidth: PaperWidth = 80,
  layout?: ReceiptLayout,
): Uint8Array {
  const merged = { ...DEFAULT_RECEIPT_LAYOUT, ...layout }
  const plan = receiptFontPlan(merged.fontSize)
  const cols = Math.floor(columnsFor(paperWidth, plan.fontB ? 'b' : 'a') / widthFactor(plan.flag))
  const p = new EscPos()
  p.init()
  // Title in Font A double-size, body in the configured font — same as a receipt.
  p.fontB(false).align(1).bold(true).size(0x11).text('SELF TEST')
  p.bold(false).fontB(plan.fontB).size(plan.flag)
  p.dashLine(cols)
  p.text(storeName.slice(0, cols))
  p.text(`Date: ${formatDateTime(new Date().toISOString())}`.slice(0, cols))
  p.dashLine(cols)
  p.text('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, cols))
  p.text('abcdefghijklmnopqrstuvwxyz'.slice(0, cols))
  p.text('!@#$%^&*()_+-=[]{};:,.<>?'.slice(0, cols))
  p.solidLine(cols)
  p.bold(true).row('TOTAL', '0.00', cols).bold(false)
  p.feed(4)
  p.cut(true)
  return p.toUint8Array()
}
