import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubscription } from '@/state/subscription-context'

export function ExpiredBanner({ compact = false }: { compact?: boolean }) {
  const { state } = useSubscription()
  if (state.canSell) return null
  return (
    <div
      className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-center gap-2 text-sm">
        <Lock className="size-4 shrink-0 text-amber-600" aria-hidden />
        <span>
          <strong className="font-semibold">Subscription expired.</strong> Selling and checkout are locked.
          {compact ? ' Renew to continue.' : ' Your products, orders, and reports are preserved — renew to resume selling.'}
        </span>
      </div>
      <Button asChild size="sm" className="w-fit shrink-0 bg-amber-600 text-white hover:bg-amber-700">
        <Link to="/subscription">Renew plan</Link>
      </Button>
    </div>
  )
}
