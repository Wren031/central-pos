import { cn } from '@/lib/utils'
import {
  PAYMENT_REQUEST_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
  PROFILE_STATUS_BADGE,
  SUB_STATUS_BADGE,
  planLabel,
} from '@/lib/constants'
import type {
  PaymentRequestStatus,
  PaymentStatus,
  ProfileStatus,
  SubscriptionStatus,
} from '@/lib/types'

const PILL =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none'

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span className={cn(PILL, SUB_STATUS_BADGE[status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-600')}>
      {status}
    </span>
  )
}

export function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  return (
    <span className={cn(PILL, PROFILE_STATUS_BADGE[status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-600')}>
      {status}
    </span>
  )
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={cn(PILL, PAYMENT_STATUS_BADGE[status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-600')}>
      {status}
    </span>
  )
}

export function PaymentRequestStatusBadge({ status }: { status: PaymentRequestStatus }) {
  return (
    <span
      className={cn(
        PILL,
        PAYMENT_REQUEST_STATUS_BADGE[status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-600'
      )}
    >
      {status}
    </span>
  )
}

export function PlanBadge({ planId }: { planId: string | null | undefined }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium leading-none text-zinc-700">
      {planLabel(planId)}
    </span>
  )
}

export function PosTypeBadge({ name }: { name: string | null | undefined }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium leading-none text-zinc-600">
      {name ?? '—'}
    </span>
  )
}
