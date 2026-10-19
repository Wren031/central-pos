import * as React from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { LucideIcon } from 'lucide-react'

const SECTION_TONE: Record<string, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/20',
  secondary: 'bg-sky-500/10 text-sky-600 ring-sky-500/20',
  accent: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-600 ring-amber-500/20',
  error: 'bg-red-500/10 text-red-600 ring-red-500/20',
  neutral: 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/20',
}

export function Breadcrumb({
  parent,
  parentTo,
  current,
}: {
  parent: string
  parentTo: string
  current: string
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link to={parentTo} className="transition-colors hover:text-foreground">
        {parent}
      </Link>
      <ChevronRight className="size-3" aria-hidden />
      <span className="truncate font-medium text-foreground">{current}</span>
    </nav>
  )
}

export function CopyButton({ value, label = 'ID' }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copied to clipboard.`)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy ${label}`}
      onClick={copy}
      className="shrink-0"
    >
      {copied ? (
        <Check className="text-emerald-500" aria-hidden />
      ) : (
        <Copy className="text-muted-foreground" aria-hidden />
      )}
    </Button>
  )
}

export function MonoId({ value, label = 'ID' }: { value: string; label?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/50 py-0.5 pr-0.5 pl-2 font-mono text-xs text-muted-foreground">
      <span className="truncate">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  )
}

export function DetailField({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-muted/40 p-3.5 transition-colors hover:border-border hover:bg-muted/70',
        className,
      )}
    >
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium break-words text-foreground">{value || '—'}</div>
    </div>
  )
}

export function DetailSection({
  icon: Icon,
  title,
  description,
  tone = 'primary',
  actions,
  children,
  bodyClassName,
}: {
  icon: LucideIcon
  title: string
  description?: string
  tone?: keyof typeof SECTION_TONE
  actions?: React.ReactNode
  children: React.ReactNode
  bodyClassName?: string
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              SECTION_TONE[tone] ?? SECTION_TONE.primary,
            )}
          >
            <Icon className="size-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName ?? 'p-5'}>{children}</div>
    </section>
  )
}

export function DetailEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
