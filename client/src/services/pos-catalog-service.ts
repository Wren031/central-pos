import { supabase, supabaseConfigured } from '@/lib/supabase'
import { isOnline } from '@/offline/connectivity'
import { db } from '@/database/schema'
import { emit } from '@/database/cache'
import { hydratePosCatalog } from '@/database/repos/pos-catalog'
import type { PosCategoryRecord, PosTypeRecord } from '@/lib/types'

/**
 * Fetches the admin-managed POS-type catalog from Supabase and caches it
 * locally (IndexedDB + in-memory resolver).
 *
 * Source of truth: `pos_types` (active rows) and the `pos_type_categories`
 * junction joined with active `categories`. Read access is granted to anon +
 * authenticated by admin/supabase/09_pos_type_public_read.sql, so the
 * session-less POS client can read it without a Supabase session.
 *
 * This only ever touches the catalog tables — never products, orders, stock,
 * customers, or any other business data.
 */

interface PosTypeRow {
  id: string
  name: string
  tagline: string | null
  description: string | null
  icon: string | null
  category: string | null
  active: boolean
  barcode_enabled: boolean | null
  sort_order: number | null
}

interface PosTypeCategoryRow {
  pos_type_id: string
  category_id: string
  sort_order: number | null
}

interface CategoryRow {
  id: string
  name: string
  slug: string
  active: boolean
  sort_order: number | null
}

let lastError: string | null = null
let loadedOnce = false

export function getPosCatalogError(): string | null {
  return lastError
}

export function isPosCatalogLoaded(): boolean {
  return loadedOnce
}

/**
 * Turn any thrown value — Supabase/PostgREST errors are plain objects, not
 * Error instances — into a user-facing message.
 */
function errorMessage(err: unknown, fallback = 'Could not load POS types.'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  const e = err as { message?: string; error_description?: string; hint?: string } | null
  if (e && typeof e === 'object') {
    if (e.message) return e.message
    if (e.error_description) return e.error_description
    if (e.hint) return e.hint
  }
  return fallback
}

/**
 * Refresh the catalog from Supabase. No-op when offline or unconfigured
 * (the cached copy keeps working). Returns true on a successful refresh.
 * On failure the existing cache is preserved.
 */
export async function refreshPosCatalog(): Promise<boolean> {
  if (!supabaseConfigured) {
    lastError = 'POS types are not configured on this build.'
    return false
  }
  if (!isOnline()) {
    // Offline: keep any cached copy; the caller falls back to a clear message.
    lastError = null
    return false
  }

  try {
    const { data: typeRows, error: typeErr } = await supabase
      .from('pos_types')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (typeErr) throw new Error(errorMessage(typeErr))

    const types = (typeRows ?? []) as PosTypeRow[]
    const ids = types.map((t) => t.id)

    const fetchedAt = new Date().toISOString()
    const typeRecords: PosTypeRecord[] = types.map((t) => ({
      id: t.id,
      name: t.name,
      tagline: t.tagline ?? '',
      description: t.description ?? '',
      icon: t.icon ?? null,
      category: t.category ?? null,
      active: t.active,
      barcodeEnabled: t.barcode_enabled === true,
      sortOrder: t.sort_order ?? 0,
      fetchedAt,
    }))

    // Categories are secondary — a failure here must never blank onboarding.
    const categoryRecords = await loadCategories(ids)

    await db.transaction('rw', [db.posCatalog, db.posCatalogCategories], async () => {
      await db.posCatalog.clear()
      await db.posCatalog.bulkPut(typeRecords)
      await db.posCatalogCategories.clear()
      await db.posCatalogCategories.bulkPut(categoryRecords)
    })
    await hydratePosCatalog()
    loadedOnce = true
    lastError = null
    emit()
    return true
  } catch (err) {
    console.error('[pos-catalog] refresh failed', err)
    lastError = errorMessage(err)
    return false
  }
}

/**
 * Load the active categories assigned to the given POS types.
 *
 * Uses two flat queries and joins in JS rather than a PostgREST embedded
 * resource — embedding depends on the server's relationship schema cache and
 * fails hard if it is stale. Errors are logged and treated as "no categories"
 * so the POS-type list still loads.
 */
async function loadCategories(posTypeIds: string[]): Promise<PosCategoryRecord[]> {
  if (posTypeIds.length === 0) return []

  try {
    const { data: linkRows, error: linkErr } = await supabase
      .from('pos_type_categories')
      .select('pos_type_id, category_id, sort_order')
      .in('pos_type_id', posTypeIds)
    if (linkErr) throw new Error(errorMessage(linkErr))

    const links = (linkRows ?? []) as PosTypeCategoryRow[]
    const categoryIds = [...new Set(links.map((l) => l.category_id))]
    if (categoryIds.length === 0) return []

    const { data: catRows, error: catErr } = await supabase
      .from('categories')
      .select('id, name, slug, active, sort_order')
      .in('id', categoryIds)
    if (catErr) throw new Error(errorMessage(catErr))

    const catById = new Map(((catRows ?? []) as CategoryRow[]).map((c) => [c.id, c]))
    const records: PosCategoryRecord[] = []
    for (const link of links) {
      const cat = catById.get(link.category_id)
      if (!cat || cat.active === false) continue
      records.push({
        id: `${link.pos_type_id}:${cat.id}`,
        posTypeId: link.pos_type_id,
        categoryId: cat.id,
        name: cat.name,
        slug: cat.slug,
        sortOrder: link.sort_order ?? cat.sort_order ?? 0,
      })
    }
    return records
  } catch (err) {
    console.error('[pos-catalog] category load failed', err)
    return []
  }
}
