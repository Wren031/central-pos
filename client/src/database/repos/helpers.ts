import { patchCache, getCache, emit } from '../cache'
import { db } from '../schema'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { makeSyncOp } from '@/offline/mock-adapter'
import { mockClock } from '@/lib/mock-clock'
import { uid } from '@/lib/storage'
import type { CacheState } from '../cache'
import type { SyncEntity, SyncOperation } from '@/lib/types'

export function latency(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 140))
}

export function newId(prefix: string): string {
  return uid(prefix)
}

export function nowIso(): string {
  return mockClock.nowIso()
}

/** Build a sync op inside a Dexie transaction using the transaction's table. */
export function syncOpFor(
  entity: SyncEntity,
  entityId: string,
  action: 'create' | 'update' | 'delete',
  storeId?: string | null,
  payload?: Record<string, unknown>
): SyncOperation {
  return makeSyncOp({ entity, entityId, action, storeId, payload })
}

export async function putSyncOp(op: SyncOperation): Promise<void> {
  await db.syncQueue.put(op)
}

/**
 * Persist a table mutation + cache patch + change notification together.
 * Dexie write happens first (transaction handled by caller when atomicity
 * across tables is required); cache is then refreshed for the active store.
 */
export async function commitCache(patch: Partial<CacheState>): Promise<void> {
  patchCache(patch)
  notifySyncQueueChanged()
}

export { emit, getCache }
