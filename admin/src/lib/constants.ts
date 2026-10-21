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
  PaymentRequestStatus,
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
  trial: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  expired: 'border-red-500/30 bg-red-500/10 text-red-300',
  cancelled: 'border-white/10 bg-white/5 text-muted-foreground',
}

export const PROFILE_STATUS_BADGE: Record<ProfileStatus, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
}

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  succeeded: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  failed: 'border-red-500/30 bg-red-500/10 text-red-300',
  refunded: 'border-white/10 bg-white/5 text-muted-foreground',
}

export const PAYMENT_REQUEST_STATUS_BADGE: Record<PaymentRequestStatus, string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-300',
}

/* ---------- Activity log vocabulary ---------- */

export const LOG_ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Users', actions: ['user.register', 'user.create', 'user.suspend', 'user.activate', 'user.status_changed', 'user.role_changed', 'admin.promote'] },
  { label: 'Subscriptions', actions: ['subscription.create', 'subscription.updated', 'subscription.extend', 'subscription.change_plan', 'subscription.cancel', 'subscription.delete'] },
  { label: 'Payments', actions: ['payment.record', 'payment.recorded', 'payment.status_changed', 'payment.delete', 'payment_request.create', 'payment_request.link', 'payment_request.approve', 'payment_request.reject', 'payment_request.delete'] },
  { label: 'Stores', actions: ['store.create', 'store.status_changed', 'store.delete'] },
  { label: 'Catalog', actions: ['pos_type.create', 'pos_type.update', 'pos_type.delete', 'plan.create', 'plan.update', 'plan.delete', 'category.create', 'category.update', 'category.delete', 'category.assign', 'category.unassign', 'category.reorder'] },
  { label: 'System', actions: ['setting.create', 'setting.update', 'system.setup', 'system.seed', 'release.create', 'release.update', 'release.status_changed', 'release.delete'] },
]

export const ENTITY_LABELS: Record<string, string> = {
  profile: 'User',
  store: 'Store',
  subscription: 'Subscription',
  payment: 'Payment',
  payment_request: 'Payment Request',
  pos_type: 'POS Type',
  category: 'Category',
  subscription_plan: 'Plan',
  system_setting: 'Setting',
  system: 'System',
  pos_release: 'Release',
}

/* ---------- Pagination ---------- */

export const PAGE_SIZE_OPTIONS = [10, 20, 50]
export const DEFAULT_PAGE_SIZE = 20
