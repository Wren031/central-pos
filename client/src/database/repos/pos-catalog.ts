import { db } from '../schema'
import { iconForName, themeForId } from '@/lib/pos-presentation'
import type { PosCategoryRecord, PosTypeRecord } from '@/lib/types'
import type { PosTypeDef } from '@/lib/pos-types'

/**
 * Synchronous POS-type catalog, backed by an in-memory copy hydrated from
 * IndexedDB at boot (and after every online refresh). Render-time call sites
 * read from here exactly like the user-data cache in database/cache.ts.
 *
 * The catalog is the Supabase `pos_types` (+ `pos_type_categories`) contents,
 * managed from the admin dashboard — never a hardcoded list.
 */
let types: PosTypeRecord[] = []
let assignments: PosCategoryRecord[] = []

const byId = () => new Map(types.map((t) => [t.id, t]))

/** All active POS types, ordered by the admin-defined sort_order. */
export function getPosTypeRecords(): PosTypeRecord[] {
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function isPosCatalogEmpty(): boolean {
  return types.length === 0
}

/** Categories assigned to a POS type, in the admin-defined order. */
export function getPosTypeCategories(posTypeId: string): PosCategoryRecord[] {
  return assignments
    .filter((a) => a.posTypeId === posTypeId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function toDef(rec: PosTypeRecord): PosTypeDef {
  return {
    id: rec.id,
    name: rec.name,
    tagline: rec.tagline,
    description: rec.description,
    icon: iconForName(rec.icon),
    theme: themeForId(rec.id),
    categories: getPosTypeCategories(rec.id).map((c) => c.name),
    barcodeEnabled: rec.barcodeEnabled === true,
  }
}

/** All active POS types, resolved for rendering. */
export function getPosTypes(): PosTypeDef[] {
  return getPosTypeRecords().map(toDef)
}

/**
 * Resolve a POS type for rendering. Falls back to a neutral placeholder when the
 * id is unknown or not yet cached — existing stores keep rendering while the
 * catalog loads (or offline), and a deactivated type never crashes the UI.
 */
export function getPosType(id: string): PosTypeDef {
  const rec = byId().get(id)
  if (rec) return toDef(rec)
  return {
    id,
    name: 'Unknown POS type',
    tagline: '',
    description: '',
    icon: iconForName(null),
    theme: themeForId(id),
    categories: [],
    barcodeEnabled: false,
  }
}

export function posTypeHue(id: string): number {
  return themeForId(id).hue
}

/** Load the cached catalog into memory. Safe to call repeatedly. */
export async function hydratePosCatalog(): Promise<void> {
  const [t, a] = await Promise.all([db.posCatalog.toArray(), db.posCatalogCategories.toArray()])
  types = t
  assignments = a
}
