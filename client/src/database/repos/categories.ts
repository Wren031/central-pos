import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { latency, newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import type { Category } from '@/lib/types'

export function getCategories(storeId: string): Category[] {
  return getCache()
    .categories.filter((c) => c.storeId === storeId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function addCategory(storeId: string, name: string): Promise<Category> {
  await latency(90)
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required.')
  const exists = getCache().categories.some(
    (c) => c.storeId === storeId && c.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (exists) throw new Error('That category already exists.')
  const category: Category = { id: newId('cat'), storeId, name: trimmed, createdAt: nowIso() }
  await db.transaction('rw', db.categories, db.syncQueue, async () => {
    await db.categories.put(category)
    await putSyncOp(syncOpFor('category', category.id, 'create', storeId))
  })
  patchCache({ categories: [...getCache().categories, category] })
  notifySyncQueueChanged()
  return category
}
