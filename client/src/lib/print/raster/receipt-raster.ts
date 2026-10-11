/**
 * Composes a receipt as a 1-bit raster for the MXW01's 384-dot paper,
 * honoring the same layout settings the ESC/POS path uses.
 *
 * The ESC/POS encoder and this composer are intentionally parallel: same
 * layout object, same content, two paper languages. One prints on an ESC/POS
 * machine, the other on a graphic-mode printer that does not recognise a
 * single ESC/POS byte.
 */

import { Canvas, WIDTH_PIXELS } from './canvas'
import { ADVANCE, BASELINE, fold, glyph, embolden, minimumLeading } from './font'
import { formatDateTime } from '../../format'
import {
  DEFAULT_RECEIPT_LAYOUT,
  receiptFontStep,
  type Order,
  type ReceiptLayout,
} from '../../types'

const MARGIN = 12
const PAYMENT_LABEL: Record<Order['paymentStatus'], string> = {
  paid: 'PAID',
  unpaid: 'UNPAID',
}

export interface RasterCell {
  text: string
  align?: 'left' | 'center' | 'right'
}

export interface RasterRow {
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  /** 2 = pixel-doubled, good for the store name / TOTAL header. */
  scale?: 1 | 2
  text?: string
  cells?: RasterCell[]
  /** A rule line — 'dash' reads as a tear line and costs a third of the ink. */
  rule?: 'dash' | 'solid'
}

export interface RasterComposeOptions {
  storeName: string
  storeAddress?: string
  layout?: ReceiptLayout
  /** 58 mm paper is the MXW01's native width; 80 mm is honored for symmetry. */
  widthPixels?: number
}

/** Greedy word wrap at a character budget (the font is fixed pitch). */
function wrap(text: string, maxChars: number): string[] {
  if (!text) return []
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current && current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`
    } else {
      if (current !== '') lines.push(current)
      current = word.length > maxChars ? word.slice(0, maxChars) : word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

function textWidth(text: string, scale: number): number {
  return [...text].length * ADVANCE * scale
}

/** $0.00 — the same plain decimals the ESC/POS side prints, no peso glyph. */
const two = (n: number): string => n.toFixed(2)

/**
 * Renders rows onto the canvas. Returns the flat image buffer the MXW01
 * driver wants: 48 bytes per line, top row first, bit 0 = leftmost pixel.
 */
export function rasterize(rows: readonly RasterRow[], widthPixels = WIDTH_PIXELS): Uint8Array {
  const lead = minimumLeading()
  const canvas = new Canvas(widthPixels)
  const contentW = widthPixels - MARGIN * 2

  // The y coordinate of the next row's baseline. Ink hangs from it and
  // descends below it; `lead` is the tightest baseline-to-baseline pitch.
  let baseline = lead * 2

  const put = (
    text: string,
    x: number,
    baselineY: number,
    scale: number,
    bold: boolean,
  ): void => {
    const y0 = baselineY - BASELINE * scale
    for (const ch of fold(text)) {
      let rows: number[] = glyph(ch)
      if (bold) rows = embolden(rows)
      canvas.drawGlyph(rows, x, y0, scale, ADVANCE)
      x += ADVANCE * scale
    }
  }

  const textLines = (text: string, scale: number): string[] => {
    const budget = Math.floor(contentW / (ADVANCE * scale))
    return fold(text).length > budget ? wrap(text, budget) : [fold(text)]
  }

  const xFor = (line: string, align: string | undefined, scale: number): number => {
    const w = textWidth(line, scale)
    const x =
      align === 'center'
        ? MARGIN + (contentW - w) / 2
        : align === 'right'
          ? widthPixels - MARGIN - w
          : MARGIN
    return Math.max(MARGIN, Math.min(x, widthPixels - MARGIN - w))
  }

  for (const row of rows) {
    const scale = row.scale === 2 ? 2 : 1
    if (row.rule === 'dash') {
      canvas.dashedRule(baseline, 6, 5, MARGIN)
      baseline += lead
      continue
    }
    if (row.rule === 'solid') {
      canvas.rule(baseline, 1, MARGIN)
      baseline += lead
      continue
    }

    if (row.cells) {
      const left = row.cells.find((c) => c.align === 'left')
      const right = row.cells.find((c) => c.align === 'right')
      if (left && right) {
        const lw = textWidth(fold(left.text), scale)
        const rw = textWidth(fold(right.text), scale)
        if (lw + rw <= contentW) {
          put(left.text, MARGIN, baseline, scale, row.bold === true)
          put(right.text, widthPixels - MARGIN - rw, baseline, scale, row.bold === true)
          baseline += lead * scale
        } else {
          const budget = Math.max(1, Math.floor(contentW / (ADVANCE * scale)))
          const leftLines = wrap(left.text, budget)
          for (let i = 0; i < leftLines.length; i++) {
            put(leftLines[i], MARGIN, baseline + i * lead * scale, scale, row.bold === true)
          }
          const lastBaseline = baseline + (leftLines.length - 1) * lead * scale
          put(right.text, widthPixels - MARGIN - rw, lastBaseline, scale, row.bold === true)
          baseline += Math.max(leftLines.length, 1) * lead * scale
        }
        continue
      }
      const cell = row.cells[0]
      if (cell) {
        const line = fold(cell.text)
        put(line, xFor(line, cell.align, scale), baseline, scale, row.bold === true)
        baseline += lead * scale
      }
      continue
    }

    const lines = textLines(row.text ?? '', scale)
    const align = row.align
    for (let i = 0; i < lines.length; i++) {
      put(lines[i], xFor(lines[i], align, scale), baseline + i * lead * scale, scale, row.bold === true)
    }
    if (lines.length === 0) {
      baseline += lead
    } else {
      baseline += lines.length * lead * scale
    }
  }

  // A couple of blank rows keep the paper from crowding the tear bar; the
  // driver's A3 feed is what actually clears it.
  canvas.feed(2)
  return canvas.toBytes()
}

/**
 * The full receipt for an order — parallel to buildReceipt(). Returns the
 * image buffer, ready to hand to the MXW01 session.
 */
export function buildRasterReceipt(order: Order, opts: RasterComposeOptions): Uint8Array {
  const layout = { ...DEFAULT_RECEIPT_LAYOUT, ...opts.layout }
  const { widthPixels = WIDTH_PIXELS } = opts
  const rows: RasterRow[] = []
  const budget = Math.floor((widthPixels - MARGIN * 2) / ADVANCE)
  const headerBudget = layout.headerStyle === 'compact' ? budget : Math.floor(budget / 2)
  const scale: 1 | 2 = layout.headerStyle === 'compact' ? 1 : 2
  // The raster font only has 1x and 2x steps, so any size at or above the
  // double-width step prints doubled — the same sizes that grow on ESC/POS.
  const bodyScale: 1 | 2 = receiptFontStep(layout.fontSize) >= 2 ? 2 : 1
  const totalScale: 1 | 2 = Math.max(scale, bodyScale) as 1 | 2

  // Header.
  for (const line of wrap(opts.storeName.toUpperCase(), headerBudget)) {
    rows.push({ text: line, align: 'center', bold: true, scale })
  }
  if (layout.showAddress && opts.storeAddress) {
    rows.push({ text: opts.storeAddress, align: 'center' })
  }
  if (layout.showTin) {
    rows.push({ text: 'VAT Reg. TIN 000-000-000-000', align: 'center' })
  }
  rows.push({ rule: 'dash' })

  // Order meta.
  rows.push({ text: `Receipt No: ${order.receiptNo}`, scale: bodyScale })
  rows.push({ text: `Date:       ${formatDateTime(order.createdAt)}`, scale: bodyScale })
  if (layout.showCustomer && order.customerName) {
    rows.push({ text: `Customer:   ${order.customerName}`, scale: bodyScale })
  }
  rows.push({ rule: 'dash' })

  // Line items — the raster is only ~20 characters wide, so a long name wraps
  // and the qty x price detail gets its own indented line.
  for (const item of order.items) {
    rows.push({
      cells: [
        { text: item.name, align: 'left' },
        { text: two(item.price * item.qty), align: 'right' },
      ],
      scale: bodyScale,
    })
    if (layout.showUnitPrice) {
      rows.push({ text: `${item.qty} x ${two(item.price)}`, scale: bodyScale })
    }
  }
  rows.push({ rule: 'dash' })

  // Totals.
  if (layout.showBreakdown) {
    rows.push({
      cells: [
        { text: 'Subtotal', align: 'left' },
        { text: two(order.subtotal), align: 'right' },
      ],
      scale: bodyScale,
    })
    if (order.discount > 0) {
      rows.push({
        cells: [
          { text: 'Discount', align: 'left' },
          { text: `-${two(order.discount)}`, align: 'right' },
        ],
        scale: bodyScale,
      })
    }
  }
  rows.push({
    cells: [
      { text: 'TOTAL', align: 'left' },
      { text: two(order.total), align: 'right' },
    ],
    bold: true,
    scale: totalScale,
  })
  if (order.paymentStatus === 'paid' && order.cashTendered != null) {
    rows.push({
      cells: [
        { text: 'Cash', align: 'left' },
        { text: two(order.cashTendered), align: 'right' },
      ],
      scale: bodyScale,
    })
    rows.push({
      cells: [
        { text: 'Change', align: 'left' },
        { text: two(order.change ?? 0), align: 'right' },
      ],
      scale: bodyScale,
    })
  }
  rows.push({ rule: 'dash' })

  // Payment status + footer.
  rows.push({
    text: `STATUS: ${PAYMENT_LABEL[order.paymentStatus]}`,
    align: 'center',
    bold: true,
    scale: bodyScale,
  })
  if (layout.footerText.trim()) {
    rows.push({ text: layout.footerText.trim(), align: 'center', scale: bodyScale })
  }

  return rasterize(rows, widthPixels)
}

/** Self-test page for the printer settings card — graphic-mode equivalent. */
export function buildRasterTest(
  storeName: string,
  widthPixels = WIDTH_PIXELS,
  layout?: ReceiptLayout,
): Uint8Array {
  const bodyScale: 1 | 2 = receiptFontStep({ ...DEFAULT_RECEIPT_LAYOUT, ...layout }.fontSize) >= 2 ? 2 : 1
  const rows: RasterRow[] = [
    { text: 'SELF TEST', align: 'center', bold: true, scale: 2 },
    { rule: 'dash' },
    { text: storeName, align: 'center', scale: bodyScale },
    { text: `Date: ${formatDateTime(new Date().toISOString())}`, align: 'center', scale: bodyScale },
    { rule: 'dash' },
    { text: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', align: 'center', scale: bodyScale },
    { text: 'abcdefghijklmnopqrstuvwxyz', align: 'center', scale: bodyScale },
    { text: '!@#$%^&*()_+-=[]{};:,.<>?', align: 'center', scale: bodyScale },
    { rule: 'dash' },
    {
      cells: [
        { text: 'TOTAL', align: 'left' },
        { text: '0.00', align: 'right' },
      ],
      bold: true,
      scale: bodyScale,
    },
  ]
  return rasterize(rows, widthPixels)
}