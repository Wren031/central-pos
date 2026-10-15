import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { latency, newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { mockClock } from '@/lib/mock-clock'
import type { Order, OrderItem, OrderItemRecord, StockMovement, Transaction } from '@/lib/types'

export class InsufficientStockError extends Error {
  details: { name: string; requested: number; available: number }[]
  constructor(details: { name: string; requested: number; available: number }[]) {
    const list = details.map((d) => `${d.name} (need ${d.requested}, have ${d.available})`).join(', ')
    super(`Not enough stock for: ${list}.`)
    this.name = 'InsufficientStockError'
    this.details = details
  }
}

export function getOrders(storeId: string): Order[] {
  return getCache().orders.filter((o) => o.storeId === storeId)
}

/** In-flight guard — blocks duplicate checkout submissions per order payload. */
let checkoutInFlight = false

export async function createOrder(input: {
  storeId: string
  userId: string
  items: OrderItem[]
  discount: number
  paymentStatus: 'paid' | 'unpaid'
  customerId?: string | null
  customerName?: string | null
  cashTendered?: number | null
  change?: number | null
}): Promise<Order> {
  if (checkoutInFlight) throw new Error('A checkout is already being processed.')
  if (input.items.length === 0) throw new Error('Cart is empty.')
  checkoutInFlight = true
  try {
    const subtotal = input.items.reduce((sum, it) => sum + it.price * it.qty, 0)
    const discount = Math.min(input.discount, subtotal)
    const createdAt = mockClock.nowIso()
    let order!: Order
    const createdMovements: StockMovement[] = []
    let createdTxn: Transaction | null = null
    await db.transaction(
      'rw',
      [
        db.orders,
        db.orderItems,
        db.products,
        db.stockMovements,
        db.transactions,
        db.syncMeta,
        db.syncQueue,
      ],
      async () => {
        // 1. Stock sufficiency — fail the whole checkout atomically.
        const shortages: { name: string; requested: number; available: number }[] = []
        const products = new Map<string, { stock: number; name: string }>()
        for (const item of input.items) {
          const p = await db.products.get(item.productId)
          if (!p) {
            shortages.push({ name: item.name, requested: item.qty, available: 0 })
            continue
          }
          products.set(p.id, { stock: p.stock, name: p.name })
          if (p.stock < item.qty) {
            shortages.push({ name: p.name, requested: item.qty, available: p.stock })
          }
        }
        if (shortages.length > 0) throw new InsufficientStockError(shortages)

        // 2. Race-safe receipt number.
        const meta = await db.syncMeta.get('receiptCounter')
        const nextNo = ((meta?.value as number | undefined) ?? 0) + 1
        const receiptNo = `RCP-${String(nextNo).padStart(5, '0')}`

        order = {
          id: newId('ord'),
          storeId: input.storeId,
          userId: input.userId,
          receiptNo,
          items: input.items,
          subtotal,
          discount,
          total: subtotal - discount,
          paymentStatus: input.paymentStatus,
          customerId: input.customerId ?? null,
          customerName: input.customerName ?? 'Walk-in',
          cashTendered: input.cashTendered ?? null,
          change: input.change ?? null,
          createdAt,
        }

        // 3. Deduct stock + movements.
        for (const item of input.items) {
          const p = await db.products.get(item.productId)
          if (!p) continue
          const stockAfter = p.stock - item.qty
          await db.products.put({ ...p, stock: stockAfter })
          const movement: StockMovement = {
            id: newId('mov'),
            storeId: input.storeId,
            productId: item.productId,
            productName: item.name,
            type: 'sale',
            qtyDelta: -item.qty,
            stockAfter,
            reason: `Sale ${receiptNo}`,
            orderId: order.id,
            createdAt,
          }
          createdMovements.push(movement)
          await db.stockMovements.put(movement)
        }

        // 4. Order + item records.
        await db.orders.put(order)
        const itemRecords: OrderItemRecord[] = input.items.map((it, i) => ({
          id: `${order.id}_it${i}`,
          orderId: order.id,
          storeId: input.storeId,
          productId: it.productId,
          name: it.name,
          price: it.price,
          qty: it.qty,
          unit: it.unit,
        }))
        await db.orderItems.bulkPut(itemRecords)

        // 5. Payment ledger (paid sales only, matching existing behavior).
        if (order.paymentStatus === 'paid') {
          createdTxn = {
            id: newId('txn'),
            userId: input.userId,
            type: 'order',
            reference: order.receiptNo,
            description: `Sale — ${order.items.length} item(s)`,
            amount: order.total,
            status: 'success',
            createdAt,
          }
          await db.transactions.put(createdTxn)
        }

        await db.syncMeta.put({ key: 'receiptCounter', value: nextNo })
        await putSyncOp(syncOpFor('order', order.id, 'create', input.storeId, {
          receiptNo,
          total: order.total,
        }))
        for (const m of createdMovements) {
          await putSyncOp(syncOpFor('stockMovement', m.id, 'create', input.storeId))
        }
      }
    )
    patchCache({
      orders: [order, ...getCache().orders],
      stockMovements: [...createdMovements, ...getCache().stockMovements],
      transactions: createdTxn ? [createdTxn, ...getCache().transactions] : getCache().transactions,
      products: getCache().products.map((p) => {
        const item = input.items.find((it) => it.productId === p.id)
        return item ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p
      }),
    })
    notifySyncQueueChanged()
    return order
  } finally {
    checkoutInFlight = false
  }
}

export async function setOrderPaymentStatus(orderId: string, status: 'paid' | 'unpaid'): Promise<void> {
  await latency(100)
  const order = await db.orders.get(orderId)
  if (!order) throw new Error('Order not found.')
  const updated: Order = { ...order, paymentStatus: status }
  await db.transaction('rw', db.orders, db.transactions, db.syncQueue, async () => {
    await db.orders.put(updated)
    if (status === 'paid' && order.paymentStatus === 'unpaid') {
      await db.transactions.put({
        id: newId('txn'),
        userId: order.userId,
        type: 'order',
        reference: order.receiptNo,
        description: `Payment recorded — ${order.items.length} item(s)`,
        amount: order.total,
        status: 'success',
        createdAt: nowIso(),
      })
    }
    await putSyncOp(syncOpFor('order', orderId, 'update', order.storeId, { paymentStatus: status }))
  })
  patchCache({
    orders: getCache().orders.map((o) => (o.id === orderId ? updated : o)),
  })
  notifySyncQueueChanged()
}
