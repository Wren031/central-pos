import { CalendarRange } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DATE_RANGE_LABEL, DATE_RANGE_OPTIONS, type DateRange } from '@/lib/date-range'
import { cn } from '@/lib/utils'

export function DateRangeSelect({
  value,
  onChange,
  className,
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className={cn('w-full sm:w-36', className)} aria-label="Filter by date range">
        <CalendarRange className="size-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATE_RANGE_OPTIONS.map((r) => (
          <SelectItem key={r} value={r}>
            {DATE_RANGE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
