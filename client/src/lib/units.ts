/**
 * Product unit-of-measure catalog.
 *
 * Units are DISPLAY LABELS only — stock and sale quantities always stay whole
 * numbers, so a product marked "kg" still tracks integer counts. A product with
 * no unit (legacy rows, older backups, seeded data) is treated as pieces.
 */

export const DEFAULT_UNIT = 'pc'

/** Preset units offered in the product form. Extend freely. */
export const PRODUCT_UNITS = [
  'pc',
  'bottle',
  'can',
  'pack',
  'box',
  'kg',
  'g',
  'L',
  'mL',
  'sack',
  'sachet',
  'dozen',
  'tray',
  'bundle',
] as const

export type ProductUnit = (typeof PRODUCT_UNITS)[number]

/** Normalized unit for a product, defaulting to pieces. */
export function unitLabel(unit?: string | null): string {
  const trimmed = unit?.trim()
  return trimmed ? trimmed : DEFAULT_UNIT
}

/**
 * Short, human-readable suffix for a quantity + unit. The abridged forms keep
 * receipts and dense table cells compact: `1 pc`, `12 pcs`, `2 kg`.
 */
export function formatQty(qty: number, unit?: string | null): string {
  const u = unitLabel(unit)
  if (u === 'pc') return `${qty} ${qty === 1 ? 'pc' : 'pcs'}`
  return `${qty} ${u}`
}
