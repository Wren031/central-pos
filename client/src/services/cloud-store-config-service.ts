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

/**
 * True while a short-lived Supabase session is intentionally kept in memory so
 * the restore screen can retry a failed workspace lookup. Never persisted.
 */
let sessionRetained = false
let retainTimer: ReturnType<typeof setTimeout> | null = null

function clearRetainTimer(): void {
  if (retainTimer !== null) {
    clearTimeout(retainTimer)
    retainTimer = null
  }
}

export function isTransientSessionRetained(): boolean {
  return sessionRetained
}

/** Keep the current in-memory session (5-minute cap) so /restore can retry. */
export function retainCurrentSession(): void {
  sessionRetained = true
  clearRetainTimer()
  retainTimer = setTimeout(() => {
    void releaseTransientSession()
  }, 5 * 60_000)
}

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

/**
 * Outcome of a cloud-config lookup.
 *
 * `empty` is authoritative: the server answered and the account has NO store
 * row (a genuinely new account). `unavailable` means the answer is unknown —
 * offline, not configured, timed out, or rejected. Callers must never treat an
 * unavailable lookup as "new account": doing so is what sent existing users
 * through onboarding and created duplicate workspaces.
 */
export type CloudConfigStatus = 'found' | 'empty' | 'unavailable'

export interface CloudStoreConfig {
  status: CloudConfigStatus
  found: boolean
  store: CloudStoreInfo | null
  subscription: CloudSubscriptionSummary | null
  /** Human-readable reason when `status` is `unavailable`. */
  error: string | null
}

export const EMPTY_CLOUD_CONFIG: CloudStoreConfig = {
  status: 'empty',
  found: false,
  store: null,
  subscription: null,
  error: null,
}

export function unavailableCloudConfig(reason: string): CloudStoreConfig {
  return { status: 'unavailable', found: false, store: null, subscription: null, error: reason }
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
    status: 'found',
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
    error: null,
  }
}

/** Is cloud config usable from this device right now? */
export function canUseCloudConfig(): boolean {
  return supabaseConfigured && isOnline()
}

/**
 * Read the CALLER'S store config. MUST be called while a Supabase session is
 * active (see `withTransientSession` / `acquireTransientSession`).
 *
 * Never throws: an unreachable server returns `status: 'unavailable'` so the
 * caller can show a retry instead of mistaking the account for a new one.
 */
export async function readCloudStoreConfig(): Promise<CloudStoreConfig> {
  if (!supabaseConfigured) {
    return unavailableCloudConfig('Cloud sync is not configured on this build.')
  }
  if (!isOnline()) {
    return unavailableCloudConfig(
      'You are offline, so the saved workspace could not be verified.'
    )
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('client_store_config'),
      RPC_TIMEOUT_MS
    )
    if (error) {
      console.warn('[cloud-store-config] read failed', error.message)
      return unavailableCloudConfig(
        errorMessage(error, 'Could not read the saved workspace configuration.')
      )
    }
    return normalize(data as RawConfigRow | null)
  } catch (err) {
    console.warn('[cloud-store-config] read failed', err)
    return unavailableCloudConfig(
      errorMessage(err, 'The workspace configuration check timed out.')
    )
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
 * Start a short-lived Supabase session. Returns false when the credentials are
 * rejected or Supabase is not configured. The caller MUST release it.
 */
export async function acquireTransientSession(email: string, password: string): Promise<boolean> {
  if (!supabaseConfigured) return false
  const normalized = email.trim().toLowerCase()
  try {
    const signIn = await supabase.auth.signInWithPassword({ email: normalized, password })
    const ok = !signIn.error && Boolean(signIn.data.user)
    if (ok) {
      // A new sign-in owns the (single) in-memory session.
      sessionRetained = false
      clearRetainTimer()
    }
    return ok
  } catch {
    return false
  }
}

/** Drop the short-lived session started by `acquireTransientSession`. */
export async function releaseTransientSession(): Promise<void> {
  sessionRetained = false
  clearRetainTimer()
  try {
    await supabase.auth.signOut()
  } catch {
    /* best effort */
  }
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
  if (!(await acquireTransientSession(email, password))) return null
  try {
    return await fn()
  } finally {
    await releaseTransientSession()
  }
}

/**
 * Read the account's store config using the password captured at sign-in.
 *
 * When the lookup is `unavailable`, the short-lived session is deliberately
 * KEPT (in memory only — persistSession is false) so the /restore screen can
 * retry without asking the user to sign in again. `releaseRetainedSession`
 * must be called when restore finishes, on logout, or on unmount.
 */
export async function readCloudStoreConfigWithCredentials(
  email: string,
  password: string,
  options: { retainOnFailure?: boolean } = {}
): Promise<CloudStoreConfig> {
  if (!supabaseConfigured) {
    return unavailableCloudConfig('Cloud sync is not configured on this build.')
  }
  if (!isOnline()) {
    return unavailableCloudConfig(
      'You are offline, so the saved workspace could not be verified.'
    )
  }
  if (!(await acquireTransientSession(email, password))) {
    // Never leave a previous retained session around if this attempt failed.
    await releaseTransientSession()
    return unavailableCloudConfig(
      'We could not verify this account with Supabase. Use the password you originally registered with, then try again.'
    )
  }

  let cloud = unavailableCloudConfig('Could not read the saved workspace configuration.')
  try {
    cloud = await readCloudStoreConfig()
  } finally {
    const keep = options.retainOnFailure === true && cloud.status === 'unavailable'
    if (keep) {
      // In-memory only. The user can retry from /restore without re-signing in.
      retainCurrentSession()
    } else {
      await releaseTransientSession()
    }
  }
  return cloud
}

/** Retry the cloud lookup using the still-retained in-memory session. */
export async function retryCloudStoreConfig(): Promise<CloudStoreConfig> {
  if (!sessionRetained) {
    return unavailableCloudConfig(
      'The verification session expired. Sign in again to retry.'
    )
  }
  return readCloudStoreConfig()
}

/** Drop the retained session when the restore flow ends or the user signs out. */
export async function releaseRetainedSession(): Promise<void> {
  await releaseTransientSession()
}

/* ---------- transient hand-off to the /restore screen ---------- */

const RESTORE_KEY = 'cpos:restore-context'

/** What the login flow learned about an existing account on this device. */
export interface RestoreContext {
  email: string
  cloud: CloudStoreConfig
  /** True when the account is fully configured in the cloud (POS type known). */
  hasCloudStore: boolean
  /**
   * True when the cloud could not be checked (offline / timeout / rejected).
   * The restore screen offers a retry instead of assuming a new account.
   */
  unavailable?: boolean
  /** Why the lookup was unavailable, shown on the restore screen. */
  error?: string | null
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
    // Tolerate a hand-off written by an older build (no status/error fields).
    if (parsed.cloud.status !== 'found' && parsed.cloud.status !== 'unavailable') {
      parsed.cloud.status = parsed.cloud.found ? 'found' : 'empty'
    }
    if (typeof parsed.cloud.error !== 'string') parsed.cloud.error = null
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
