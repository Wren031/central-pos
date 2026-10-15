import { z } from 'zod'
import { db } from '@/database/schema'
import { refreshCacheForUser } from '@/database/db'
import { EXPORT_VERSION } from './export-service'

const record = z.looseObject({})

const payloadSchema = z.object({
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  app: z.literal('central-pos'),
  data: z.object({
    users: z.array(record),
    stores: z.array(record),
    subscriptions: z.array(record),
    products: z.array(record),
    categories: z.array(record),
    customers: z.array(record),
    orders: z.array(record),
    orderItems: z.array(record),
    transactions: z.array(record),
    notifications: z.array(record),
    stockMovements: z.array(record),
  }),
})

export interface ImportResult {
  restored: Record<string, number>
}

/**
 * Validates and restores an export into IndexedDB.
 * Replaces existing rows per table; sessions and sync queue are untouched.
 */
export async function importDatabase(json: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const result = payloadSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error('That file is not a valid UniPOS backup.')
  }
  const data = result.data.data
  // Restore passwordHash-less users with a legacy placeholder hash — the
  // demo account is re-seeded on next boot anyway; restored users must
  // reset via demo login or register fresh. Keep a note on the record.
  const users = data.users.map((u) => ({
    ...u,
    passwordHash: (u as { passwordHash?: string }).passwordHash ?? 'imported-locked',
  }))
  await db.transaction(
    'rw',
    [
      db.users,
      db.stores,
      db.subscriptions,
      db.products,
      db.categories,
      db.customers,
      db.orders,
      db.orderItems,
      db.transactions,
      db.notifications,
      db.stockMovements,
    ],
    async () => {
      await db.users.clear()
      await db.stores.clear()
      await db.subscriptions.clear()
      await db.products.clear()
      await db.categories.clear()
      await db.customers.clear()
      await db.orders.clear()
      await db.orderItems.clear()
      await db.transactions.clear()
      await db.notifications.clear()
      await db.stockMovements.clear()
      await db.users.bulkPut(users as never[])
      await db.stores.bulkPut(data.stores as never[])
      await db.subscriptions.bulkPut(data.subscriptions as never[])
      await db.products.bulkPut(data.products as never[])
      await db.categories.bulkPut(data.categories as never[])
      await db.customers.bulkPut(data.customers as never[])
      await db.orders.bulkPut(data.orders as never[])
      await db.orderItems.bulkPut(data.orderItems as never[])
      await db.transactions.bulkPut(data.transactions as never[])
      await db.notifications.bulkPut(data.notifications as never[])
      await db.stockMovements.bulkPut(data.stockMovements as never[])
    }
  )
  const session = await db.sessions.get('current')
  if (session) await refreshCacheForUser(session.userId)
  return {
    restored: {
      users: users.length,
      stores: data.stores.length,
      products: data.products.length,
      orders: data.orders.length,
      customers: data.customers.length,
      transactions: data.transactions.length,
    },
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}
