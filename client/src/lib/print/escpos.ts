/**
 * ESC/POS command encoder for thermal receipt printers.
 *
 * Pure byte-level implementation — no dependencies, no mocks.
 * Reference: Epson ESC/POS command reference (the de-facto standard
 * understood by Epson, Rongta, HPRT, XPrinter, Netum, etc.).
 */

export type PaperWidth = 58 | 80

/** Character columns per line for Font A (12x24). */
export const PAPER_COLS: Record<PaperWidth, number> = { 58: 32, 80: 48 }

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const NUL = 0x00

export class EscPos {
  private bytes: number[] = []
  /** Tracked emphasis state so ESC ! (which owns the emphasis bit) stays in sync. */
  private boldOn = false

  private push(...vals: number[]): void {
    for (const v of vals) this.bytes.push(v & 0xff)
  }

  /** ESC @ — initialize printer (clears buffer, resets modes). */
  init(): this {
    this.boldOn = false
    this.push(ESC, 0x40)
    return this
  }

  /** ESC a n — alignment: 0=left, 1=center, 2=right. */
  align(n: 0 | 1 | 2): this {
    this.push(ESC, 0x61, n)
    return this
  }

  /** ESC E n — bold: 0=off, 1=on. */
  bold(on: boolean): this {
    this.boldOn = on
    this.push(ESC, 0x45, on ? 1 : 0)
    return this
  }

  /**
   * ESC ! + GS ! — character size.
   *
   * GS ! n is the modern command: bits 4-6 select width magnification, bits 0-2
   * height (n = (width-1)<<4 | (height-1); 0x10 = double width, 0x11 = double
   * both). Some budget BLE printers ignore GS ! entirely but still honor the
   * older ESC ! "batch print mode" (bit 5 = double width, bit 4 = double
   * height), so emit both with GS ! last — when both are supported the last
   * command wins, and when GS ! is ignored ESC ! still applies.
   */
  size(n: number): this {
    const width = ((n >> 4) & 0x07) + 1
    const height = (n & 0x07) + 1
    let mode = this.boldOn ? 0x08 : 0x00
    if (width > 1) mode |= 0x20
    if (height > 1) mode |= 0x10
    this.push(ESC, 0x21, mode)
    this.push(GS, 0x21, n)
    return this
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
