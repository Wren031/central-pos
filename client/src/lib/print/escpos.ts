/**
 * ESC/POS command encoder for thermal receipt printers.
 *
 * Pure byte-level implementation — no dependencies, no mocks.
 * Reference: Epson ESC/POS command reference (the de-facto standard
 * understood by Epson, Rongta, HPRT, XPrinter, Netum, etc.).
 */

export type PaperWidth = 58 | 80

/** The two built-in ESC/POS character fonts. */
export type CharFont = 'a' | 'b'

/**
 * Dot cell per character, per font. These are the fixed built-in sizes —
 * ESC/POS cannot print a font smaller than Font B, and `GS !` / `ESC !` only
 * *magnify* (1x–8x); there is no sub-native size.
 */
export const FONT_CELL: Record<CharFont, { width: number; height: number }> = {
  a: { width: 12, height: 24 },
  b: { width: 9, height: 17 },
}

/** Character columns per line: Font A (12x24). */
export const PAPER_COLS: Record<PaperWidth, number> = { 58: 32, 80: 48 }

/** Character columns per line: Font B (9x17) — narrower cells, more fit. */
export const PAPER_COLS_FONT_B: Record<PaperWidth, number> = { 58: 42, 80: 64 }

/** Columns that fit on `width` in the given font (Font A is 12 dots, B is 9). */
export function columnsFor(width: PaperWidth, font: CharFont): number {
  return font === 'b' ? PAPER_COLS_FONT_B[width] : PAPER_COLS[width]
}

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const NUL = 0x00

export class EscPos {
  private bytes: number[] = []
  /** Tracked print-mode state: ESC ! (which owns the font bit) is always
   *  rebuilt from these, so no command can silently reset the font or size. */
  private boldOn = false
  private fontBOn = false
  private widthMul = 1
  private heightMul = 1

  private push(...vals: number[]): void {
    for (const v of vals) this.bytes.push(v & 0xff)
  }

  /** ESC @ — initialize printer (clears buffer, resets modes). */
  init(): this {
    this.boldOn = false
    this.fontBOn = false
    this.widthMul = 1
    this.heightMul = 1
    this.push(ESC, 0x40)
    return this
  }

  /** ESC a n — alignment: 0=left, 1=center, 2=right. */
  align(n: 0 | 1 | 2): this {
    this.push(ESC, 0x61, n)
    return this
  }

  /**
   * ESC E n — bold: 0=off, 1=on. Bold is also mirrored into the ESC ! mode
   * byte by applyMode() so the two commands never disagree.
   */
  bold(on: boolean): this {
    this.boldOn = on
    this.push(ESC, 0x45, on ? 1 : 0)
    return this
  }

  /**
   * Select the built-in character font.
   *
   * Font A (12x24) is the default and the larger of the two; Font B (9x17) is
   * the smallest size a thermal printer can produce — there is no ESC/POS
   * command for anything smaller. Emitted as ESC M n *and* mirrored into the
   * ESC ! font bit (bit 0), because budget BLE printers differ in which one
   * they honor; applyMode() keeps the pair consistent.
   */
  fontB(on: boolean): this {
    this.fontBOn = on
    this.push(ESC, 0x4d, on ? 1 : 0)
    this.applyMode()
    return this
  }

  /**
   * ESC ! + GS ! — character magnification.
   *
   * GS ! n is the modern command: bits 4-6 select width magnification, bits 0-2
   * height (n = (width-1)<<4 | (height-1); 0x10 = double width, 0x11 = double
   * both). Some budget BLE printers ignore GS ! entirely but still honor the
   * older ESC ! "batch print mode" (bit 5 = double width, bit 4 = double
   * height), so emit both with GS ! last — when both are supported the last
   * command wins, and when GS ! is ignored ESC ! still applies.
   */
  size(n: number): this {
    this.widthMul = ((n >> 4) & 0x07) + 1
    this.heightMul = (n & 0x07) + 1
    this.applyMode()
    return this
  }

  /**
   * Re-emit the full current print mode as a paired ESC ! / GS ! block. Every
   * command that changes the mode goes through here, so the font bit, emphasis,
   * and magnification can never be set by one command and stale in another.
   */
  private applyMode(): void {
    let esc = this.boldOn ? 0x08 : 0x00
    if (this.fontBOn) esc |= 0x01
    if (this.widthMul > 1) esc |= 0x20
    if (this.heightMul > 1) esc |= 0x10
    const gs = (((this.widthMul - 1) & 0x07) << 4) | ((this.heightMul - 1) & 0x07)
    this.push(ESC, 0x21, esc)
    this.push(GS, 0x21, gs)
  }

  /** LF — line feed. */
  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.push(LF)
    return this
  }

  /** Print a line of text (sanitized to ASCII) followed by LF. */
  text(line: string): this {
    const clean = line.replace(/[^\x20-\x7e]/g, '?')
    for (let i = 0; i < clean.length; i++) this.push(clean.charCodeAt(i))
    this.push(LF)
    return this
  }

  /** Print text without a trailing LF. */
  textInline(line: string): this {
    const clean = line.replace(/[^\x20-\x7e]/g, '?')
    for (let i = 0; i < clean.length; i++) this.push(clean.charCodeAt(i))
    return this
  }

  /** Dashed separator line spanning the paper width. */
  dashLine(cols: number): this {
    return this.text('-'.repeat(cols))
  }

  /** Solid separator line spanning the paper width. */
  solidLine(cols: number): this {
    return this.text('='.repeat(cols))
  }

  /**
   * Right-aligned amount on the same line as a left label.
   * ESC/POS has no tab stops — alignment is computed in software.
   */
  row(label: string, amount: string, cols: number): this {
    const labelLen = label.length
    const amountLen = amount.length
    const spaces = Math.max(1, cols - labelLen - amountLen)
    return this.text(label + ' '.repeat(spaces) + amount)
  }

  /** GS V m — cut paper. m=0/1 full cut, m=65/66 partial cut. */
  cut(partial = true): this {
    this.push(GS, 0x56, partial ? 66 : 0, 0)
    return this
  }

  /** ESC p m t1 t2 — pulse cash drawer (m=0, t1/t2 in 2ms units). */
  drawer(): this {
    this.push(ESC, 0x70, 0, 25, 250)
    return this
  }

  /** DLE EOT n — real-time status request (n=1 printer status). */
  statusRequest(): this {
    this.push(0x10, 0x04, 1)
    return this
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes)
  }

  toBase64(): string {
    let bin = ''
    for (const b of this.bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }
}

/** Sanitize a string for ESC/POS (printable ASCII only). */
export function sanitize(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '?')
}

export { NUL }
