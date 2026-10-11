import { db } from '@/database/schema'
import { mockClock } from '@/lib/mock-clock'

export const EXPORT_VERSION = 1 as const

export interface ExportPayload {
  version: typeof EXPORT_VERSION
  exportedAt: string
  app: 'central-pos'
  data: {
    users: unknown[]
    stores: unknown[]
    subscriptions: unknown[]
    products: unknown[]
    categories: unknown[]
    customers: unknown[]
    orders: unknown[]
    orderItems: unknown[]
    transactions: unknown[]
    notifications: unknown[]
    stockMovements: unknown[]
  }
}

/**
 * Serializes the full local database (minus sessions/sync internals) to JSON
 * for manual backup. Password hashes are intentionally omitted.
 */
export async function exportDatabase(): Promise<ExportPayload> {
  const [users, stores, subscriptions, products, categories, customers, orders, orderItems, transactions, notifications, stockMovements] =
    await Promise.all([
      db.users.toArray(),
      db.stores.toArray(),
      db.subscriptions.toArray(),
      db.products.toArray(),
      db.categories.toArray(),
      db.customers.toArray(),
      db.orders.toArray(),
      db.orderItems.toArray(),
      db.transactions.toArray(),
      db.notifications.toArray(),
      db.stockMovements.toArray(),
    ])
  return {
    version: EXPORT_VERSION,
    exportedAt: mockClock.nowIso(),
    app: 'central-pos',
    data: {
      users: users.map(({ passwordHash: _ph, ...rest }) => rest),
      stores,
      subscriptions,
      products,
      categories,
      customers,
      orders,
      orderItems,
      transactions,
      notifications,
      stockMovements,
    },
  }
}

export function downloadExport(payload: ExportPayload): void {
  const stamp = payload.exportedAt.replace(/[:.]/g, '-')
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `central-pos-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}
