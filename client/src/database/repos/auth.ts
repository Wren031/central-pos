import { db } from '../schema'
import { refreshCacheForUser } from '../db'
import { getCache, resetCache } from '../cache'
import { hashPassword, isPbkdf2Hash, legacyEncode, verifyPassword } from '../auth-hash'
import { mockClock } from '@/lib/mock-clock'
import { latency, newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { getPosTypeCategories } from './pos-catalog'
import type { NotificationPrefs, PendingRegistration, PosTypeId, Store, Subscription, User } from '@/lib/types'

/* ---------- users & session ---------- */

/** PBKDF2-hash a password, degrading gracefully if Web Crypto is unavailable. */
async function hashPasswordSafe(password: string): Promise<string> {
  try {
    return await hashPassword(password)
  } catch {
    return legacyEncode(password)
  }
}

/**
 * Creates the local user + 30-day free trial + welcome notification + session.
 * Shared by direct registration and by finalizing a pending (link-confirmed)
 * registration, which already has a precomputed password hash.
 */
async function createLocalAccount(input: {
  fullName: string
  address: string
  contactNumber: string
  businessName: string
  email: string
  passwordHash: string
}): Promise<User> {
  const email = input.email.trim().toLowerCase()
  const now = nowIso()
  const user: User = {
    id: newId('usr'),
    fullName: input.fullName.trim(),
    address: input.address.trim(),
    contactNumber: input.contactNumber.trim(),
    businessName: input.businessName.trim(),
    email,
    passwordHash: input.passwordHash,
    notificationPrefs: { expiration: true, reminders: true, marketing: false },
    createdAt: now,
  }
  const sub: Subscription = {
    id: newId('sub'),
    userId: user.id,
    plan: 'trial',
    startedAt: now,
    expiresAt: new Date(mockClock.now().getTime() + 30 * 86400000).toISOString(),
    pricePaid: 0,
    active: true,
  }
  const notification = {
    id: newId('ntf'),
    userId: user.id,
    kind: 'welcome' as const,
    title: 'Welcome to Central POS! 🎉',
    body: 'Your 30-day free trial is now active. Choose a POS type to start selling.',
    read: false,
    createdAt: now,
  }
  const ops = [
    syncOpFor('user', user.id, 'create', undefined, { email: user.email }),
    syncOpFor('subscription', sub.id, 'create', undefined, { userId: user.id, plan: sub.plan }),
    syncOpFor('notification', notification.id, 'create'),
  ]
  await db.transaction('rw', db.users, db.subscriptions, db.notifications, db.sessions, db.syncQueue, async () => {
    await db.users.put(user)
    await db.subscriptions.put(sub)
    await db.notifications.put(notification)
    await db.sessions.put({ id: 'current', userId: user.id, loggedInAt: now })
    for (const op of ops) await putSyncOp(op)
  })
  await refreshCacheForUser(user.id)
  return user
}

export async function registerUser(input: {
  fullName: string
  address: string
  contactNumber: string
  businessName: string
  email: string
  password: string
}): Promise<User> {
  await latency()
  const email = input.email.trim().toLowerCase()
  const existing = await db.users.where('email').equals(email).first()
  if (existing) throw new Error('An account with this email already exists.')
  const passwordHash = await hashPasswordSafe(input.password)
  return createLocalAccount({ ...input, email, passwordHash })
}

/* ---------- pending (email-link) registrations ---------- */

/**
 * Stages a registration while the user confirms their email via the Supabase
 * confirmation link. The password is hashed here — no plaintext is stored.
 */
export async function stagePendingRegistration(input: {
  fullName: string
  address: string
  contactNumber: string
  businessName: string
  email: string
  password: string
}): Promise<void> {
  const email = input.email.trim().toLowerCase()
  const passwordHash = await hashPasswordSafe(input.password)
  await db.pendingRegistrations.put({
    email,
    fullName: input.fullName.trim(),
    address: input.address.trim(),
    contactNumber: input.contactNumber.trim(),
    businessName: input.businessName.trim(),
    passwordHash,
    createdAt: nowIso(),
  })
}

export async function getPendingRegistration(
  email: string
): Promise<PendingRegistration | undefined> {
  return db.pendingRegistrations.get(email.trim().toLowerCase())
}

export async function clearPendingRegistration(email: string): Promise<void> {
  await db.pendingRegistrations.delete(email.trim().toLowerCase())
}

/**
 * Finalizes a staged registration after Supabase confirms the email. Creates
 * the local account + trial (once) and signs the user in. Returns null when
 * there is no staged registration (e.g. confirmed on another device) — the
 * caller routes the user to sign in.
 */
export async function finalizePendingRegistration(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase()
  const pending = await db.pendingRegistrations.get(normalized)
  if (!pending) return null

  const existing = await db.users.where('email').equals(normalized).first()
  if (existing) {
    // Account already finalized earlier — just start a session, no duplicate.
    await db.transaction('rw', db.sessions, db.pendingRegistrations, async () => {
      await db.sessions.put({ id: 'current', userId: existing.id, loggedInAt: nowIso() })
      await db.pendingRegistrations.delete(normalized)
    })
    await refreshCacheForUser(existing.id)
    return existing
  }

  const user = await createLocalAccount({
    email: normalized,
    fullName: pending.fullName,
    address: pending.address,
    contactNumber: pending.contactNumber,
    businessName: pending.businessName,
    passwordHash: pending.passwordHash,
  })
  await clearPendingRegistration(normalized)
  return user
}

export async function login(email: string, password: string): Promise<User> {
  await latency()
  const user = await db.users.where('email').equals(email.trim().toLowerCase()).first()
  if (!user) throw new Error('Invalid email or password.')
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw new Error('Invalid email or password.')
  // Upgrade legacy reversible hash in place on successful sign-in.
  if (!isPbkdf2Hash(user.passwordHash)) {
    try {
      const upgraded = await hashPassword(password)
      await db.users.update(user.id, { passwordHash: upgraded })
      user.passwordHash = upgraded
    } catch {
      /* keep legacy hash if Web Crypto unavailable */
    }
  }
  const now = nowIso()
  await db.sessions.put({ id: 'current', userId: user.id, loggedInAt: now })
  await refreshCacheForUser(user.id)
  return user
}

export async function logout(): Promise<void> {
  await latency(80)
  await db.sessions.delete('current')
  resetCache()
}

export function getSession(): { userId: string; loggedInAt: string } | null {
  return getCache().session
}

export function getCurrentUser(): User | null {
  const cache = getCache()
  if (!cache.session) return null
  return cache.users.find((u) => u.id === cache.session!.userId) ?? null
}

/** True when a LOCAL account already exists for this email. */
export async function isEmailRegistered(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  const found = await db.users.where('email').equals(normalized).first()
  return Boolean(found)
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<User, 'fullName' | 'address' | 'contactNumber' | 'businessName' | 'notificationPrefs'>>
): Promise<User> {
  await latency()
  const user = await db.users.get(userId)
  if (!user) throw new Error('User not found.')
  const updated: User = { ...user, ...patch }
  const store = await db.stores.where('userId').equals(userId).first()
  await db.transaction('rw', db.users, db.stores, db.syncQueue, async () => {
    await db.users.put(updated)
    if (store && patch.businessName) {
      await db.stores.update(store.id, { name: patch.businessName })
    }
    await putSyncOp(syncOpFor('user', userId, 'update', store?.id, { fields: Object.keys(patch) }))
  })
  await refreshCacheForUser(userId)
  return updated
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  await latency()
  const user = await db.users.get(userId)
  if (!user) throw new Error('User not found.')
  const ok = await verifyPassword(current, user.passwordHash)
  if (!ok) throw new Error('Current password is incorrect.')
  let hash: string
  try {
    hash = await hashPassword(next)
  } catch {
    hash = legacyEncode(next)
  }
  await db.users.update(userId, { passwordHash: hash })
  await refreshCacheForUser(userId)
}

export async function deleteAccount(userId: string): Promise<void> {
  await latency()
  const stores = await db.stores.where('userId').equals(userId).toArray()
  const storeIds = stores.map((s) => s.id)
  await db.transaction(
    'rw',
    [
      db.users,
      db.stores,
      db.subscriptions,
      db.products,
      db.orders,
      db.orderItems,
      db.transactions,
      db.notifications,
      db.sessions,
      db.customers,
      db.categories,
      db.stockMovements,
      db.syncQueue,
    ],
    async () => {
      await db.users.delete(userId)
      await db.stores.bulkDelete(storeIds)
      await db.subscriptions.where('userId').equals(userId).delete()
      if (storeIds.length) {
        await db.products.where('storeId').anyOf(storeIds).delete()
        await db.orders.where('storeId').anyOf(storeIds).delete()
        await db.customers.where('storeId').anyOf(storeIds).delete()
        await db.categories.where('storeId').anyOf(storeIds).delete()
        await db.stockMovements.where('storeId').anyOf(storeIds).delete()
        await db.orderItems.where('storeId').anyOf(storeIds).delete()
      }
      await db.transactions.where('userId').equals(userId).delete()
      await db.notifications.where('userId').equals(userId).delete()
      await db.sessions.delete('current')
      await putSyncOp(syncOpFor('user', userId, 'delete'))
    }
  )
  resetCache()
}

/* ---------- store & POS setup ---------- */

export function getStoreByUser(userId: string): Store | null {
  return getCache().stores.find((s) => s.userId === userId) ?? null
}

/**
 * Creates (or switches) the user's store. New registrations always start
 * with an EMPTY catalog — no generated products, categories, or stock.
 * Orders and reports are preserved on POS switch.
 */
export async function setupStore(userId: string, posType: PosTypeId): Promise<Store> {
  await latency(500)
  const user = await db.users.get(userId)
  if (!user) throw new Error('User not found.')
  const existing = await db.stores.where('userId').equals(userId).first()
  let store: Store
  const now = nowIso()
  if (!existing) {
    store = {
      id: newId('str'),
      userId,
      name: user.businessName,
      posType,
      createdAt: now,
      onboarded: true,
    }
  } else {
    store = { ...existing, posType, onboarded: true }
  }
  const oldProducts = existing
    ? await db.products.where('storeId').equals(existing.id).toArray()
    : []
  // Categories come from the POS type's Supabase assignment (pos_type_categories).
  const assignedCategories = getPosTypeCategories(posType).map((c) => ({
    id: c.categoryId,
    storeId: store.id,
    name: c.name,
    createdAt: now,
  }))
  await db.transaction(
    'rw',
    [db.stores, db.products, db.categories, db.stockMovements, db.syncQueue],
    async () => {
      await db.stores.put(store)
      // Load the POS type's category configuration into the workspace.
      await db.categories.where('storeId').equals(store.id).delete()
      if (assignedCategories.length > 0) {
        await db.categories.bulkPut(assignedCategories)
      }
      if (existing) {
        // POS layout changed — clear the old catalog so items match the new type.
        await db.products.bulkDelete(oldProducts.map((p) => p.id))
        await db.stockMovements.where('storeId').equals(store.id).delete()
      }
      await putSyncOp(syncOpFor('store', store.id, existing ? 'update' : 'create', store.id, { posType }))
    }
  )
  await refreshCacheForUser(userId)
  return store
}

export async function changePosType(userId: string, posType: PosTypeId): Promise<Store> {
  return setupStore(userId, posType)
}

export type { NotificationPrefs, Subscription }
