import { z } from 'zod'
import { db } from '@/database/schema'
import { refreshCacheForUser } from '@/database/db'
import { EXPORT_VERSION } from './export-service'
import type {
  Category,
  Customer,
  Order,
  OrderItemRecord,
  PrinterSettings,
  Product,
  ScannerSettings,
  StockMovement,
  Store,
  Subscription,
  Transaction,
} from '@/lib/types'

const record = z.looseObject({})

const payloadSchema = z.object({
  app: z.literal('central-pos'),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  accountEmail: z.string(),
  store: z.object({
    name: z.string(),
    posType: z.string().min(1),
  }),
  data: z.object({
    categories: z.array(record),
    products: z.array(record),
    stockMovements: z.array(record),
    customers: z.array(record),
    orders: z.array(record),
    orderItems: z.array(record),
    transactions: z.array(record),
    subscriptions: z.array(record),
  }),
  settings: z
    .object({
      printer: record.nullable().optional(),
      scanner: record.nullable().optional(),
    })
    .optional(),
})

export interface ImportResult {
  /** Rows newly written, per table. */
  restored: Record<string, number>
  /** Rows skipped because the same id already exists locally. */
  skipped: Record<string, number>
  /** The POS type recorded in the backup. */
  sourcePosType: string
  /** True when the backup came from a different account email. */
  differentAccount: boolean
}

/**
 * Which tables the import may touch. NOTE: users, sessions, pending
 * registrations, the sync queue, and password hashes are deliberately absent —
 * a backup must never create or overwrite an account, nor restore credentials.
 */
const IMPORT_TABLES = [
  db.categories,
  db.products,
  db.stockMovements,
  db.customers,
  db.orders,
  db.orderItems,
  db.transactions,
  db.subscriptions,
  db.printerSettings,
  db.scannerSettings,
] as const

function parseBackup(json: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const result = payloadSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      'That file is not a valid UniPOS backup (or it was made by an older version). Export a fresh backup and try again.'
    )
  }
  return result.data
}

export interface BackupMeta {
  store: { name: string; posType: string }
  accountEmail: string
}

/**
 * Read only the workspace metadata from a backup file WITHOUT importing it.
 * Used by the restore screen to recreate the correct workspace/POS type when
 * the cloud has no store row (e.g. legacy accounts or an offline first login).
 */
export function readBackupMeta(json: string): BackupMeta {
  const backup = parseBackup(json)
  return { store: backup.store, accountEmail: backup.accountEmail }
}

/**
 * Merge a v2 backup into the CURRENT account + store.
 *
 * Guarantees:
 *   * Never clears or deletes existing rows.
 *   * Dedupes by primary key — a record already on this device is skipped.
 *   * Re-points ownership: every row is reassigned to the signed-in user and
 *     THIS device's store, so a backup can't attach data to a stale store id.
 *   * Runs in one Dexie transaction: either the merge lands or nothing changes.
 *   * Never restores users/passwords/tokens/sessions.
 */
export async function importDatabase(
  json: string,
  target: { userId: string; store: Store; email: string }
): Promise<ImportResult> {
  const backup = parseBackup(json)
  const storeId = target.store.id
  const userId = target.userId

  const restored: Record<string, number> = {}
  const skipped: Record<string, number> = {}

  await db.transaction('rw', IMPORT_TABLES, async () => {
    // Existing ids per table so re-importing the same file is a no-op.
    const existingIds = async (table: { toCollection: () => { primaryKeys: () => Promise<unknown[]> } }) => {
      const keys = await table.toCollection().primaryKeys()
      return new Set(keys.map((k) => String(k)))
    }

    const take = <T>(
      rows: unknown[],
      ids: Set<string>,
      table: string,
      map: (row: Record<string, unknown>) => T
    ): T[] => {
      const out: T[] = []
      let skip = 0
      for (const raw of rows) {
        if (!raw || typeof raw !== 'object') {
          skip++
          continue
        }
        const row = raw as Record<string, unknown>
        const id = String(row.id ?? '')
        if (!id || ids.has(id)) {
          skip++
          continue
        }
        out.push(map(row))
      }
      restored[table] = out.length
      skipped[table] = skip
      return out
    }

    const catIds = await existingIds(db.categories)
    const prodIds = await existingIds(db.products)
    const movIds = await existingIds(db.stockMovements)
    const custIds = await existingIds(db.customers)
    const orderIds = await existingIds(db.orders)
    const itemIds = await existingIds(db.orderItems)
    const txnIds = await existingIds(db.transactions)

    const categories = take<Category>(backup.data.categories, catIds, 'categories', (r) => ({
      ...r,
      storeId,
    }) as Category)
    const products = take<Product>(backup.data.products, prodIds, 'products', (r) => ({
      ...r,
      storeId,
    }) as Product)
    const movements = take<StockMovement>(
      backup.data.stockMovements,
      movIds,
      'stockMovements',
      (r) => ({ ...r, storeId }) as StockMovement
    )
    const customers = take<Customer>(backup.data.customers, custIds, 'customers', (r) => ({
      ...r,
      storeId,
    }) as Customer)
    const orders = take<Order>(backup.data.orders, orderIds, 'orders', (r) => ({
      ...r,
      storeId,
      userId,
    }) as Order)
    const orderItems = take<OrderItemRecord>(
      backup.data.orderItems,
      itemIds,
      'orderItems',
      (r) => ({ ...r, storeId }) as OrderItemRecord
    )
    const transactions = take<Transaction>(
      backup.data.transactions,
      txnIds,
      'transactions',
      (r) => ({ ...r, userId }) as Transaction
    )

    // A user has ONE local subscription. Never import one over an existing
    // record (it would fight with the current plan/expiry).
    const existingSub = await db.subscriptions.where('userId').equals(userId).first()
    const subIds = await existingIds(db.subscriptions)
    let subscriptions: Subscription[] = []
    if (existingSub) {
      restored.subscriptions = 0
      skipped.subscriptions = backup.data.subscriptions.length
    } else {
      subscriptions = take<Subscription>(
        backup.data.subscriptions,
        subIds,
        'subscriptions',
        (r) => ({ ...r, userId }) as Subscription
      )
    }

    if (categories.length) await db.categories.bulkPut(categories)
    if (products.length) await db.products.bulkPut(products)
    if (movements.length) await db.stockMovements.bulkPut(movements)
    if (customers.length) await db.customers.bulkPut(customers)
    if (orders.length) await db.orders.bulkPut(orders)
    if (orderItems.length) await db.orderItems.bulkPut(orderItems)
    if (transactions.length) await db.transactions.bulkPut(transactions)
    if (subscriptions.length) await db.subscriptions.bulkPut(subscriptions)

    // Device settings: fill in only when this device has none yet.
    if (backup.settings?.printer) {
      const existing = await db.printerSettings.get(storeId)
      if (!existing) {
        await db.printerSettings.put({
          ...(backup.settings.printer as unknown as PrinterSettings),
          storeId,
        })
        restored.printerSettings = 1
      } else {
        skipped.printerSettings = 1
      }
    }
    if (backup.settings?.scanner) {
      const existing = await db.scannerSettings.get(storeId)
      if (!existing) {
        await db.scannerSettings.put({
          ...(backup.settings.scanner as unknown as ScannerSettings),
          storeId,
        })
        restored.scannerSettings = 1
      } else {
        skipped.scannerSettings = 1
      }
    }
  })

  await refreshCacheForUser(userId)

  return {
    restored,
    skipped,
    sourcePosType: backup.store.posType,
    differentAccount:
      backup.accountEmail.trim().toLowerCase() !== target.email.trim().toLowerCase(),
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
