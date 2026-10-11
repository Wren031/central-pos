import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  accent?: string
  className?: string
}) {
  return (
    <Card className={cn('gap-0 py-4 shadow-none', className)}>
      <CardContent className="flex items-center gap-3 px-4">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={
            accent
              ? { backgroundColor: `${accent}1a`, color: accent }
              : undefined
          }
        >
          <Icon className={cn('size-5', !accent && 'text-muted-foreground')} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tracking-tight">{value}</p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
