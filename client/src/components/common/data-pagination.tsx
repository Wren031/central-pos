import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAGE_SIZE_OPTIONS, pageWindow } from '@/lib/pagination'
import { cn } from '@/lib/utils'

export function DataPagination({
  page,
  pageSize,
  totalPages,
  total,
  from,
  to,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'rows',
  className,
}: {
  page: number
  pageSize: number
  totalPages: number
  total: number
  from: number
  to: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  /** Plural noun used in the range label, e.g. "products". */
  itemLabel?: string
  className?: string
}) {
  const atStart = page <= 1
  const atEnd = page >= totalPages

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col gap-3 border-t px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[4.25rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums text-muted-foreground">
          <span className="hidden sm:inline">
            {from}–{to} of {total} {itemLabel}
          </span>
          <span className="sm:hidden">
            {from}–{to} of {total}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="tabular-nums text-muted-foreground sm:hidden">
          Page {page} of {totalPages}
        </span>

        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, totalPages).map((entry, i) =>
            entry === 'gap' ? (
              <span
                key={`gap-${i}`}
                aria-hidden
                className="px-1 text-muted-foreground select-none"
              >
                …
              </span>
            ) : (
              <Button
                key={entry}
                type="button"
                variant={entry === page ? 'default' : 'ghost'}
                size="icon-sm"
                className={cn('tabular-nums', entry !== page && 'text-muted-foreground')}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? 'page' : undefined}
                onClick={() => onPageChange(entry)}
              >
                {entry}
              </Button>
            )
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={atStart}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={atEnd}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </nav>
  )
}
