import { db } from './schema'
import { uid } from '@/lib/storage'
import type { Database, OrderItemRecord } from '@/lib/types'

const LEGACY_KEY = 'cpos:v1:db'
const MIGRATED_FLAG = 'legacyMigratedAt'

function readLegacy(): Database | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Database>
    if (!parsed || !Array.isArray(parsed.users)) return null
    return {
      users: parsed.users ?? [],
      stores: parsed.stores ?? [],
      subscriptions: parsed.subscriptions ?? [],
      products: parsed.products ?? [],
      orders: parsed.orders ?? [],
      transactions: parsed.transactions ?? [],
      notifications: parsed.notifications ?? [],
      session: parsed.session ?? null,
    }
  } catch {
    return null
  }
}

/**
 * One-time import of the pre-IndexedDB localStorage database.
 * The legacy key is intentionally left in place as a backup —
 * nothing is silently deleted.
 */
export async function migrateLegacyIfNeeded(): Promise<boolean> {
  const flag = await db.syncMeta.get(MIGRATED_FLAG)
  if (flag) return false
  const legacy = readLegacy()
  if (!legacy || legacy.users.length === 0) {
    await db.syncMeta.put({ key: MIGRATED_FLAG, value: new Date().toISOString() })
    return false
  }
  const orderItems: OrderItemRecord[] = []
  for (const order of legacy.orders) {
    for (const [i, item] of order.items.entries()) {
      orderItems.push({
        id: `${order.id}_it${i}`,
        orderId: order.id,
        storeId: order.storeId,
        productId: item.productId,
        name: item.name,
        price: item.price,
        qty: item.qty,
      })
    }
  }
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
      db.syncMeta,
    ],
    async () => {
      await db.users.bulkPut(legacy.users)
      await db.stores.bulkPut(legacy.stores)
      await db.subscriptions.bulkPut(legacy.subscriptions)
      await db.products.bulkPut(legacy.products)
      await db.orders.bulkPut(legacy.orders)
      if (orderItems.length) await db.orderItems.bulkPut(orderItems)
      await db.transactions.bulkPut(legacy.transactions)
      await db.notifications.bulkPut(legacy.notifications)
      if (legacy.session) {
        await db.sessions.put({
          id: 'current',
          userId: legacy.session.userId,
          loggedInAt: legacy.session.loggedInAt,
        })
      }
      await db.syncMeta.put({ key: MIGRATED_FLAG, value: new Date().toISOString() })
      await db.syncMeta.put({ key: 'migratedFrom', value: 'localStorage:v1' })
      const maxReceipt = legacy.orders.reduce((max, o) => {
        const n = Number(o.receiptNo.replace(/\D/g, ''))
        return Number.isFinite(n) && n > max ? n : max
      }, 0)
      await db.syncMeta.put({ key: 'receiptCounter', value: maxReceipt })
      await db.syncMeta.put({ key: 'migratedAt', value: new Date().toISOString() })
    }
  )
  return true
}

export function uidFor(prefix: string): string {
  return uid(prefix)
}
