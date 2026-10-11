import { db } from './schema'
import { mockClock } from '@/lib/mock-clock'
import { POS_TYPES } from '@/lib/pos-types'

/**
 * Persist a serializable copy of every POS industry config
 * (app configuration, not user data — future remote-config ready).
 */
export async function seedPosConfigs(): Promise<void> {
  const now = mockClock.nowIso()
  const records = POS_TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    features: [...t.features],
    categories: [...t.categories],
    seedProducts: t.products.map((p) => ({ ...p })),
    updatedAt: now,
  }))
  await db.posConfigs.bulkPut(records)
}
