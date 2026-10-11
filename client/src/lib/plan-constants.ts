import type { PlanId } from './types'

export const PLAN_DAYS: Record<Exclude<PlanId, 'trial'>, number> = {
  weekly: 7,
  monthly: 30,
  yearly: 365,
}

export const PLAN_PRICES: Record<Exclude<PlanId, 'trial'>, number> = {
  weekly: 99,
  monthly: 299,
  yearly: 2999,
}

export const PLAN_LABELS: Record<PlanId, string> = {
  trial: 'Free Trial',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}
