/**
 * Framework-free pagination maths. Kept pure and separate from React so the
 * clamping and windowing can be tested without a browser.
 */

/** Rows-per-page choices offered in the table footer. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 10

export interface PageSlice {
  /** Clamped, 1-based current page. */
  page: number
  totalPages: number
  /** 0-based index of the first row on the page. */
  start: number
  /** 1-based index of the first row shown (0 when there is nothing to show). */
  from: number
  /** 1-based index of the last row shown (0 when there is nothing to show). */
  to: number
}

/**
 * Clamp a page/page-size pair against a row count and derive the slice bounds.
 * The page is always forced into `[1, totalPages]`, so an empty or shrunken
 * list can never produce an out-of-range or negative slice.
 */
export function pageSlice(total: number, page: number, pageSize: number): PageSlice {
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : DEFAULT_PAGE_SIZE
  const rows = Math.max(0, Math.trunc(total) || 0)
  const totalPages = Math.max(1, Math.ceil(rows / size))
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1
  const current = Math.min(Math.max(1, requested || 1), totalPages)
  const start = (current - 1) * size
  return {
    page: current,
    totalPages,
    start,
    from: rows === 0 ? 0 : start + 1,
    to: rows === 0 ? 0 : Math.min(start + size, rows),
  }
}

/**
 * The page buttons to render: first, last, and a window around the current
 * page, with `'gap'` where pages are skipped. Keeps the control a fixed width
 * however many pages there are.
 */
export function pageWindow(
  page: number,
  totalPages: number,
  neighbours = 1
): (number | 'gap')[] {
  const total = Math.max(1, Math.trunc(totalPages))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), total)
  // Small enough to show every page — no gaps, no special cases.
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, current - neighbours)
  const end = Math.min(total - 1, current + neighbours)
  if (start > 2) out.push('gap')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < total - 1) out.push('gap')
  out.push(total)
  return out
}
