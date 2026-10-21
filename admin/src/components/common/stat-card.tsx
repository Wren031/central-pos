import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONE_STYLES: Record<
  string,
  { icon: string; bar: string }
> = {
  primary: {
    icon: 'bg-primary/10 text-primary ring-primary/20',
    bar: 'bg-primary',
  },
  secondary: {
    icon: 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
    bar: 'bg-sky-500',
  },
  accent: {
    icon: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    bar: 'bg-emerald-500',
  },
  info: {
    icon: 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
    bar: 'bg-sky-500',
  },
  success: {
    icon: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    bar: 'bg-emerald-500',
  },
  warning: {
    icon: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    bar: 'bg-amber-500',
  },
  error: {
    icon: 'bg-red-500/10 text-red-400 ring-red-500/20',
    bar: 'bg-red-500',
  },
  neutral: {
    icon: 'bg-zinc-500/10 text-muted-foreground ring-zinc-500/20',
    bar: 'bg-zinc-500',
  },
}

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
  const s = TONE_STYLES[tone] ?? TONE_STYLES.primary
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
            s.icon,
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div
          className={cn('h-1.5 w-1.5 rounded-full opacity-60 transition-opacity group-hover:opacity-100', s.bar)}
          aria-hidden
        />
      </div>
      <div className="mt-4 space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {hint && (
          <p className="truncate text-[11px] text-muted-foreground/70">{hint}</p>
        )}
      </div>
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100',
          s.bar,
        )}
        aria-hidden
      />
    </div>
  )
}
