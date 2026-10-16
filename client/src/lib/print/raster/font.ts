/**
 * The ticket font: a fixed-pitch bitmap atlas generated from JetBrainsMono
 * by tools/build_font.py in the reference repo. Rows are decoded lazily —
 * a receipt touches maybe forty distinct characters.
 */

import ATLAS from './font-atlas'

export const ADVANCE: number = ATLAS.advance // pen step, the fixed pitch
export const CELL_WIDTH: number = ATLAS.cellWidth // ink box, may exceed the pitch
export const HEIGHT: number = ATLAS.height
export const BASELINE: number = ATLAS.baseline
export const COLUMNS: number = ATLAS.columns

interface RasterAtlas {
  advance: number
  cellWidth: number
  height: number
  baseline: number
  columns: number
  glyphs: Record<string, string>
  fold: Record<string, string>
}

const data = ATLAS as unknown as RasterAtlas

const decoded = new Map<number, number[] | null>()
const EMPTY: number[] = []

function rowsFor(code: number): number[] | null {
  if (decoded.has(code)) return decoded.get(code) as number[] | null
  const raw = data.glyphs[String(code)]
  const rows = raw === undefined ? null : raw === '' ? EMPTY : raw.split(',').map(Number)
  decoded.set(code, rows)
  return rows
}

const FALLBACK = '?'.codePointAt(0) as number

/** Row bitmasks for one character, or the '?' glyph. bit 0 = leftmost pixel. */
export function glyph(ch: string): number[] {
  return rowsFor(ch.codePointAt(0) as number) ?? rowsFor(FALLBACK) ?? EMPTY
}

/** True when the atlas can actually draw this character. */
export function has(ch: string): boolean {
  return rowsFor(ch.codePointAt(0) as number) !== null
}

// The pair that decides how tight lines may sit: a descender hanging off one
// line, an accented capital reaching up from the next. Everything else clears.
const DESCENDERS = 'gjpqy,;()[]{}'
const RISERS = 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇÑ'

/** The tightest baseline-to-baseline spacing at which two lines cannot touch. */
export function minimumLeading(): number {
  let lowest = 0
  let highest = HEIGHT
  const scan = (text: string, fn: (y: number) => void) => {
    for (const ch of text) {
      const rows = rowsFor(ch.codePointAt(0) as number)
      if (!rows) continue
      for (let y = 0; y < rows.length; y++) if (rows[y]) fn(y)
    }
  }
  scan(DESCENDERS, (y) => {
    if (y > lowest) lowest = y
  })
  scan(RISERS, (y) => {
    if (y < highest) highest = y
  })
  return lowest - highest + 1
}

function foldChar(ch: string): string | null {
  if (ch === '\n' || has(ch)) return ch
  const replacement = data.fold[String(ch.codePointAt(0))]
  if (replacement !== undefined) return replacement
  const stripped = ch.normalize('NFKD').replace(/\p{M}/gu, '')
  return stripped && stripped !== ch && [...stripped].every(has) ? stripped : null
}

/** Maps whatever cannot be drawn onto whatever can; unknown → '?'. */
export function fold(text: string): string {
  let out = ''
  for (const ch of text) out += foldChar(ch) ?? '?'
  return out
}

/** Synthetic bold: the glyph ORed with itself shifted one pixel right. */
export function embolden(rows: readonly number[]): number[] {
  return rows.map((mask) => mask | (mask << 1))
}

/**
 * Downscale factor for the "compact" raster type size. The atlas is a fixed
 * bitmap (17 px pitch, 35 px tall), so the only way to print smaller on a
 * graphic-mode printer is to resample the glyphs — there is no smaller font to
 * select, unlike ESC/POS Font B.
 */
export const COMPACT_FACTOR = 2

/** Pen advance (px) for a given downscale factor — 1 leaves the atlas native. */
export function advanceFor(factor = 1): number {
  return factor > 1 ? Math.ceil(ADVANCE / factor) : ADVANCE
}

/** Ink-box width (px) for a given downscale factor. */
export function cellWidthFor(factor = 1): number {
  return factor > 1 ? Math.ceil(CELL_WIDTH / factor) : CELL_WIDTH
}

/** Baseline offset (px) for a given downscale factor. */
export function baselineFor(factor = 1): number {
  return factor > 1 ? Math.floor(BASELINE / factor) : BASELINE
}

/**
 * Resample a glyph's row bitmasks down by an integer factor, OR-ing each
 * source block. OR (not decimation) is deliberate: it never drops a stroke, so
 * thin 1-px stems survive the shrink instead of vanishing.
 */
export function downsample(
  rows: readonly number[],
  width = CELL_WIDTH,
  factor = COMPACT_FACTOR,
): { rows: number[]; width: number } {
  if (factor <= 1) return { rows: [...rows], width }
  const outWidth = Math.ceil(width / factor)
  const out: number[] = []
  for (let y = 0; y < rows.length; y += factor) {
    let acc = 0
    for (let dy = 0; dy < factor && y + dy < rows.length; dy++) {
      const mask = rows[y + dy]
      if (!mask) continue
      for (let x = 0; x < width; x++) {
        if (mask & (1 << x)) acc |= 1 << Math.floor(x / factor)
      }
    }
    out.push(acc)
  }
  return { rows: out, width: outWidth }
}

/**
 * The tightest baseline-to-baseline spacing for downsampled glyphs. Measured on
 * the resampled bitmaps themselves (not divided from the full-size value) so
 * lines can never overlap in compact mode.
 */
export function compactLeading(factor = COMPACT_FACTOR): number {
  let lowest = 0
  let highest = HEIGHT
  const scan = (text: string, fn: (y: number) => void) => {
    for (const ch of text) {
      const src = rowsFor(ch.codePointAt(0) as number)
      if (!src) continue
      const { rows } = downsample(src, CELL_WIDTH, factor)
      for (let y = 0; y < rows.length; y++) if (rows[y]) fn(y)
    }
  }
  scan(DESCENDERS, (y) => {
    if (y > lowest) lowest = y
  })
  scan(RISERS, (y) => {
    if (y < highest) highest = y
  })
  return lowest - highest + 1
}