import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { latency, newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { DEFAULT_UNIT } from '@/lib/units'
import type { Product, StockMovement, StockMovementType } from '@/lib/types'

export function getProducts(storeId: string): Product[] {
  return getCache().products.filter((p) => p.storeId === storeId)
}

/** Trim a raw barcode to its stored form; empty/blank → undefined (no barcode). */
function normalizeBarcode(raw?: string | null): string | undefined {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Guard against two products in the SAME store sharing a barcode (a scan must
 * resolve to one product). Barcodes are only unique per store — different
 * stores may legitimately use the same manufacturer code.
 */
async function assertBarcodeUnique(
  storeId: string,
  barcode: string | undefined,
  excludeProductId?: string
): Promise<void> {
  if (!barcode) return
  const clash = await db.products
    .where('storeId')
    .equals(storeId)
    .filter((p) => p.id !== excludeProductId && normalizeBarcode(p.barcode) === barcode)
    .first()
  if (clash) {
    throw new Error(`Barcode ${barcode} is already assigned to "${clash.name}".`)
  }
}

/**
 * Resolve a scanned barcode to a product in the store — synchronous, cache-
 * backed, so it works fully offline. Returns undefined when nothing matches.
 */
export function findProductByBarcode(storeId: string, code: string): Product | undefined {
  const barcode = normalizeBarcode(code)
  if (!barcode) return undefined
  return getProducts(storeId).find((p) => normalizeBarcode(p.barcode) === barcode)
}

export async function addProduct(
  storeId: string,
  input: {
    name: string
    category: string
    price: number
    stock: number
    unit?: string
    emoji: string
    image?: string
    barcode?: string
  }
): Promise<Product> {
  await latency(140)
  const sku = `${(await storePosPrefix(storeId)).slice(0, 3).toUpperCase()}-${newId('').slice(1, 5).toUpperCase()}`
  const barcode = normalizeBarcode(input.barcode)
  await assertBarcodeUnique(storeId, barcode)
  const now = nowIso()
  const product: Product = {
    id: newId('prd'),
    storeId,
    name: input.name.trim(),
    sku,
    barcode,
    category: input.category.trim() || 'Uncategorized',
    price: input.price,
    stock: input.stock,
    unit: input.unit?.trim() || DEFAULT_UNIT,
    emoji: input.emoji || '📦',
    image: input.image || undefined,
    active: true,
    createdAt: now,
  }
  const movement: StockMovement = {
    id: newId('mov'),
    storeId,
    productId: product.id,
    productName: product.name,
    type: 'initial',
    qtyDelta: product.stock,
    stockAfter: product.stock,
    reason: 'Product created',
    createdAt: now,
  }
  await db.transaction('rw', db.products, db.stockMovements, db.syncQueue, async () => {
    await db.products.put(product)
    await db.stockMovements.put(movement)
    await putSyncOp(syncOpFor('product', product.id, 'create', storeId))
    if (product.stock !== 0) {
      await putSyncOp(syncOpFor('stockMovement', movement.id, 'create', storeId))
    }
  })
  patchCache({
    products: [...getCache().products, product],
    stockMovements: [...getCache().stockMovements, movement],
  })
  notifySyncQueueChanged()
  return product
}

export async function updateProduct(
  productId: string,
  patch: Partial<
    Pick<
      Product,
      'name' | 'category' | 'price' | 'stock' | 'unit' | 'emoji' | 'image' | 'barcode' | 'active'
    >
  >
): Promise<Product> {
  await latency(110)
  const existing = await db.products.get(productId)
  if (!existing) throw new Error('Product not found.')
  const stockChanged = patch.stock !== undefined && patch.stock !== existing.stock
  // An explicit barcode key (even empty) means "set/clear"; its absence means
  // "leave as-is". Normalize so '' clears the barcode.
  const barcodeProvided = 'barcode' in patch
  const nextBarcode = barcodeProvided ? normalizeBarcode(patch.barcode) : normalizeBarcode(existing.barcode)
  await assertBarcodeUnique(existing.storeId, nextBarcode, productId)
  const updated: Product = {
    ...existing,
    ...patch,
    barcode: nextBarcode,
    image: patch.image === undefined ? existing.image : patch.image || undefined,
  }
  let movement: StockMovement | null = null
  if (stockChanged) {
    const delta = updated.stock - existing.stock
    movement = {
      id: newId('mov'),
      storeId: existing.storeId,
      productId,
      productName: updated.name,
      type: delta > 0 ? 'restock' : 'adjust',
      qtyDelta: delta,
      stockAfter: updated.stock,
      reason: 'Stock edited from inventory',
      createdAt: nowIso(),
    }
  }
  await db.transaction('rw', db.products, db.stockMovements, db.syncQueue, async () => {
    await db.products.put(updated)
    if (movement) await db.stockMovements.put(movement)
    await putSyncOp(syncOpFor('product', productId, 'update', existing.storeId, { fields: Object.keys(patch) }))
    if (movement) await putSyncOp(syncOpFor('stockMovement', movement.id, 'create', existing.storeId))
  })
  patchCache({
    products: getCache().products.map((p) => (p.id === productId ? updated : p)),
    stockMovements: movement ? [...getCache().stockMovements, movement] : getCache().stockMovements,
  })
  notifySyncQueueChanged()
  return updated
}

export async function deleteProduct(productId: string): Promise<void> {
  await latency(110)
  const existing = await db.products.get(productId)
  if (!existing) return
  await db.transaction('rw', db.products, db.syncQueue, async () => {
    await db.products.delete(productId)
    await putSyncOp(syncOpFor('product', productId, 'delete', existing.storeId))
  })
  patchCache({ products: getCache().products.filter((p) => p.id !== productId) })
  notifySyncQueueChanged()
}

/** Atomic stock adjustment with movement history. Prevents negative stock. */
export async function adjustStock(
  productId: string,
  delta: number,
  type: StockMovementType,
  reason: string
): Promise<Product> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('Adjustment must be a whole number other than zero.')
  }
  await latency(100)
  const existing = await db.products.get(productId)
  if (!existing) throw new Error('Product not found.')
  const nextStock = existing.stock + delta
  if (nextStock < 0) {
    throw new Error(`Not enough stock — only ${existing.stock} on hand.`)
  }
  const movement: StockMovement = {
    id: newId('mov'),
    storeId: existing.storeId,
    productId,
    productName: existing.name,
    type,
    qtyDelta: delta,
    stockAfter: nextStock,
    reason: reason.trim() || type,
    createdAt: nowIso(),
  }
  const updated: Product = { ...existing, stock: nextStock }
  await db.transaction('rw', db.products, db.stockMovements, db.syncQueue, async () => {
    await db.products.put(updated)
    await db.stockMovements.put(movement)
    await putSyncOp(syncOpFor('product', productId, 'update', existing.storeId, { stock: nextStock }))
    await putSyncOp(syncOpFor('stockMovement', movement.id, 'create', existing.storeId))
  })
  patchCache({
    products: getCache().products.map((p) => (p.id === productId ? updated : p)),
    stockMovements: [...getCache().stockMovements, movement],
  })
  notifySyncQueueChanged()
  return updated
}

export function getProductMovements(storeId: string, productId: string): StockMovement[] {
  return getCache()
    .stockMovements.filter((m) => m.storeId === storeId && m.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function storePosPrefix(storeId: string): Promise<string> {
  const store = await db.stores.get(storeId)
  return store?.posType ?? 'gen'
}
