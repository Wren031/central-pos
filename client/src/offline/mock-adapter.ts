import type { SyncConflict, SyncEntity, SyncOperation } from '@/lib/types'
import { uid } from '@/lib/storage'
import { mockClock } from '@/lib/mock-clock'

export interface SyncPushResult {
  okIds: string[]
  failed: { id: string; error: string }[]
  conflicts: { id: string; entity: SyncEntity; entityId: string }[]
}

/**
 * Adapter contract — a real centralized API client would implement this
 * the same way. Keep business logic and repositories adapter-agnostic.
 */
export interface SyncAdapter {
  readonly label: string
  push(ops: SyncOperation[]): Promise<SyncPushResult>
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Mock adapter — SIMULATES uploading to a central server.
 * No data leaves this device. Safe to swap for a real HTTP adapter later.
 */
export class MockSyncAdapter implements SyncAdapter {
  readonly label = 'Mock server (simulation)'
  /** When true, every push fails — used to demonstrate retry behavior. */
  simulateFailure = false
  /** Ops whose payload carries __conflictDemo are reported as conflicts. */
  async push(ops: SyncOperation[]): Promise<SyncPushResult> {
    await delay(350 + Math.random() * 550)
    if (this.simulateFailure) {
      return {
        okIds: [],
        failed: ops.map((op) => ({ id: op.id, error: 'Simulated network failure' })),
        conflicts: [],
      }
    }
    const result: SyncPushResult = { okIds: [], failed: [], conflicts: [] }
    for (const op of ops) {
      if (op.payload && op.payload.__conflictDemo) {
        result.conflicts.push({ id: op.id, entity: op.entity, entityId: op.entityId })
        result.okIds.push(op.id)
        continue
      }
      if (op.attempts > 0 && Math.random() < 0.25) {
        result.failed.push({ id: op.id, error: 'Simulated transient error (will retry)' })
        continue
      }
      result.okIds.push(op.id)
    }
    return result
  }
}

export const mockSyncAdapter = new MockSyncAdapter()

export function makeSyncOp(input: {
  entity: SyncEntity
  entityId: string
  action: 'create' | 'update' | 'delete'
  storeId?: string | null
  payload?: Record<string, unknown>
}): SyncOperation {
  const now = mockClock.nowIso()
  return {
    id: uid('sop'),
    idempotencyKey: `${input.entity}:${input.entityId}:${input.action}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    entity: input.entity,
    entityId: input.entityId,
    storeId: input.storeId ?? null,
    action: input.action,
    status: 'pending',
    attempts: 0,
    lastError: null,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
  }
}

export function makeConflict(entity: SyncEntity, entityId: string): SyncConflict {
  return {
    id: uid('cfl'),
    entity,
    entityId,
    resolution: 'local-wins',
    detectedAt: mockClock.nowIso(),
  }
}
