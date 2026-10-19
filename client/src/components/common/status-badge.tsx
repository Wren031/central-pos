import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SubStatus } from '@/lib/types'

const CONFIG: Record<SubStatus, { label: string; className: string }> = {
  trial: { label: 'Free Trial', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  active: { label: 'Active', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  expiring: { label: 'Expiring Soon', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  expired: { label: 'Expired', className: 'bg-red-50 text-red-700 border-red-200' },
}

export function StatusBadge({ status, className }: { status: SubStatus; className?: string }) {
  const cfg = CONFIG[status]
  return (
    <Badge variant="outline" className={cn('font-medium', cfg.className, className)}>
      {cfg.label}
    </Badge>
  )
}

export function subStatusFromDays(daysLeft: number, plan: string | null): SubStatus {
  if (daysLeft <= 0) return 'expired'
  if (daysLeft <= 3) return 'expiring'
  return plan === 'trial' ? 'trial' : 'active'
}
