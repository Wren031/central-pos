import type { Subscription } from './types'

/**
 * Human-readable label for a local subscription. Prefers the plan name
 * snapshot captured at activation (so admin-defined custom plans render
 * correctly), falling back to the plan id and the seeded trial.
 */
export function planDisplayName(
  sub: Pick<Subscription, 'plan' | 'planName'> | null | undefined
): string {
  if (!sub) return 'No plan'
  if (sub.planName) return sub.planName
  if (sub.plan === 'trial') return 'Free trial'
  return sub.plan
}
