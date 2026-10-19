/**
 * Monochrome 384-pixel-wide canvas, in exactly the line format the MXW01
 * graphic-mode printer eats (port of the reverse-engineered reference).
 *
 * The pixel packing is not a choice, it is what packet captures showed:
 * 48 bytes per line, bit set = black, and bit 0 of a byte is the LEFTMOST
 * pixel. The printer echoes the CRC8 of the image buffer it actually
 * received in its AA notification, and ae03 is written without response —
 * so the CRC is the only proof a ticket came out whole.
 */

export const WIDTH_PIXELS = 384
export const WIDTH_BYTES = 48

const CRC8_TABLE = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let bit = 0; bit < 8; bit++) {
    c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff
  }
  CRC8_TABLE[i] = c
}

/** CRC-8 Dallas/Maxim, poly 0x07, init 0x00, no reflection, no final xor. */
export function crc8(bytes: Uint8Array, crc = 0): number {
  for (const byte of bytes) crc = CRC8_TABLE[crc ^ byte]
  return crc
}

export class Canvas {
  readonly widthPixels: number
  readonly widthBytes: number
  /** One widthBytes-long line each, top row first. */
  rows: Uint8Array[] = []

  constructor(widthPixels = WIDTH_PIXELS) {
    if (!Number.isInteger(widthPixels) || widthPixels <= 0 || widthPixels % 8 !== 0) {
      throw new Error(`canvas width must be a positive multiple of 8, got ${widthPixels}`)
    }
    this.widthPixels = widthPixels
    this.widthBytes = widthPixels / 8
  }

  get height(): number {
    return this.rows.length
  }

  /** Grows the canvas so that row index y exists. */
  ensure(y: number): Uint8Array {
    while (this.rows.length <= y) this.rows.push(new Uint8Array(this.widthBytes))
    return this.rows[y]
  }

  /** Adds n blank lines and returns the new height. */
  feed(n: number): number {
    for (let i = 0; i < n; i++) this.rows.push(new Uint8Array(this.widthBytes))
    return this.height
  }

  setPixel(x: number, y: number): void {
    if (x < 0 || x >= this.widthPixels || y < 0) return
    this.ensure(y)[x >> 3] |= 1 << (x & 7)
  }

  /** Horizontal rule, `thickness` rows tall, inset by `margin` on each side. */
  rule(y: number, thickness = 1, margin = 0): number {
    for (let dy = 0; dy < thickness; dy++) {
      for (let x = margin; x < this.widthPixels - margin; x++) this.setPixel(x, y + dy)
    }
    return y + thickness
  }

  /** Dashed horizontal rule — reads as a tear line and costs a third of the ink. */
  dashedRule(y: number, dash = 6, gap = 5, margin = 0): number {
    for (let x = margin; x < this.widthPixels - margin; x++) {
      if (x % (dash + gap) < dash) this.setPixel(x, y)
    }
    return y + 1
  }

  /**
   * Blits one glyph, scaled by an integer factor. `rows` is the bitmask-per-row
   * array from font.glyph(); `width` is the glyph cell, which can be wider than
   * the pen advance for glyphs the font draws past their own pitch.
   */
  drawGlyph(rows: readonly number[], x0: number, y0: number, scale = 1, width = 8): void {
    for (let gy = 0; gy < rows.length; gy++) {
      const mask = rows[gy]
      if (mask === 0) continue
      for (let gx = 0; gx < width; gx++) {
        if ((mask & (1 << gx)) === 0) continue
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            this.setPixel(x0 + gx * scale + sx, y0 + gy * scale + sy)
          }
        }
      }
    }
  }

  /** Flips the canvas 180 degrees, in place. */
  rotate180(): this {
    this.rows.reverse()
    for (const row of this.rows) {
      const flipped = new Uint8Array(this.widthBytes)
      for (let x = 0; x < this.widthPixels; x++) {
        if (row[x >> 3] & (1 << (x & 7))) {
          const nx = this.widthPixels - 1 - x
          flipped[nx >> 3] |= 1 << (nx & 7)
        }
      }
      row.set(flipped)
    }
    return this
  }

  /** The whole image as one flat buffer, in transmission order. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(this.rows.length * this.widthBytes)
    this.rows.forEach((row, i) => out.set(row, i * this.widthBytes))
    return out
  }

  crc8(): number {
    return crc8(this.toBytes())
  }
}