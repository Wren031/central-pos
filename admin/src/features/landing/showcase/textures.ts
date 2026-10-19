import * as THREE from 'three'
import { DEMO_CATALOG, DEMO_ITEMS, DEMO_SCANNED_PRODUCT, DEMO_STORE, DEMO_TOTALS } from '../site'

/**
 * The 3D checkout demo renders its "screens" as canvas textures. Drawing them
 * on a 2D canvas (instead of DOM overlays) keeps text crisp, avoids any
 * DOM↔WebGL sync problems, and costs nothing per frame — each texture is drawn
 * once and only redrawn when the demo step changes.
 */

const FONT_STACK = '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

const C = {
  bg: '#0f1117',
  primary: '#7c6cff',
  primarySoft: 'rgba(124,108,255,0.18)',
  fg: '#f2f3f7',
  sub: '#b6bac7',
  faint: '#8a90a2',
  border: '#2c2f3a',
  panel: '#15171d',
  card: '#1b1e26',
  success: '#34d399',
  successSoft: 'rgba(16,185,129,0.16)',
  scan: '#f87171',
  scanSoft: 'rgba(239,68,68,0.16)',
} as const

const TILE_COLORS = ['#f59e0b', '#f97316', '#eab308', '#84cc16', '#22c55e', '#38bdf8'] as const

function font(ctx: CanvasRenderingContext2D, weight: number, size: number, scale: number) {
  ctx.font = `${weight} ${Math.round(size * scale)}px ${FONT_STACK}`
}

/** Rounded-rect path with a manual fallback for engines without `roundRect`. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string
) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

function strokeRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width = 2
) {
  roundRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

/** Draws a `label` centred in the rect at `y`. */
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: {
    size: number
    scale: number
    weight?: number
    color?: string
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
    maxWidth?: number
  }
) {
  font(ctx, opts.weight ?? 400, opts.size, opts.scale)
  ctx.fillStyle = opts.color ?? C.fg
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = opts.baseline ?? 'alphabetic'
  if (opts.maxWidth) ctx.fillText(value, x, y, opts.maxWidth)
  else ctx.fillText(value, x, y)
}

/** `₱1,234.00` without relying on Intl inside the canvas. */
function money(amount: number): string {
  const fixed = amount.toFixed(2)
  const [whole, cents] = fixed.split('.')
  return `₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
}

/* -------------------------------------------------------------------------- */
/* POS screen                                                                   */
/* -------------------------------------------------------------------------- */

const CART_LINES_BY_STEP: number[][] = [
  [], // 0 select
  [0], // 1 scan
  [0, 1, 2, 3], // 2 cart
  [0, 1, 2, 3], // 3 checkout
  [0, 1, 2, 3], // 4 receipt
]

function cartLines(step: number): number[] {
  return CART_LINES_BY_STEP[step] ?? []
}

function cartTotal(step: number): number {
  return cartLines(step).reduce((sum, i) => {
    const item = DEMO_ITEMS[i]
    return sum + item.qty * item.unitPrice
  }, 0)
}

export function drawScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number
) {
  const s = w / 1024

  // Backdrop
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, w, h)

  /* ---------- Top bar ---------- */
  ctx.fillStyle = C.card
  ctx.fillRect(0, 0, w, 68 * s)
  ctx.fillStyle = C.border
  ctx.fillRect(0, 68 * s, w, 1.5 * s)

  fillRound(ctx, 22 * s, 18 * s, 32 * s, 32 * s, 9 * s, C.primary)
  text(ctx, 'U', 38 * s, 40 * s, {
    size: 19,
    scale: s,
    weight: 700,
    color: '#12102a',
    align: 'center',
    baseline: 'middle',
  })
  text(ctx, DEMO_STORE.name, 66 * s, 33 * s, { size: 19, scale: s, weight: 650 })
  text(ctx, `${DEMO_STORE.terminal} · ${DEMO_STORE.layout}`, 66 * s, 53 * s, {
    size: 13,
    scale: s,
    color: C.faint,
  })

  // "Offline" pill, top-right
  fillRound(ctx, w - 168 * s, 20 * s, 146 * s, 28 * s, 14 * s, C.successSoft)
  ctx.fillStyle = C.success
  ctx.beginPath()
  ctx.arc(w - 148 * s, 34 * s, 4.5 * s, 0, Math.PI * 2)
  ctx.fill()
  text(ctx, 'Offline ready', w - 136 * s, 35 * s, {
    size: 13,
    scale: s,
    weight: 600,
    color: C.success,
    baseline: 'middle',
  })

  /* ---------- Product grid ---------- */
  const gridX = 22 * s
  const gridY = 88 * s
  const tileW = 197 * s
  const tileH = 236 * s
  const gap = 16 * s

  DEMO_CATALOG.forEach((product, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = gridX + col * (tileW + gap)
    const y = gridY + row * (tileH + gap)

    const isTarget = index === 0
    const highlighted = isTarget && step <= 1
    const selected = isTarget && step >= 1

    fillRound(ctx, x, y, tileW, tileH, 16 * s, C.card)
    strokeRound(
      ctx,
      x,
      y,
      tileW,
      tileH,
      16 * s,
      highlighted ? C.primary : C.border,
      highlighted ? 3 * s : 2 * s
    )

    // Colour swatch with the product initial
    fillRound(ctx, x + 14 * s, y + 14 * s, tileW - 28 * s, 108 * s, 12 * s, TILE_COLORS[index])
    text(ctx, product.name.charAt(0), x + tileW / 2, y + 14 * s + 54 * s, {
      size: 44,
      scale: s,
      weight: 700,
      color: 'rgba(255,255,255,0.92)',
      align: 'center',
      baseline: 'middle',
    })

    text(ctx, product.name, x + 16 * s, y + 158 * s, {
      size: 17,
      scale: s,
      weight: 600,
      maxWidth: tileW - 32 * s,
    })
    text(ctx, money(product.price), x + 16 * s, y + 190 * s, {
      size: 16,
      scale: s,
      weight: 600,
      color: C.primary,
    })

    if (selected) {
      const badge = 30 * s
      fillRound(ctx, x + tileW - badge - 12 * s, y + 12 * s, badge, badge, 8 * s, C.success)
      // check mark
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3.2 * s
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x + tileW - badge - 12 * s + 8 * s, y + 12 * s + badge / 2)
      ctx.lineTo(x + tileW - badge - 12 * s + badge / 2 - 1 * s, y + 12 * s + badge - 9 * s)
      ctx.lineTo(x + tileW - 12 * s - 7 * s, y + 12 * s + 8 * s)
      ctx.stroke()
    }
  })

  /* ---------- Cart panel ---------- */
  const px = 662 * s
  const py = 88 * s
  const pw = w - px - 22 * s
  const ph = h - py - 22 * s
  fillRound(ctx, px, py, pw, ph, 18 * s, C.card)
  strokeRound(ctx, px, py, pw, ph, 18 * s, C.border, 2 * s)

  text(ctx, 'Current sale', px + 22 * s, py + 40 * s, { size: 18, scale: s, weight: 650 })
  const lines = cartLines(step)
  text(ctx, `${lines.length} item${lines.length === 1 ? '' : 's'}`, px + pw - 22 * s, py + 40 * s, {
    size: 14,
    scale: s,
    color: C.faint,
    align: 'right',
  })

  const listY = py + 62 * s
  if (lines.length === 0) {
    text(ctx, 'Tap a product to begin', px + pw / 2, listY + 90 * s, {
      size: 16,
      scale: s,
      color: C.faint,
      align: 'center',
    })
  } else {
    lines.forEach((itemIndex, row) => {
      const item = DEMO_ITEMS[itemIndex]
      const y = listY + row * 56 * s
      fillRound(ctx, px + 14 * s, y, pw - 28 * s, 48 * s, 10 * s, C.panel)
      text(ctx, item.name, px + 26 * s, y + 21 * s, {
        size: 17,
        scale: s,
        weight: 600,
        maxWidth: pw - 150 * s,
      })
      text(ctx, `${item.qty} × ${money(item.unitPrice)}`, px + 26 * s, y + 39 * s, {
        size: 13.5,
        scale: s,
        color: C.faint,
      })
      text(ctx, money(item.qty * item.unitPrice), px + pw - 26 * s, y + 29 * s, {
        size: 17,
        scale: s,
        weight: 650,
        align: 'right',
      })
    })
  }

  /* ---------- Totals + charge ---------- */
  const totalsY = py + ph - 150 * s
  ctx.fillStyle = C.border
  ctx.fillRect(px + 18 * s, totalsY, pw - 36 * s, 1.5 * s)

  text(ctx, 'Subtotal', px + 22 * s, totalsY + 30 * s, { size: 14, scale: s, color: C.sub })
  text(ctx, money(cartTotal(step)), px + pw - 22 * s, totalsY + 30 * s, {
    size: 14,
    scale: s,
    color: C.sub,
    align: 'right',
  })

  text(ctx, 'Total', px + 22 * s, totalsY + 62 * s, { size: 20, scale: s, weight: 700 })
  text(ctx, money(cartTotal(step)), px + pw - 22 * s, totalsY + 62 * s, {
    size: 28,
    scale: s,
    weight: 700,
    align: 'right',
  })

  const paid = step >= 4
  const charge = step === 3
  fillRound(
    ctx,
    px + 18 * s,
    py + ph - 68 * s,
    pw - 36 * s,
    50 * s,
    12 * s,
    paid ? C.success : charge ? C.primary : C.primarySoft
  )
  text(
    ctx,
    paid ? 'Payment received' : 'Charge',
    px + pw / 2,
    py + ph - 43 * s,
    {
      size: 17,
      scale: s,
      weight: 700,
      color: paid ? '#ffffff' : charge ? '#12102a' : C.primary,
      align: 'center',
      baseline: 'middle',
    }
  )

  /* ---------- Step overlays ---------- */
  if (step === 1) {
    fillRound(ctx, gridX, gridY, tileW * 3 + gap * 2, 44 * s, 12 * s, C.scanSoft)
    text(ctx, 'Scanning barcode…', gridX + 18 * s, gridY + 22 * s, {
      size: 15,
      scale: s,
      weight: 650,
      color: C.scan,
      baseline: 'middle',
    })
  }

  if (step === 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)
    const bw = 460 * s
    const bh = 250 * s
    const bx = (w - bw) / 2
    const by = (h - bh) / 2
    fillRound(ctx, bx, by, bw, bh, 22 * s, C.card)
    fillRound(ctx, bx + bw / 2 - 34 * s, by + 40 * s, 68 * s, 68 * s, 34 * s, C.primarySoft)
    ctx.fillStyle = C.primary
    ctx.beginPath()
    ctx.arc(bx + bw / 2, by + 74 * s, 14 * s, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, 'Confirm payment', bx + bw / 2, by + 152 * s, {
      size: 24,
      scale: s,
      weight: 700,
      align: 'center',
    })
    text(ctx, `Charge ${money(cartTotal(step))} to the customer`, bx + bw / 2, by + 186 * s, {
      size: 15,
      scale: s,
      color: C.sub,
      align: 'center',
    })
    text(ctx, 'Tap to pay', bx + bw / 2, by + 216 * s, {
      size: 13,
      scale: s,
      weight: 600,
      color: C.primary,
      align: 'center',
    })
  }

  if (step >= 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)
    const bw = 460 * s
    const bh = 250 * s
    const bx = (w - bw) / 2
    const by = (h - bh) / 2
    fillRound(ctx, bx, by, bw, bh, 22 * s, C.card)
    fillRound(ctx, bx + bw / 2 - 34 * s, by + 38 * s, 68 * s, 68 * s, 34 * s, C.success)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6 * s
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(bx + bw / 2 - 16 * s, by + 72 * s)
    ctx.lineTo(bx + bw / 2 - 4 * s, by + 85 * s)
    ctx.lineTo(bx + bw / 2 + 18 * s, by + 58 * s)
    ctx.stroke()
    text(ctx, 'Payment successful', bx + bw / 2, by + 150 * s, {
      size: 24,
      scale: s,
      weight: 700,
      align: 'center',
    })
    text(ctx, `Paid ${money(cartTotal(step))} · receipt printing`, bx + bw / 2, by + 186 * s, {
      size: 15,
      scale: s,
      color: C.sub,
      align: 'center',
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Receipt                                                                      */
/* -------------------------------------------------------------------------- */

export function drawReceipt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = w / 512
  const pad = 30 * s

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  // Perforated top edge
  ctx.fillStyle = '#eef0f4'
  for (let x = 8 * s; x < w; x += 22 * s) {
    ctx.beginPath()
    ctx.arc(x, 0, 7 * s, 0, Math.PI)
    ctx.fill()
  }

  let y = 54 * s
  const center = w / 2

  text(ctx, DEMO_STORE.name.toUpperCase(), center, y, {
    size: 24,
    scale: s,
    weight: 700,
    align: 'center',
  })
  y += 26 * s
  text(ctx, DEMO_STORE.address, center, y, {
    size: 12.5,
    scale: s,
    color: C.sub,
    align: 'center',
  })
  y += 20 * s
  text(ctx, 'VAT REG TIN 000-000-000-000', center, y, {
    size: 11.5,
    scale: s,
    color: C.faint,
    align: 'center',
  })

  y += 24 * s
  dashed(ctx, pad, y, w - pad, 1.4 * s, C.border)
  y += 24 * s

  const meta: [string, string][] = [
    ['Receipt no.', DEMO_STORE.receiptNo],
    ['Cashier', DEMO_STORE.cashier],
    ['Terminal', DEMO_STORE.terminal],
  ]
  meta.forEach(([label, value]) => {
    text(ctx, label, pad, y, { size: 13, scale: s, color: C.sub })
    text(ctx, value, w - pad, y, { size: 13, scale: s, weight: 600, align: 'right' })
    y += 20 * s
  })

  y += 6 * s
  dashed(ctx, pad, y, w - pad, 1.4 * s, C.border)
  y += 24 * s

  text(ctx, 'ITEM', pad, y, { size: 12, scale: s, weight: 700, color: C.faint })
  text(ctx, 'AMOUNT', w - pad, y, { size: 12, scale: s, weight: 700, color: C.faint, align: 'right' })
  y += 10 * s
  ctx.fillStyle = C.border
  ctx.fillRect(pad, y, w - pad * 2, 1.4 * s)
  y += 24 * s

  DEMO_ITEMS.forEach((item) => {
    text(ctx, item.name, pad, y, { size: 15, scale: s, weight: 600 })
    text(ctx, money(item.qty * item.unitPrice), w - pad, y, {
      size: 15,
      scale: s,
      weight: 600,
      align: 'right',
    })
    y += 19 * s
    text(ctx, `${item.qty} × ${money(item.unitPrice)}`, pad, y, { size: 12.5, scale: s, color: C.faint })
    y += 22 * s
  })

  y += 4 * s
  dashed(ctx, pad, y, w - pad, 1.4 * s, C.border)
  y += 26 * s

  const total = DEMO_TOTALS.subtotal
  const change = DEMO_TOTALS.cash - total

  text(ctx, 'Subtotal', pad, y, { size: 14, scale: s, color: C.sub })
  text(ctx, money(total), w - pad, y, { size: 14, scale: s, align: 'right' })
  y += 26 * s
  text(ctx, 'TOTAL', pad, y, { size: 18, scale: s, weight: 700 })
  text(ctx, money(total), w - pad, y, { size: 18, scale: s, weight: 700, align: 'right' })
  y += 26 * s
  text(ctx, 'Cash', pad, y, { size: 13.5, scale: s, color: C.sub })
  text(ctx, money(DEMO_TOTALS.cash), w - pad, y, { size: 13.5, scale: s, align: 'right' })
  y += 20 * s
  text(ctx, 'Change', pad, y, { size: 13.5, scale: s, color: C.sub })
  text(ctx, money(change), w - pad, y, { size: 13.5, scale: s, align: 'right' })
  y += 24 * s

  fillRound(ctx, pad, y, w - pad * 2, 30 * s, 8 * s, C.successSoft)
  text(ctx, 'PAID', pad + 12 * s, y + 16 * s, {
    size: 13,
    scale: s,
    weight: 700,
    color: C.success,
    baseline: 'middle',
  })
  text(ctx, 'Thank you, come again!', w - pad - 12 * s, y + 16 * s, {
    size: 12.5,
    scale: s,
    color: C.success,
    align: 'right',
    baseline: 'middle',
  })
  y += 46 * s

  // Receipt barcode
  const bw = w - pad * 2
  const bh = 74 * s
  drawBarcode(ctx, pad, y, bw, bh, DEMO_STORE.receiptNo.padStart(12, '9'))
  y += bh + 18 * s
  text(ctx, DEMO_STORE.receiptNo, center, y, {
    size: 12,
    scale: s,
    color: C.sub,
    align: 'center',
  })

  y += 30 * s
  text(ctx, 'Powered by UniPOS', center, y, {
    size: 11.5,
    scale: s,
    color: C.faint,
    align: 'center',
  })
}

function dashed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  lineWidth: number,
  color: string
) {
  ctx.save()
  ctx.setLineDash([6, 6])
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
  ctx.restore()
}

/* -------------------------------------------------------------------------- */
/* Barcode                                                                      */
/* -------------------------------------------------------------------------- */

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']

/** Encodes 12 digits as an authentic-looking EAN-13 module pattern. */
function eanModules(code: string): string {
  const digits = code.replace(/\D/g, '').padStart(12, '9').slice(0, 12)
  let pattern = '101'
  for (let i = 0; i < 6; i += 1) pattern += EAN_L[Number(digits[i])]
  pattern += '01010'
  for (let i = 6; i < 12; i += 1) pattern += EAN_R[Number(digits[i])]
  pattern += '101'
  return pattern
}

export function drawBarcode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  code: string
) {
  const modules = eanModules(code)
  const moduleWidth = w / modules.length
  const textHeight = h * 0.22
  const barHeight = h - textHeight
  const guardHeight = barHeight + textHeight * 0.5

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w, h)

  ctx.fillStyle = '#101322'
  for (let i = 0; i < modules.length; i += 1) {
    if (modules[i] !== '1') continue
    const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92
    ctx.fillRect(x + i * moduleWidth, y, moduleWidth + 0.3, isGuard ? guardHeight : barHeight)
  }

  ctx.fillStyle = '#101322'
  ctx.font = `600 ${Math.round(textHeight * 0.95)}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(code.replace(/\D/g, '').padStart(12, '9').slice(0, 12), x + w / 2, y + h)
}

/* -------------------------------------------------------------------------- */
/* Texture helpers                                                              */
/* -------------------------------------------------------------------------- */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

/** An empty canvas texture, ready to be drawn into by `redrawTexture`. */
export function createBlankTexture(w: number, h: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(makeCanvas(w, h))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function createTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture {
  const texture = createBlankTexture(w, h)
  redrawTexture(texture, draw)
  return texture
}

export function redrawTexture(
  texture: THREE.CanvasTexture,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
) {
  const canvas = texture.image as HTMLCanvasElement | undefined
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  draw(ctx, canvas.width, canvas.height)
  texture.needsUpdate = true
}

/** The scanned product's barcode, used on the demo product mesh. */
export const SCANNED_BARCODE = DEMO_SCANNED_PRODUCT.barcode
