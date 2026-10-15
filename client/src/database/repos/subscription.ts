import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { newId, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { mockClock } from '@/lib/mock-clock'
import type { PlanId, SubState, Subscription, Transaction } from '@/lib/types'

export function getSubscription(userId: string): Subscription | null {
  return getCache().subscriptions.find((s) => s.userId === userId) ?? null
}

export function computeSubState(sub: Subscription | null): SubState {
  if (!sub) {
    return { status: 'expired', daysLeft: 0, hoursLeft: 0, expiresAt: null, plan: null, canSell: false }
  }
  const now = mockClock.now().getTime()
  const expires = new Date(sub.expiresAt).getTime()
  const msLeft = expires - now
  if (msLeft <= 0) {
    return {
      status: 'expired',
      daysLeft: 0,
      hoursLeft: 0,
      expiresAt: sub.expiresAt,
      plan: sub.plan,
      canSell: false,
    }
  }
  const daysLeft = Math.floor(msLeft / 86400000)
  const hoursLeft = Math.floor(msLeft / 3600000)
  return {
    status: sub.plan === 'trial' ? 'trial' : 'active',
    daysLeft,
    hoursLeft,
    expiresAt: sub.expiresAt,
    plan: sub.plan,
    canSell: true,
  }
}

export function getSubState(userId: string): SubState {
  return computeSubState(getSubscription(userId))
}

export interface ActivatePlanInput {
  userId: string
  planId: PlanId
  planName: string
  durationDays: number
  /** Server-authoritative expiry from the approved payment. */
  expiresAt: string
  amount: number
  reference: string
}

/**
 * Mirrors an ADMIN-APPROVED payment into the local subscription model. This is
 * the ONLY path that activates or extends a paid plan locally, and it is called
 * after Supabase confirms the approval — never from a customer action.
 *
 * The local expiry is taken from the server so it can never be forged by a
 * device clock; existing paid time is preserved if the local record is ahead.
 */
export async function activatePlanFromServer(input: ActivatePlanInput): Promise<Subscription> {
  const existing = await db.subscriptions.where('userId').equals(input.userId).first()
  const now = mockClock.now()
  const serverExpiry = new Date(input.expiresAt).getTime()
  const localExpiry = existing ? new Date(existing.expiresAt).getTime() : 0
  const expiry = Math.max(serverExpiry, localExpiry, now.getTime())

  const sub: Subscription = {
    id: existing?.id ?? newId('sub'),
    userId: input.userId,
    plan: input.planId,
    planName: input.planName,
    durationDays: input.durationDays,
    startedAt: now.toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    pricePaid: input.amount,
    active: true,
  }
  const txn: Transaction = {
    id: newId('txn'),
    userId: input.userId,
    type: 'subscription',
    reference: input.reference,
    description: `${input.planName} subscription — ${input.durationDays} days`,
    amount: input.amount,
    status: 'success',
    createdAt: now.toISOString(),
  }

  await db.transaction('rw', db.subscriptions, db.transactions, db.syncQueue, async () => {
    await db.subscriptions.put(sub)
    await db.transactions.put(txn)
    await putSyncOp(syncOpFor('subscription', sub.id, 'update', undefined, { plan: input.planId }))
  })
  patchCache({
    subscriptions: [sub, ...getCache().subscriptions.filter((s) => s.userId !== input.userId)],
    transactions: [txn, ...getCache().transactions],
  })
  notifySyncQueueChanged()
  return sub
}

export function getTransactions(userId: string): Transaction[] {
  return getCache().transactions.filter((t) => t.userId === userId)
}
