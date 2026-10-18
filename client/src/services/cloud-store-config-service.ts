import { supabase, supabaseConfigured } from '@/lib/supabase'
import { isOnline } from '@/offline/connectivity'

/**
 * Cross-device STORE CONFIGURATION (business name + assigned POS type +
 * subscription summary).
 *
 * The POS client is offline-first and holds no persistent Supabase session, so
 * this uses the same session-less SECURITY DEFINER RPC pattern as account
 * status and GCash payments (see supabase/15_client_store_config.sql). The
 * caller proves ownership with a short-lived password sign-in for the duration
 * of ONE operation; both RPCs are keyed on auth.uid(), never on an email.
 *
 * Business data (products, orders, …) is NOT here — it lives in Dexie and moves
 * between devices through the JSON backup.
 */

/** A lookup is abandoned after this long so a hung request can't wedge login. */
const RPC_TIMEOUT_MS = 8000

export interface CloudStoreInfo {
  id: string
  name: string
  posType: string
  onboarded: boolean
  status: string | null
}

export interface CloudSubscriptionSummary {
  planId: string
  status: string
  startedAt: string | null
  expiresAt: string | null
  pricePaid: number
}

export interface CloudStoreConfig {
  found: boolean
  store: CloudStoreInfo | null
  subscription: CloudSubscriptionSummary | null
}

export const EMPTY_CLOUD_CONFIG: CloudStoreConfig = {
  found: false,
  store: null,
  subscription: null,
}

function withTimeout<T>(thenable: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('The store configuration check timed out.'))
    }, ms)
    Promise.resolve(thenable).then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/** Turn Supabase/PostgREST plain-object errors into a readable message. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  const e = err as { message?: string; error_description?: string; hint?: string } | null
  if (e && typeof e === 'object') {
    if (e.message) return e.message
    if (e.error_description) return e.error_description
    if (e.hint) return e.hint
  }
  return fallback
}

interface RawConfigRow {
  found?: boolean
  store?: {
    id?: string
    name?: string
    pos_type?: string
    onboarded?: boolean
    status?: string | null
  } | null
  subscription?: {
    plan_id?: string
    status?: string
    started_at?: string | null
    expires_at?: string | null
    price_paid?: number | string | null
  } | null
}

function normalize(raw: RawConfigRow | null | undefined): CloudStoreConfig {
  if (!raw || raw.found !== true || !raw.store?.pos_type) return { ...EMPTY_CLOUD_CONFIG }
  const sub = raw.subscription
  return {
    found: true,
    store: {
      id: String(raw.store.id ?? ''),
      name: raw.store.name?.trim() || 'My Store',
      posType: String(raw.store.pos_type),
      onboarded: raw.store.onboarded !== false,
      status: raw.store.status ?? null,
    },
    subscription:
      sub && sub.plan_id
        ? {
            planId: String(sub.plan_id),
            status: String(sub.status ?? 'active'),
            startedAt: sub.started_at ?? null,
            expiresAt: sub.expires_at ?? null,
            pricePaid: Number(sub.price_paid ?? 0),
          }
        : null,
  }
}

/** Is cloud config usable from this device right now? */
export function canUseCloudConfig(): boolean {
  return supabaseConfigured && isOnline()
}

/**
 * Read the CALLER'S store config. MUST be called while a Supabase session is
 * active (see `withTransientSession`). Best-effort: returns an empty config on
 * any failure so login never breaks because of a flaky network.
 */
export async function readCloudStoreConfig(): Promise<CloudStoreConfig> {
  if (!supabaseConfigured) return { ...EMPTY_CLOUD_CONFIG }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('client_store_config'),
      RPC_TIMEOUT_MS
    )
    if (error) {
      console.warn('[cloud-store-config] read failed', error.message)
      return { ...EMPTY_CLOUD_CONFIG }
    }
    return normalize(data as RawConfigRow | null)
  } catch (err) {
    console.warn('[cloud-store-config] read failed', err)
    return { ...EMPTY_CLOUD_CONFIG }
  }
}

/**
 * Save the caller's store config. MUST be called while a Supabase session is
 * active. Throws on a real failure (including the server's immutable-POS-type
 * rejection) so callers can surface it; callers that only want a best-effort
 * backstop should catch.
 */
export async function saveCloudStoreConfig(name: string, posType: string): Promise<void> {
  if (!supabaseConfigured) throw new Error('Cloud sync is not configured on this build.')
  if (!isOnline()) throw new Error('You are offline — the workspace type will sync later.')

  const { error } = await withTimeout(
    supabase.rpc('client_save_store_config', { p_name: name, p_pos_type: posType }),
    RPC_TIMEOUT_MS
  )
  if (error) throw new Error(errorMessage(error, 'Could not save the store configuration.'))
}

/**
 * Run `fn` inside a short-lived Supabase session. The client keeps no session
 * normally (persistSession:false), so this signs in, runs, and always signs out.
 * Returns null when the credentials don't authenticate with Supabase.
 */
export async function withTransientSession<T>(
  email: string,
  password: string,
  fn: () => Promise<T>
): Promise<T | null> {
  if (!supabaseConfigured) return null
  const normalized = email.trim().toLowerCase()

  let signIn
  try {
    signIn = await supabase.auth.signInWithPassword({ email: normalized, password })
  } catch {
    return null
  }
  if (signIn.error || !signIn.data.user) return null

  try {
    return await fn()
  } finally {
    await supabase.auth.signOut().catch(() => {})
  }
}

/* ---------- transient hand-off to the /restore screen ---------- */

const RESTORE_KEY = 'cpos:restore-context'

/** What the login flow learned about an existing account on this device. */
export interface RestoreContext {
  email: string
  cloud: CloudStoreConfig
  /** True when the account is fully configured in the cloud (POS type known). */
  hasCloudStore: boolean
}

/**
 * The login flow signs the Supabase session out before navigating, so the
 * /restore screen can't re-query the cloud. Stash the result for one screen
 * visit (sessionStorage: clears on tab close, never contains a password).
 */
export function stashRestoreContext(ctx: RestoreContext): void {
  try {
    window.sessionStorage.setItem(RESTORE_KEY, JSON.stringify(ctx))
  } catch {
    /* storage unavailable — the screen falls back to file restore */
  }
}

export function readRestoreContext(): RestoreContext | null {
  try {
    const raw = window.sessionStorage.getItem(RESTORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RestoreContext
    if (!parsed?.email || !parsed.cloud) return null
    return parsed
  } catch {
    return null
  }
}

export function clearRestoreContext(): void {
  try {
    window.sessionStorage.removeItem(RESTORE_KEY)
  } catch {
    /* nothing to clear */
  }
}

/**
 * The restore context, but ONLY when it belongs to the given account. Prevents
 * a stale hand-off (e.g. a different user signing in later in the same tab)
 * from routing someone to a restore screen that isn't theirs.
 */
export function readRestoreContextFor(email?: string | null): RestoreContext | null {
  const ctx = readRestoreContext()
  if (!ctx) return null
  if (email && ctx.email.trim().toLowerCase() !== email.trim().toLowerCase()) return null
  return ctx
}
