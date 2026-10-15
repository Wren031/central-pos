import { EscPos, PAPER_COLS, type PaperWidth } from './escpos'
import { formatDateTime } from '../format'
import { unitLabel } from '../units'
import {
  DEFAULT_RECEIPT_LAYOUT,
  receiptFontStep,
  type Order,
  type ReceiptFontPrintStep,
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

/** GS ! n flags per print step: 0x00 native, 0x10 double width, 0x11 double both. */
const STEP_FLAG: Record<ReceiptFontPrintStep, { flag: number; widthMul: 1 | 2 }> = {
  1: { flag: 0x00, widthMul: 1 },
  2: { flag: 0x10, widthMul: 2 },
  3: { flag: 0x11, widthMul: 2 },
}

/**
 * Build a complete ESC/POS receipt for an order, honoring the store's
 * saved layout. Real commands only — no layout faking.
 */
export function buildReceipt(order: Order, opts: ReceiptOptions): Uint8Array {
  const layout = { ...DEFAULT_RECEIPT_LAYOUT, ...opts.layout }
  const font = STEP_FLAG[receiptFontStep(layout.fontSize)]
  // Double-width characters halve the usable columns — recompute every row.
  const paperCols = PAPER_COLS[opts.paperWidth ?? 80]
  const cols = Math.floor(paperCols / font.widthMul)
  // The full header prints at double size, so it keeps its own half-width
  // budget no matter what body font size is selected.
  const headerCols = Math.floor(paperCols / 2)
  const maxName = Math.max(8, Math.min(24, cols - 10))
  const p = new EscPos()

  p.init()
  p.size(font.flag)

  // Header — store identity, centered; full style is double-size + bold.
  const compact = layout.headerStyle === 'compact'
  p.align(1)
  if (!compact) p.bold(true).size(0x11)
  p.text(opts.storeName.toUpperCase().slice(0, compact ? cols : headerCols))
  if (!compact) p.size(font.flag).bold(false)
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
  const font = STEP_FLAG[receiptFontStep(merged.fontSize)]
  const cols = Math.floor(PAPER_COLS[paperWidth] / font.widthMul)
  const p = new EscPos()
  p.init()
  p.size(font.flag)
  p.align(1).bold(true).size(0x11).text('SELF TEST').size(font.flag).bold(false)
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
