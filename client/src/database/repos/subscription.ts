import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { latency, newId, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { mockClock } from '@/lib/mock-clock'
import { PLAN_DAYS, PLAN_LABELS, PLAN_PRICES } from '@/lib/plan-constants'
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

/** MOCK payment — always treated as a simulated, unverified local transaction. */
export async function purchasePlan(userId: string, plan: Exclude<PlanId, 'trial'>): Promise<Subscription> {
  await latency(1200)
  const existing = await db.subscriptions.where('userId').equals(userId).first()
  const now = mockClock.now()
  const days = PLAN_DAYS[plan]
  const price = PLAN_PRICES[plan]
  const currentExpiry = existing ? new Date(existing.expiresAt).getTime() : 0
  const base = Math.max(currentExpiry, now.getTime())
  const sub: Subscription = {
    id: existing?.id ?? newId('sub'),
    userId,
    plan,
    startedAt: now.toISOString(),
    expiresAt: new Date(base + days * 86400000).toISOString(),
    pricePaid: price,
    active: true,
  }
  const txn: Transaction = {
    id: newId('txn'),
    userId,
    type: 'subscription',
    reference: PLAN_LABELS[plan].toUpperCase(),
    description: `${PLAN_LABELS[plan]} subscription — ${days} days (simulated payment)`,
    amount: price,
    status: 'success',
    createdAt: now.toISOString(),
  }
  const notification = {
    id: newId('ntf'),
    userId,
    kind: 'renewed' as const,
    title: `${PLAN_LABELS[plan]} plan activated`,
    body: `Your subscription is active until ${new Date(sub.expiresAt).toLocaleDateString('en-PH')}.`,
    read: false,
    createdAt: now.toISOString(),
  }
  await db.transaction('rw', db.subscriptions, db.transactions, db.notifications, db.syncQueue, async () => {
    await db.subscriptions.put(sub)
    await db.transactions.put(txn)
    await db.notifications.put(notification)
    await putSyncOp(syncOpFor('subscription', sub.id, 'update', undefined, { plan }))
  })
  patchCache({
    subscriptions: [sub, ...getCache().subscriptions.filter((s) => s.userId !== userId)],
    transactions: [txn, ...getCache().transactions],
    notifications: [notification, ...getCache().notifications],
  })
  notifySyncQueueChanged()
  return sub
}

export function getTransactions(userId: string): Transaction[] {
  return getCache().transactions.filter((t) => t.userId === userId)
}
