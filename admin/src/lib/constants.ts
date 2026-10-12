import {
  Coffee,
  Cross,
  Flame,
  Leaf,
  Pill,
  ShoppingBag,
  ShoppingBasket,
  Store,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type {
  PaymentMethod,
  PaymentStatus,
  ProfileStatus,
  SubscriptionStatus,
} from './types'

/* ---------- POS types ---------- */

export const POS_TYPE_ICONS: Record<string, LucideIcon> = {
  bbq: Flame,
  retail: ShoppingBag,
  grocery: ShoppingBasket,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  pharmacy: Cross,
  general: Store,
  herbal: Leaf,
  medical: Pill,
  services: Wrench,
}

export const POS_TYPE_ICON_NAMES = Object.keys(POS_TYPE_ICONS)

export function posTypeIcon(name: string | null | undefined): LucideIcon {
  return POS_TYPE_ICONS[name ?? ''] ?? Store
}

export const POS_TYPE_CATEGORIES = [
  'food_beverage',
  'retail',
  'health',
  'services',
  'other',
] as const

export type PosTypeCategory = (typeof POS_TYPE_CATEGORIES)[number]

export const POS_TYPE_CATEGORY_LABELS: Record<string, string> = {
  food_beverage: 'Food & Beverage',
  retail: 'Retail',
  health: 'Health & Pharmacy',
  services: 'Services',
  other: 'Other',
}

export function posTypeCategoryLabel(id: string | null | undefined): string {
  if (!id) return 'Uncategorized'
  return POS_TYPE_CATEGORY_LABELS[id] ?? id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/* ---------- Plans ---------- */

export const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export function planLabel(id: string | null | undefined): string {
  if (!id) return '—'
  return PLAN_LABELS[id] ?? id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/* ---------- Badges (tailwind tone classes for status pills) ---------- */

export const SUB_STATUS_BADGE: Record<SubscriptionStatus, string> = {
  trial: 'border-sky-200 bg-sky-50 text-sky-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expired: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-zinc-200 bg-zinc-100 text-zinc-600',
}

export const PROFILE_STATUS_BADGE: Record<ProfileStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  suspended: 'border-red-200 bg-red-50 text-red-700',
}

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  refunded: 'border-zinc-200 bg-zinc-100 text-zinc-600',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mock_card: 'Mock Card',
  mock_gcash: 'GCash (mock)',
  mock_bank: 'Bank (mock)',
  cash: 'Cash',
}

/* ---------- Activity log vocabulary ---------- */

export const LOG_ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Users', actions: ['user.register', 'user.create', 'user.suspend', 'user.activate', 'user.status_changed', 'user.role_changed', 'admin.promote'] },
  { label: 'Subscriptions', actions: ['subscription.create', 'subscription.updated', 'subscription.extend', 'subscription.change_plan', 'subscription.cancel', 'subscription.delete'] },
  { label: 'Payments', actions: ['payment.record', 'payment.recorded', 'payment.status_changed', 'payment.delete'] },
  { label: 'Stores', actions: ['store.create', 'store.status_changed', 'store.delete'] },
  { label: 'Catalog', actions: ['pos_type.create', 'pos_type.update', 'pos_type.delete', 'plan.create', 'plan.update', 'plan.delete'] },
  { label: 'System', actions: ['setting.create', 'setting.update', 'system.setup', 'system.seed'] },
]

export const ENTITY_LABELS: Record<string, string> = {
  profile: 'User',
  store: 'Store',
  subscription: 'Subscription',
  payment: 'Payment',
  pos_type: 'POS Type',
  subscription_plan: 'Plan',
  system_setting: 'Setting',
  system: 'System',
}

/* ---------- Pagination ---------- */

export const PAGE_SIZE_OPTIONS = [10, 20, 50]
export const DEFAULT_PAGE_SIZE = 20
