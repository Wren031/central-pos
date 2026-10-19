import { db } from '@/database/schema'
import { mockClock } from '@/lib/mock-clock'
import type { SyncConflict, SyncEntity, SyncOperation } from '@/lib/types'
import { isOnline, subscribeOnline } from './connectivity'
import { makeConflict, makeSyncOp, MockSyncAdapter, mockSyncAdapter, type SyncAdapter } from './mock-adapter'

export interface SyncState {
  online: boolean
  syncing: boolean
  pendingCount: number
  failedCount: number
  lastSyncAt: string | null
  simulateFailure: boolean
  conflicts: SyncConflict[]
}

const CONFLICTS_KEY = 'syncConflicts'
const LAST_SYNC_KEY = 'lastSyncAt'
const AUTO_SYNC_MS = 60_000

class SyncManager {
  private adapter: SyncAdapter = mockSyncAdapter
  private listeners = new Set<(s: SyncState) => void>()
  private syncing = false
  private timer: number | null = null
  private started = false
  private state: SyncState = {
    online: isOnline(),
    syncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    simulateFailure: false,
    conflicts: [],
  }

  start(): void {
    if (this.started) return
    this.started = true
    subscribeOnline((online) => {
      this.patch({ online })
      if (online) void this.syncNow()
    })
    this.timer = window.setInterval(() => {
      if (isOnline() && !this.syncing) void this.syncNow()
    }, AUTO_SYNC_MS)
    void this.refreshCounts()
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.started = false
  }

  getState(): SyncState {
    return this.state
  }

  subscribe(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private patch(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((fn) => fn(this.state))
  }

  async refreshCounts(): Promise<void> {
    try {
      const [pending, failed, last, conflictsRow] = await Promise.all([
        db.syncQueue.where('status').equals('pending').count(),
        db.syncQueue.where('status').equals('failed').count(),
        db.syncMeta.get(LAST_SYNC_KEY),
        db.syncMeta.get(CONFLICTS_KEY),
      ])
      this.patch({
        pendingCount: pending,
        failedCount: failed,
        lastSyncAt: (last?.value as string | undefined) ?? null,
        conflicts: (conflictsRow?.value as SyncConflict[] | undefined) ?? [],
      })
    } catch {
      /* queue tables unavailable — keep last known counts */
    }
  }

  /** Call after any repo mutation that wrote to syncQueue (inside the same tx or after). */
  notifyQueueChanged(): void {
    void this.refreshCounts()
    window.clearTimeout(this.debounceHandle)
    this.debounceHandle = window.setTimeout(() => {
      if (isOnline()) void this.syncNow()
    }, 2500)
  }

  private debounceHandle = 0

  async enqueue(input: {
    entity: SyncEntity
    entityId: string
    action: 'create' | 'update' | 'delete'
    storeId?: string | null
    payload?: Record<string, unknown>
  }): Promise<SyncOperation> {
    const op = makeSyncOp(input)
    await db.syncQueue.put(op)
    this.notifyQueueChanged()
    return op
  }

  setSimulateFailure(value: boolean): void {
    if (this.adapter instanceof MockSyncAdapter) {
      this.adapter.simulateFailure = value
    }
    this.patch({ simulateFailure: value })
  }

  /** Reset failed ops to pending, then run a sync pass. */
  async retryFailed(): Promise<void> {
    const failed = await db.syncQueue.where('status').equals('failed').toArray()
    for (const op of failed) {
      await db.syncQueue.update(op.id, {
        status: 'pending',
        updatedAt: mockClock.nowIso(),
        lastError: null,
      })
    }
    await this.refreshCounts()
    await this.syncNow()
  }

  async syncNow(): Promise<void> {
    if (this.syncing || !isOnline()) return
    this.syncing = true
    this.patch({ syncing: true })
    try {
      const ops = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'syncing'])
        .sortBy('createdAt')
      if (ops.length === 0) {
        this.patch({ syncing: false, pendingCount: 0 })
        return
      }
      // Mark as in-flight (idempotency: each op id is only pushed once per pass).
      for (const op of ops) {
        await db.syncQueue.update(op.id, {
          status: 'syncing',
          updatedAt: mockClock.nowIso(),
        })
      }
      const result = await this.adapter.push(ops)
      const now = mockClock.nowIso()
      const conflicts = [...this.state.conflicts]
      for (const id of result.okIds) {
        const op = ops.find((o) => o.id === id)
        const conflict = result.conflicts.find((c) => c.id === id)
        if (conflict) {
          // LWW: local record wins (offline-first). Recorded for review.
          conflicts.push(makeConflict(conflict.entity, conflict.entityId))
        }
        await db.syncQueue.update(id, {
          status: 'synced',
          syncedAt: now,
          updatedAt: now,
          lastError: null,
          // Drop bulky payload after successful upload — idempotencyKey retained.
          payload: undefined,
        })
        if (op) {
          await db.syncMeta.put({ key: `synced:${op.entity}:${op.entityId}`, value: now })
        }
      }
      for (const f of result.failed) {
        const op = ops.find((o) => o.id === f.id)
        const attempts = (op?.attempts ?? 0) + 1
        await db.syncQueue.update(f.id, {
          status: attempts >= 5 ? 'failed' : 'pending',
          attempts,
          lastError: f.error,
          updatedAt: now,
        })
      }
      if (conflicts.length > 0) {
        await db.syncMeta.put({ key: CONFLICTS_KEY, value: conflicts.slice(-50) })
      }
      await db.syncMeta.put({ key: LAST_SYNC_KEY, value: now })
      // Opportunistic cleanup: keep synced ops for 7 days, then drop.
      const cutoff = new Date(mockClock.now().getTime() - 7 * 86400000).toISOString()
      const stale = await db.syncQueue.where('status').equals('synced').toArray()
      for (const op of stale) {
        if (op.syncedAt && op.syncedAt < cutoff) await db.syncQueue.delete(op.id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed'
      const ops = await db.syncQueue.where('status').equals('syncing').toArray()
      for (const op of ops) {
        await db.syncQueue.update(op.id, {
          status: 'pending',
          lastError: message,
          updatedAt: mockClock.nowIso(),
        })
      }
    } finally {
      this.syncing = false
      this.patch({ syncing: false })
      await this.refreshCounts()
    }
  }
}

export const syncManager = new SyncManager()

/** Convenience used by repositories after committing a mutation. */
export function notifySyncQueueChanged(): void {
  syncManager.notifyQueueChanged()
}
