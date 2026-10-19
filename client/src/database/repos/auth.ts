import { db } from '../schema'
import { refreshCacheForUser } from '../db'
import { getCache, patchCache, resetCache } from '../cache'
import { hashPassword, isPbkdf2Hash, legacyEncode, verifyPassword } from '../auth-hash'
import { mockClock } from '@/lib/mock-clock'
import { latency, newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { getPosTypeCategories } from './pos-catalog'
import { isOnline } from '@/offline/connectivity'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { clearSuspendedMarker } from '@/lib/account-status'
import { markAccountDeleted } from '@/lib/deleted-accounts'
import { clearEphemeralSession, markEphemeralSession } from '@/lib/login-persistence'
import type {
  NotificationPrefs,
  PendingRegistration,
  PosTypeId,
  Store,
  Subscription,
  User,
} from '@/lib/types'

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
 * Creates the local user + a 30-day trial subscription + welcome notification +
 * session. Shared by direct registration and by finalizing a pending
 * (link-confirmed) registration, which already has a precomputed password hash.
 * The plan duration is chosen next, on /onboarding.
 */
async function createLocalAccount(
  input: {
    fullName: string
    address: string
    contactNumber: string
    businessName: string
    email: string
    passwordHash: string
  },
  /**
   * Optional subscription to mirror instead of the default 30-day trial. Used
   * when an existing account is recovered on a new device: the cloud's plan and
   * expiry must win so the device never grants a fresh trial by accident.
   */
  subscription?: {
    plan: string
    planName?: string
    durationDays?: number
    startedAt: string
    expiresAt: string
    pricePaid: number
  }
): Promise<User> {
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
  const sub: Subscription = subscription
    ? {
        id: newId('sub'),
        userId: user.id,
        plan: subscription.plan,
        planName: subscription.planName,
        durationDays: subscription.durationDays,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
        pricePaid: subscription.pricePaid,
        active: true,
      }
    : {
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
    title: 'Welcome to UniPOS! 🎉',
    body: 'Finish setup to choose your workspace and plan.',
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

/**
 * Recreates the LOCAL identity of an account that already exists in Supabase
 * (verified email, no local record on this device). Unlike registerUser this
 * creates NO store and NO forced trial when the server reports a subscription —
 * the caller decides whether/how to restore the workspace.
 */
export async function createLocalAccountFromCloud(input: {
  fullName: string
  address: string
  contactNumber: string
  businessName: string
  email: string
  password: string
  subscription?: {
    plan: string
    planName?: string
    durationDays?: number
    startedAt: string
    expiresAt: string
    pricePaid: number
  }
}): Promise<User> {
  const passwordHash = await hashPasswordSafe(input.password)
  return createLocalAccount({ ...input, passwordHash }, input.subscription)
}

/* ---------- pending (email-link) registrations ---------- */

/**
 * Stages a registration while the user confirms their email via the Supabase
 * confirmation link. The password is hashed here — no plaintext is stored. The
 * POS type and plan duration are chosen later, on /onboarding.
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
 * Finalizes a staged registration after Supabase confirms the email. Creates the
 * local account (with a default trial) and signs the user in. The POS type and
 * plan duration are chosen next, on the /onboarding wizard. Returns null when
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

export async function login(
  email: string,
  password: string,
  rememberMe = true
): Promise<User> {
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
  await db.sessions.put({ id: 'current', userId: user.id, loggedInAt: now, rememberMe })
  // "Remember me" OFF → only survive within this browser session.
  if (rememberMe) clearEphemeralSession()
  else markEphemeralSession()
  // Heal any legacy duplicate workspaces before hydrating the read model.
  await normalizeLocalStores(user.id)
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

/**
 * Persist the authoritative account status verified against Supabase
 * (`profiles.status`). Caching it on the local user record is what lets a
 * suspension survive a page refresh, an app restart, and going offline — so a
 * suspended account cannot regain access by disconnecting.
 */
export async function markUserAccountStatus(
  userId: string,
  status: 'active' | 'suspended',
  checkedAt: string
): Promise<void> {
  const user = await db.users.get(userId)
  if (!user) return
  await db.users.update(userId, { accountStatus: status, accountStatusCheckedAt: checkedAt })
  patchCache({
    users: getCache().users.map((u) =>
      u.id === userId ? { ...u, accountStatus: status, accountStatusCheckedAt: checkedAt } : u
    ),
  })
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

/* ---------- account deletion ---------- */

/**
 * Permanently delete the account's Supabase Auth user (and, via FK cascade, its
 * profile/store/subscription rows). Ownership is proven by re-authenticating
 * with the password, which yields a genuine short-lived session so the
 * `delete_my_account()` RPC can run with `auth.uid()`.
 *
 * Throws on any real failure so the caller does NOT wipe local data (which would
 * leave the cloud account alive and the heal path able to resurrect it). A
 * purely local account (never registered in Supabase Auth) is not an error —
 * there is simply nothing to delete remotely.
 */
async function deleteRemoteAccount(email: string, password: string): Promise<void> {
  if (!supabaseConfigured) return

  const normalized = email.trim().toLowerCase()

  let signIn
  try {
    signIn = await supabase.auth.signInWithPassword({ email: normalized, password })
  } catch {
    throw new Error('Could not reach the server to delete your account. Check your connection and try again.')
  }

  if (signIn.error) {
    const code = (signIn.error.code ?? '').toLowerCase()
    const message = (signIn.error.message ?? '').toLowerCase()
    const invalidCredentials =
      code === 'invalid_credentials' ||
      message.includes('invalid login credentials') ||
      message.includes('invalid credentials')
    // No matching cloud user → purely local account; nothing to delete remotely.
    if (invalidCredentials) return
    // Network/config/other: refuse so the cloud account is never orphaned.
    throw new Error('Could not verify your account with the server. Check your connection and try again.')
  }

  try {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      throw new Error(
        error.message?.trim() ||
          'The server could not delete your account. Please try again or contact support.'
      )
    }
  } finally {
    await supabase.auth.signOut().catch(() => {})
  }
}

export async function deleteAccount(userId: string, password: string): Promise<void> {
  await latency()
  const user = await db.users.get(userId)
  if (!user) throw new Error('Account not found.')
  if (user.id !== userId) throw new Error('Account not found.')

  // Prove ownership locally before doing anything irreversible.
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) throw new Error('Incorrect password.')

  // Deletion must be verified against Supabase so the cloud account is really
  // gone — otherwise the client's "heal" fallback can silently re-create it.
  // We block while offline rather than half-delete and risk resurrection.
  if (!isOnline()) {
    throw new Error("You're offline. Connect to the internet to delete your account.")
  }

  await deleteRemoteAccount(user.email, password)

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
      db.pendingRegistrations,
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
      await db.pendingRegistrations.delete(user.email.trim().toLowerCase())
      await db.sessions.delete('current')
      // Drop any queued sync ops for this account so it is not pushed back.
      await db.syncQueue.where('entityId').equals(userId).delete()
    }
  )

  // Record a local tombstone and clear the suspension block so the heal path can
  // never restore this account on this device.
  markAccountDeleted(user.email)
  clearSuspendedMarker()
  resetCache()
}

/* ---------- store & POS setup ---------- */

export function getStoreByUser(userId: string): Store | null {
  const stores = getCache().stores.filter((s) => s.userId === userId)
  if (stores.length === 0) return null
  // Deterministic when (legacy) duplicates exist: prefer a completed
  // workspace, then the oldest row. A fresh array is sorted so the cache is
  // never mutated.
  return [...stores].sort((a, b) => {
    if (a.onboarded !== b.onboarded) return a.onboarded ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })[0]
}

/**
 * Count the business rows attached to a store. Used to decide which legacy
 * duplicate is the "real" workspace — never delete a store that holds data.
 */
async function storeDataCount(storeId: string): Promise<number> {
  const [products, orders, customers, movements] = await Promise.all([
    db.products.where('storeId').equals(storeId).count(),
    db.orders.where('storeId').equals(storeId).count(),
    db.customers.where('storeId').equals(storeId).count(),
    db.stockMovements.where('storeId').equals(storeId).count(),
  ])
  return products + orders + customers + movements
}

/**
 * Repairs legacy duplicate workspaces. A user must own exactly one store;
 * duplicates were previously created by racing setup calls. Only EMPTY
 * duplicates are removed — a store with products/orders/customers/stock is
 * always kept so no business data can be lost.
 */
async function normalizeLocalStores(userId: string): Promise<void> {
  const stores = await db.stores.where('userId').equals(userId).toArray()
  if (stores.length <= 1) return

  const scored: { store: Store; data: number }[] = []
  for (const store of stores) {
    scored.push({ store, data: await storeDataCount(store.id) })
  }
  scored.sort((a, b) => {
    if (a.data !== b.data) return b.data - a.data
    if (a.store.onboarded !== b.store.onboarded) return a.store.onboarded ? -1 : 1
    return a.store.createdAt.localeCompare(b.store.createdAt)
  })

  const removable = scored.filter((row) => row.data === 0).map((row) => row.store.id)
  if (removable.length === 0) return
  await db.transaction('rw', db.stores, async () => {
    await db.stores.bulkDelete(removable)
  })
}

/**
 * Creates (or completes) the user's ONE store. New registrations always start
 * with an EMPTY catalog — no generated products, categories, or stock.
 *
 * Idempotent and race-safe: the lookup + write happen in one Dexie transaction,
 * so double-clicks, refreshes, or two tabs cannot create duplicate workspaces.
 * Re-running with the SAME POS type never wipes an existing catalog; a different
 * type is refused (the workspace type is immutable in the client).
 */
export async function setupStore(userId: string, posType: PosTypeId): Promise<Store> {
  await latency(500)

  const store = await db.transaction(
    'rw',
    [db.users, db.stores, db.categories, db.syncQueue],
    async () => {
      const user = await db.users.get(userId)
      if (!user) throw new Error('User not found.')

      const existing = await db.stores.where('userId').equals(userId).first()
      // The workspace type is assigned once. Re-running setup with a different
      // type would silently change the account's POS and wipe its catalog.
      if (existing && existing.posType !== posType) {
        throw new Error(
          'This account already has a POS type. It cannot be changed here — contact an administrator.'
        )
      }

      const now = nowIso()

      if (existing) {
        // Complete an interrupted onboarding without touching existing data.
        const updated: Store = {
          ...existing,
          name: existing.name?.trim() || user.businessName,
          posType,
          onboarded: true,
        }
        await db.stores.put(updated)
        await ensureStoreCategories(updated, now)
        if (!existing.onboarded) {
          await putSyncOp(syncOpFor('store', updated.id, 'update', updated.id, { posType }))
        }
        return updated
      }

      const created: Store = {
        id: newId('str'),
        userId,
        name: user.businessName,
        posType,
        createdAt: now,
        onboarded: true,
      }
      await db.stores.put(created)
      await ensureStoreCategories(created, now)
      await putSyncOp(syncOpFor('store', created.id, 'create', created.id, { posType }))
      return created
    }
  )

  await refreshCacheForUser(userId)
  return store
}

/**
 * Load the POS type's category configuration only when the workspace has none.
 * Never deletes existing categories (they may have been edited locally).
 */
async function ensureStoreCategories(store: Store, now: string): Promise<void> {
  const count = await db.categories.where('storeId').equals(store.id).count()
  if (count > 0) return
  const assigned = getPosTypeCategories(store.posType).map((c) => ({
    id: c.categoryId,
    storeId: store.id,
    name: c.name,
    createdAt: now,
  }))
  if (assigned.length > 0) await db.categories.bulkPut(assigned)
}

export async function changePosType(userId: string, posType: PosTypeId): Promise<Store> {
  // Guarded by setupStore: changing an existing workspace's POS type is refused.
  return setupStore(userId, posType)
}

/** True when this account already has a local workspace (store) on this device. */
export async function hasLocalStore(userId: string): Promise<boolean> {
  const store = await db.stores.where('userId').equals(userId).first()
  return Boolean(store)
}

/**
 * Restore the LOCAL workspace from the account's cloud configuration. Used when
 * an existing account signs in on a device with no local data: the POS type is
 * taken from the server and is never re-chosen by the user.
 *
 * Idempotent and race-safe — if a store already exists it is returned unchanged
 * (only a missing/blank name is filled in and missing categories are seeded).
 * A valid local POS type is NEVER overwritten by the cloud value, and no
 * products or stock are deleted.
 */
export async function restoreStoreFromCloud(
  userId: string,
  cloud: { name: string; posType: PosTypeId }
): Promise<Store> {
  await latency(200)

  const store = await db.transaction(
    'rw',
    [db.users, db.stores, db.categories, db.syncQueue],
    async () => {
      const user = await db.users.get(userId)
      if (!user) throw new Error('User not found.')

      const existing = await db.stores.where('userId').equals(userId).first()
      if (existing) {
        // Keep the local workspace type. Cloud recovery only fills gaps.
        let current = existing
        if (!existing.name?.trim() && cloud.name.trim()) {
          current = { ...existing, name: cloud.name.trim() }
          await db.stores.put(current)
        }
        await ensureStoreCategories(current, nowIso())
        return current
      }

      const now = nowIso()
      const created: Store = {
        id: newId('str'),
        userId,
        name: cloud.name.trim() || user.businessName,
        posType: cloud.posType,
        createdAt: now,
        onboarded: true,
      }
      await db.stores.put(created)
      // No products are created — the catalog stays empty until a backup is
      // restored or items are added.
      await ensureStoreCategories(created, now)
      await putSyncOp(
        syncOpFor('store', created.id, 'create', created.id, { posType: cloud.posType })
      )
      return created
    }
  )

  await refreshCacheForUser(userId)
  return store
}

export type { NotificationPrefs, Subscription }
