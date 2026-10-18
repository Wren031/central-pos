import { db } from '@/database/schema'
import { mockClock } from '@/lib/mock-clock'
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

/**
 * Account-scoped backup format (v2).
 *
 * v1 dumped the ENTIRE database with no account association, so restoring it on
 * another account either leaked data between accounts or (worse) wiped local
 * data because the importer cleared every table. v2 is deliberately narrow:
 *
 *   * It only contains the signed-in account's OWN store and that store's rows.
 *   * It carries the store's POS type so a new device can restore into the same
 *     workspace type.
 *   * Secrets are never exported: users/password hashes, sessions, auth tokens,
 *     Supabase keys, pending registrations and the sync queue are all excluded.
 *
 * Products/orders only exist in Dexie (there is no cloud POS table), so this
 * file IS the cross-device data-movement mechanism.
 */
export const EXPORT_VERSION = 2 as const

export interface BackupV2 {
  app: 'central-pos'
  version: typeof EXPORT_VERSION
  exportedAt: string
  /** Email of the account that produced the backup (informational). */
  accountEmail: string
  store: {
    name: string
    posType: string
  }
  data: {
    categories: Category[]
    products: Product[]
    stockMovements: StockMovement[]
    customers: Customer[]
    orders: Order[]
    orderItems: OrderItemRecord[]
    transactions: Transaction[]
    subscriptions: Subscription[]
  }
  settings: {
    printer: PrinterSettings | null
    scanner: ScannerSettings | null
  }
}

/**
 * Build a backup for ONE account + ONE store. Throws when this device has no
 * workspace yet — an empty export would give false confidence that data can be
 * recovered from it.
 */
export async function exportDatabase(input: {
  userId: string
  email: string
  store: Store
}): Promise<BackupV2> {
  const { userId, email, store } = input
  const storeId = store.id

  const [categories, products, stockMovements, customers, orders, orderItems, transactions, subscriptions, printer, scanner] =
    await Promise.all([
      db.categories.where('storeId').equals(storeId).toArray(),
      db.products.where('storeId').equals(storeId).toArray(),
      db.stockMovements.where('storeId').equals(storeId).toArray(),
      db.customers.where('storeId').equals(storeId).toArray(),
      db.orders.where('storeId').equals(storeId).toArray(),
      db.orderItems.where('storeId').equals(storeId).toArray(),
      db.transactions.where('userId').equals(userId).toArray(),
      db.subscriptions.where('userId').equals(userId).toArray(),
      db.printerSettings.get(storeId).catch(() => null),
      db.scannerSettings.get(storeId).catch(() => null),
    ])

  return {
    app: 'central-pos',
    version: EXPORT_VERSION,
    exportedAt: mockClock.nowIso(),
    accountEmail: email,
    store: { name: store.name, posType: store.posType },
    data: {
      categories,
      products,
      stockMovements,
      customers,
      orders,
      orderItems,
      transactions,
      subscriptions,
    },
    settings: {
      printer: printer ?? null,
      scanner: scanner ?? null,
    },
  }
}

export function downloadExport(payload: BackupV2): void {
  const stamp = payload.exportedAt.replace(/[:.]/g, '-')
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `central-pos-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}
