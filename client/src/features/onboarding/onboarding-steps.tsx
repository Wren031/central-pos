import { ArrowLeft, Check, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PosPreview } from '@/components/common/pos-preview'
import { peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PosTypeDef } from '@/lib/pos-types'
import type { PlanRecord } from '@/lib/types'

/**
 * Post-verification onboarding steps: pick the POS workspace, then the plan
 * duration. Uses the admin-managed pos_types + subscription_plans catalogues.
 */

export function PosTypeStep({
  types,
  loading,
  error,
  selected,
  onSelect,
  onRetry,
  onContinue,
  onBack,
  lockedId = null,
}: {
  types: PosTypeDef[]
  loading: boolean
  error: string | null
  selected: string | null
  onSelect: (id: string) => void
  onRetry: () => void
  onContinue: () => void
  onBack?: () => void
  /**
   * An account's POS type is assigned once. When set, it is the only selectable
   * option — the user must not be able to switch workspaces here.
   */
  lockedId?: string | null
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Step 1 of 2 · Choose your POS
        </p>
        <h2 className="text-lg font-semibold tracking-tight">Choose your POS workspace</h2>
        <p className="text-sm text-muted-foreground">
          Pick the workspace that fits your trade. Your catalog starts empty.
        </p>
      </div>

      {lockedId && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          This account is already assigned to <strong>{lockedId}</strong>. The POS type is fixed and
          cannot be changed here — contact an administrator if it needs to change.
        </div>
      )}

      {error ? (
        <Card className="gap-3 p-6 text-center shadow-none">
          <div className="flex flex-col items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <RefreshCw className="size-6" aria-hidden />
            </span>
            <div>
              <p className="font-medium">Couldn’t load POS types</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
            <Button type="button" onClick={onRetry} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Retry
            </Button>
          </div>
        </Card>
      ) : loading && types.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 py-12 text-center">
          <p className="font-medium">No POS types available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            An administrator hasn’t published any POS types yet. Please check back later.
          </p>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="POS type"
          className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          {types.map((type) => {
            const isSelected = selected === type.id
            const isLockedOut = Boolean(lockedId) && type.id !== lockedId
            return (
              <Card
                key={type.id}
                role="radio"
                aria-checked={isSelected}
                aria-disabled={isLockedOut}
                tabIndex={isLockedOut ? -1 : 0}
                onClick={() => {
                  if (!isLockedOut) onSelect(type.id)
                }}
                onKeyDown={(e) => {
                  if (isLockedOut) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(type.id)
                  }
                }}
                className={cn(
                  'relative cursor-pointer gap-2.5 p-3 shadow-none transition-all hover:border-foreground/25 hover:shadow-sm',
                  isSelected && 'border-2 shadow-md ring-1 ring-foreground/10',
                  isLockedOut && 'cursor-not-allowed opacity-40 hover:border-border hover:shadow-none'
                )}
                style={isSelected ? { borderColor: type.theme.accent } : undefined}
              >
                {isSelected && (
                  <span
                    className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: type.theme.accent }}
                    aria-hidden
                  >
                    <Check className="size-3" />
                  </span>
                )}
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: type.theme.accent }}
                  >
                    <type.icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{type.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{type.tagline}</p>
                  </div>
                </div>
                <PosPreview posType={type.id} />
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} disabled={loading}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}
        <Button type="button" className="flex-1" disabled={!selected} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}

/** Step 2 — choose the plan / duration the workspace starts on. */
export function PlanDurationStep({
  plans,
  loading,
  error,
  selected,
  onSelect,
  onContinue,
  onBack,
  submitting,
  offline,
  submitLabel = 'Create account',
}: {
  plans: PlanRecord[]
  loading: boolean
  error: string | null
  selected: string | null
  onSelect: (id: string) => void
  onContinue: () => void
  onBack?: () => void
  submitting: boolean
  offline: boolean
  submitLabel?: string
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Step 2 of 2 · Choose your plan duration
        </p>
        <h2 className="text-lg font-semibold tracking-tight">Choose your plan duration</h2>
        <p className="text-sm text-muted-foreground">
          Pick how long your access runs for. You can change or renew anytime from Subscription.
        </p>
      </div>

      {error && plans.length === 0 ? (
        <Card className="gap-2 p-5 text-center shadow-none">
          <p className="font-medium">Couldn’t load plans</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      ) : loading && plans.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 py-12 text-center">
          <p className="font-medium">No plans available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            An administrator hasn’t published any plans yet. Please check back later.
          </p>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Plan duration"
          className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2"
        >
          {plans.map((plan) => {
            const isSelected = selected === plan.id
            return (
              <Card
                key={plan.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => onSelect(plan.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(plan.id)
                  }
                }}
                className={cn(
                  'relative cursor-pointer gap-2 p-4 shadow-none transition-all hover:border-foreground/25 hover:shadow-sm',
                  isSelected && 'border-2 border-foreground/40 shadow-md ring-1 ring-foreground/10'
                )}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="size-3" />
                  </span>
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{plan.name}</p>
                  <span className="text-lg font-semibold tracking-tight">
                    {plan.price > 0 ? peso(plan.price).replace('.00', '') : 'Free'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {plan.durationDays} days of access
                  {plan.description ? ` · ${plan.description}` : ''}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      {offline && (
        <p className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
          You are offline. Reconnect to finish setting up your workspace.
        </p>
      )}

      <div className="flex items-center gap-2">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}
        <Button
          type="button"
          className="flex-1"
          disabled={!selected || submitting || offline}
          onClick={onContinue}
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Setting up…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
