import { Store as StoreIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm',
        className
      )}
    >
      <StoreIcon className="size-5" aria-hidden />
    </div>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Central POS</div>
          <div className="text-[11px] text-muted-foreground">Subscription Platform</div>
        </div>
      )}
    </div>
  )
}
