import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { latency, newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import type { Customer } from '@/lib/types'

export function getCustomers(storeId: string): Customer[] {
  return getCache()
    .customers.filter((c) => c.storeId === storeId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function addCustomer(
  storeId: string,
  input: { name: string; phone?: string; email?: string }
): Promise<Customer> {
  await latency(100)
  const customer: Customer = {
    id: newId('cus'),
    storeId,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    createdAt: nowIso(),
  }
  await db.transaction('rw', db.customers, db.syncQueue, async () => {
    await db.customers.put(customer)
    await putSyncOp(syncOpFor('customer', customer.id, 'create', storeId))
  })
  patchCache({ customers: [...getCache().customers, customer] })
  notifySyncQueueChanged()
  return customer
}

export async function updateCustomer(
  customerId: string,
  patch: Partial<Pick<Customer, 'name' | 'phone' | 'email'>>
): Promise<Customer> {
  await latency(90)
  const existing = await db.customers.get(customerId)
  if (!existing) throw new Error('Customer not found.')
  const updated: Customer = { ...existing, ...patch }
  await db.transaction('rw', db.customers, db.syncQueue, async () => {
    await db.customers.put(updated)
    await putSyncOp(syncOpFor('customer', customerId, 'update', existing.storeId))
  })
  patchCache({ customers: getCache().customers.map((c) => (c.id === customerId ? updated : c)) })
  notifySyncQueueChanged()
  return updated
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const existing = await db.customers.get(customerId)
  if (!existing) return
  await db.transaction('rw', db.customers, db.syncQueue, async () => {
    await db.customers.delete(customerId)
    await putSyncOp(syncOpFor('customer', customerId, 'delete', existing.storeId))
  })
  patchCache({ customers: getCache().customers.filter((c) => c.id !== customerId) })
  notifySyncQueueChanged()
}
