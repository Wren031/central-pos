import { supabase, supabaseConfigured } from '@/lib/supabase'
import { isOnline } from '@/offline/connectivity'
import { hydratePlanCatalog, savePlanCatalog } from '@/database/repos/plan-catalog'
import type { GcashQrConfig, PlanRecord } from '@/lib/types'

/**
 * Fetches the admin-managed subscription catalogue from Supabase and caches it
 * locally (IndexedDB + in-memory mirror).
 *
 * Source of truth:
 *   * `subscription_plans` (active rows only) — readable by anon via the
 *     `plans_select_public` policy (06_releases.sql).
 *   * the ACTIVE GCash QR via the `public_gcash_qr()` RPC
 *     (10_client_subscription_access.sql).
 *
 * The POS client holds no Supabase session, so these are anon reads. Nothing
 * here ever activates a subscription or writes business data.
 *
 * Offline behaviour: the last successful snapshot stays cached so the client
 * can still DISPLAY plans, but purchasing is online-only (see
 * subscription-payment-service.ts) — a stale or now-inactive plan can never be
 * submitted for payment.
 */

interface PlanRow {
  id: string
  name: string
  description: string | null
  duration_days: number
  price: number | string
  currency: string | null
  is_trial: boolean
  active: boolean
  features: unknown
  sort_order: number | null
}

let lastError: string | null = null
let loadedOnce = false

export function getPlanCatalogError(): string | null {
  return lastError
}

export function isPlanCatalogLoaded(): boolean {
  return loadedOnce
}

/** Turn Supabase/PostgREST plain-object errors into a user-facing message. */
function errorMessage(err: unknown, fallback = 'Could not load subscription plans.'): string {
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

function toFeatures(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((f): f is string => typeof f === 'string')
  return []
}

/**
 * Refresh the catalogue from Supabase. No-op when offline or unconfigured
 * (the cached copy keeps working). Returns true on a successful refresh.
 * On failure the existing cache is preserved.
 */
export async function refreshPlanCatalog(): Promise<boolean> {
  if (!supabaseConfigured) {
    lastError = 'Subscription plans are not configured on this build.'
    return false
  }
  if (!isOnline()) {
    // Offline: keep any cached copy; the caller shows an appropriate notice.
    lastError = null
    return false
  }

  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('id, name, description, duration_days, price, currency, is_trial, active, features, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error) throw new Error(errorMessage(error))

    const fetchedAt = new Date().toISOString()
    const records: PlanRecord[] = ((data ?? []) as PlanRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      durationDays: p.duration_days,
      price: Number(p.price),
      currency: p.currency ?? 'PHP',
      isTrial: p.is_trial,
      active: p.active,
      features: toFeatures(p.features),
      sortOrder: p.sort_order ?? 0,
      fetchedAt,
    }))

    const qr = await loadGcashQr(fetchedAt)

    await savePlanCatalog(records, qr)
    loadedOnce = true
    lastError = null
    return true
  } catch (err) {
    console.error('[plan-catalog] refresh failed', err)
    lastError = errorMessage(err)
    return false
  }
}

/**
 * True when PostgREST reports that the RPC itself does not exist (e.g. the
 * `10_client_subscription_access.sql` migration was never applied). Distinct
 * from a transient network error.
 */
function isMissingFunction(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e || typeof e !== 'object') return false
  if (e.code === 'PGRST202') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  )
}

/**
 * The active GCash QR. A failure here must never blank the plan list, so it
 * degrades to "not configured" and records a soft error. When the RPC itself is
 * missing the config carries an `error` so the UI can say "service unavailable"
 * instead of the misleading "not configured yet".
 */
async function loadGcashQr(fetchedAt: string): Promise<GcashQrConfig> {
  try {
    const { data, error } = await supabase.rpc('public_gcash_qr')
    if (error) throw error
    const payload = (data ?? {}) as { url?: string | null; active?: boolean }
    return {
      url: payload.url ?? null,
      active: Boolean(payload.active) && Boolean(payload.url),
      fetchedAt,
      error: null,
    }
  } catch (err) {
    console.error('[plan-catalog] GCash QR load failed', err)
    return {
      url: null,
      active: false,
      fetchedAt,
      error: isMissingFunction(err)
        ? 'The GCash QR service is not available on this build. Please contact support.'
        : errorMessage(err, 'Could not load the GCash QR code.'),
    }
  }
}

/** Hydrate the in-memory catalogue from IndexedDB at boot. */
export async function hydrateCachedPlanCatalog(): Promise<void> {
  await hydratePlanCatalog()
}
