import * as React from 'react'
import {
  DEFAULT_PAGE_SIZE,
  pageSlice,
  type PageSlice,
} from '@/lib/pagination'

export { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, pageSlice, pageWindow } from '@/lib/pagination'
export type { PageSlice } from '@/lib/pagination'

export interface Pagination<T> extends Omit<PageSlice, 'start'> {
  pageSize: number
  total: number
  pageItems: T[]
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  next: () => void
  prev: () => void
}

/**
 * Slice a filtered list into pages.
 *
 * `resetKey` is compared by identity: when it changes (a new search term, a new
 * filter) the pager jumps back to page 1, which is what a user expects. Passing
 * the raw data in `items` does NOT reset the page — a background refresh must
 * not move the user off the page they are reading. If the list shrinks below the
 * current page, the page is clamped inwards (derived, not stored) instead of
 * showing an empty slice.
 */
export function usePagination<T>(
  items: readonly T[],
  options: { pageSize?: number; resetKey?: unknown } = {}
): Pagination<T> {
  const [pageSize, setPageSizeState] = React.useState(options.pageSize ?? DEFAULT_PAGE_SIZE)
  const [page, setPage] = React.useState(1)

  const total = items.length
  const slice = pageSlice(total, page, pageSize)

  const resetKey = options.resetKey
  const lastResetKey = React.useRef(resetKey)
  React.useEffect(() => {
    if (lastResetKey.current === resetKey) return
    lastResetKey.current = resetKey
    setPage(1)
  }, [resetKey])

  const setPageSize = React.useCallback((size: number) => {
    setPageSizeState(size)
    setPage(1)
  }, [])

  const pageItems = React.useMemo(
    () => (slice.start >= total ? [] : items.slice(slice.start, slice.start + pageSize)),
    [items, slice.start, pageSize, total]
  )

  return {
    page: slice.page,
    pageSize,
    totalPages: slice.totalPages,
    total,
    from: slice.from,
    to: slice.to,
    pageItems,
    setPage: React.useCallback((p: number) => setPage(Math.max(1, Math.trunc(p))), []),
    setPageSize,
    // Step from the clamped page, so a stale stored page can never make
    // "previous" move the wrong way.
    next: React.useCallback(
      () => setPage(Math.min(slice.page + 1, slice.totalPages)),
      [slice.page, slice.totalPages]
    ),
    prev: React.useCallback(() => setPage(Math.max(slice.page - 1, 1)), [slice.page]),
  }
}
