import { db } from '../schema'
import { emit } from '../cache'
import type { GcashQrConfig, PlanRecord } from '@/lib/types'

/**
 * Admin-managed subscription catalogue, cached in IndexedDB and mirrored in
 * memory for synchronous reads at render time — the same pattern as
 * database/repos/pos-catalog.ts.
 *
 * Source of truth: Supabase `subscription_plans` (active rows) and the active
 * GCash QR. The POS client NEVER hardcodes plan names, prices, or durations.
 */
const GCASH_QR_KEY = 'gcashQr'

let plans: PlanRecord[] = []
let gcashQr: GcashQrConfig = { url: null, active: false, fetchedAt: null, error: null }

/** Active purchase plans (excludes the trial), ordered by admin sort_order. */
export function getPlanRecords(): PlanRecord[] {
  return plans.filter((p) => p.active && !p.isTrial).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getAllPlanRecords(): PlanRecord[] {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getPlanRecord(id: string): PlanRecord | null {
  return plans.find((p) => p.id === id) ?? null
}

export function isPlanCatalogEmpty(): boolean {
  return plans.length === 0
}

export function getGcashQrConfig(): GcashQrConfig {
  return gcashQr
}

/** Load the cached catalogue into memory. Safe to call repeatedly. */
export async function hydratePlanCatalog(): Promise<void> {
  const [rows, qrRow] = await Promise.all([
    db.planCatalog.toArray(),
    db.syncMeta.get(GCASH_QR_KEY),
  ])
  plans = rows
  const cached = qrRow?.value as GcashQrConfig | undefined
  gcashQr = cached ?? { url: null, active: false, fetchedAt: null, error: null }
  emit()
}

/** Persist a fresh catalogue (replaces the previous snapshot). */
export async function savePlanCatalog(
  next: PlanRecord[],
  qr: GcashQrConfig
): Promise<void> {
  await db.transaction('rw', [db.planCatalog, db.syncMeta], async () => {
    await db.planCatalog.clear()
    await db.planCatalog.bulkPut(next)
    await db.syncMeta.put({ key: GCASH_QR_KEY, value: qr })
  })
  plans = next
  gcashQr = qr
  emit()
}
