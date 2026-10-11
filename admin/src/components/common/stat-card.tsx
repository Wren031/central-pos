import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error' | 'neutral'
}) {
  const toneClass: Record<string, string> = {
    primary: 'bg-indigo-50 text-indigo-600',
    secondary: 'bg-sky-50 text-sky-600',
    accent: 'bg-emerald-50 text-emerald-600',
    info: 'bg-sky-50 text-sky-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    error: 'bg-red-50 text-red-600',
    neutral: 'bg-zinc-100 text-zinc-600',
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-3.5">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            toneClass[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
