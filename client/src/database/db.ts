import { db } from './schema'
import { migrateLegacyIfNeeded } from './migrate-legacy'
import { seedPosConfigs } from './seed'
import { replaceCache, resetCache, type CacheState } from './cache'
import type {
  AppNotification,
  Category,
  Customer,
  Order,
  Product,
  Session,
  StockMovement,
  Store,
  Subscription,
  Transaction,
  User,
} from '@/lib/types'

export type DbInitResult = { ok: true; migrated: boolean } | { ok: false; error: string }

let initPromise: Promise<DbInitResult> | null = null
let initialized = false

export function isDbInitialized(): boolean {
  return initialized
}

export async function loadUserScopedCache(userId: string): Promise<CacheState> {
  const [users, sessionRow, stores, subscriptions, transactions, notifications, paymentRequests] =
    await Promise.all([
      db.users.toArray(),
      db.sessions.get('current'),
      db.stores.where('userId').equals(userId).toArray(),
      db.subscriptions.where('userId').equals(userId).toArray(),
      db.transactions.where('userId').equals(userId).toArray(),
      db.notifications.where('userId').equals(userId).toArray(),
      db.paymentRequests.where('userId').equals(userId).toArray(),
    ])
  const storeIds = stores.map((s) => s.id)
  const byStore = <T extends { storeId: string }>(rows: T[]) =>
    storeIds.length === 0 ? [] : rows.filter((r) => storeIds.includes(r.storeId))
  const [products, categories, customers, orders, stockMovements] = await Promise.all([
    storeIds.length ? db.products.where('storeId').anyOf(storeIds).toArray() : [],
    storeIds.length ? db.categories.where('storeId').anyOf(storeIds).toArray() : [],
    storeIds.length ? db.customers.where('storeId').anyOf(storeIds).toArray() : [],
    storeIds.length ? db.orders.where('storeId').anyOf(storeIds).toArray() : [],
    storeIds.length ? db.stockMovements.where('storeId').anyOf(storeIds).toArray() : [],
  ])
  const session: Session | null = sessionRow
    ? { userId: sessionRow.userId, loggedInAt: sessionRow.loggedInAt }
    : null
  return {
    users,
    session,
    stores,
    categories: byStore(categories),
    customers: byStore(customers),
    products: byStore(products),
    orders: byStore(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    transactions: transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    subscriptions,
    notifications: notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    paymentRequests: paymentRequests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    stockMovements: byStore(stockMovements).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}

async function hydrate(): Promise<void> {
  const sessionRow = await db.sessions.get('current')
  if (!sessionRow) {
    resetCache()
    return
  }
  replaceCache(await loadUserScopedCache(sessionRow.userId))
}

/**
 * Opens IndexedDB, runs one-time legacy migration, seeds demo data,
 * and hydrates the in-memory cache. Safe to call repeatedly.
 */
export function initDatabase(): Promise<DbInitResult> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      await db.open()
      const migrated = await migrateLegacyIfNeeded()
      await seedPosConfigs()
      await hydrate()
      initialized = true
      return { ok: true, migrated }
    } catch (err) {
      initialized = false
      const message =
        err instanceof Error
          ? err.message
          : 'Local database could not be opened (storage may be unavailable).'
      return { ok: false, error: message }
    }
  })()
  return initPromise
}

export async function retryInitDatabase(): Promise<DbInitResult> {
  initPromise = null
  return initDatabase()
}

export async function refreshCacheForUser(userId: string): Promise<void> {
  replaceCache(await loadUserScopedCache(userId))
}

export type {
  AppNotification,
  Category,
  Customer,
  Order,
  Product,
  Session,
  StockMovement,
  Store,
  Subscription,
  Transaction,
  User,
}
