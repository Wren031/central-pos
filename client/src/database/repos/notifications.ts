import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { mockClock } from '@/lib/mock-clock'
import { computeSubState } from './subscription'
import type { AppNotification, User } from '@/lib/types'

export function getNotifications(userId: string): AppNotification[] {
  return getCache()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const unread = getCache().notifications.filter((n) => n.userId === userId && !n.read)
  if (unread.length === 0) return
  await db.transaction('rw', db.notifications, async () => {
    for (const n of unread) {
      await db.notifications.update(n.id, { read: true })
    }
  })
  patchCache({
    notifications: getCache().notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)),
  })
  notifySyncQueueChanged()
}

/** Keeps trial/expiry notifications in sync — 24h dedupe per kind, respects prefs. */
export async function syncSubscriptionNotifications(userId: string): Promise<void> {
  const sub = await db.subscriptions.where('userId').equals(userId).first()
  if (!sub) return
  const user = await db.users.get(userId)
  const state = computeSubState(sub)
  const nowMs = mockClock.now().getTime()
  const existing = await db.notifications.where('userId').equals(userId).toArray()
  const recent = (kind: AppNotification['kind']) =>
    existing.some(
      (n) => n.kind === kind && nowMs - new Date(n.createdAt).getTime() < 24 * 3600000
    )
  const now = nowIso()
  const created: AppNotification[] = []
  if (state.status === 'expired' && user?.notificationPrefs.expiration !== false && !recent('expired')) {
    created.push({
      id: newId('ntf'),
      userId,
      kind: 'expired',
      title: 'Subscription expired',
      body: 'Selling and checkout are locked. Renew a plan to continue processing sales. Your data is safe.',
      read: false,
      createdAt: now,
    })
  } else if (
    state.canSell &&
    state.daysLeft <= 3 &&
    state.daysLeft > 0 &&
    user?.notificationPrefs.reminders !== false &&
    !recent('expiring')
  ) {
    created.push({
      id: newId('ntf'),
      userId,
      kind: 'expiring',
      title: `Subscription expires in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}`,
      body: 'Renew now to keep your POS running without interruption.',
      read: false,
      createdAt: now,
    })
  }
  if (created.length === 0) return
  await db.transaction('rw', db.notifications, db.syncQueue, async () => {
    for (const n of created) {
      await db.notifications.put(n)
      await putSyncOp(syncOpFor('notification', n.id, 'create', undefined))
    }
  })
  patchCache({ notifications: [...created, ...getCache().notifications] })
  notifySyncQueueChanged()
}

export type { User }
