import { supabase, supabaseConfigured } from '@/lib/supabase'
import { isOnline } from '@/offline/connectivity'
import { markUserAccountStatus } from '@/database/repos/auth'
import { nowIso } from '@/database/repos/helpers'
import type { PersistedAccountStatus } from '@/lib/account-status'
import type { User } from '@/lib/types'

/**
 * Server-authoritative account status.
 *
 * The POS client holds no Supabase session (persistSession:false, anon key), so
 * it identifies itself by EMAIL and reads its status through the
 * `client_account_status` SECURITY DEFINER RPC (supabase/11_account_status.sql),
 * the same session-less pattern used for GCash payments.
 *
 * Every function here is best-effort and NEVER throws: a network failure must
 * degrade to "keep the last known status", never to an infinite spinner, a
 * logout loop, or a crash.
 */

/** Result of a single status lookup. */
export type AccountStatusOutcome =
  | 'active'
  | 'suspended'
  | 'not_found'
  | 'unknown'
  | 'error'
  | 'offline'

/** A lookup is abandoned after this long so a hung request can't wedge startup. */
const RPC_TIMEOUT_MS = 8000

/** Reject a promise if it does not settle within `ms`. */
function withTimeout<T>(thenable: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Account status check timed out.'))
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

/**
 * Read the account's current status from Supabase. Returns `offline` when there
 * is no connection or Supabase is not configured (nothing was checked).
 */
export async function fetchAccountStatus(email: string): Promise<AccountStatusOutcome> {
  if (!supabaseConfigured) return 'offline'
  if (!isOnline()) return 'offline'

  const normalized = email.trim().toLowerCase()
  if (!normalized) return 'not_found'

  try {
    const { data, error } = await withTimeout(
      supabase.rpc('client_account_status', { p_email: normalized }),
      RPC_TIMEOUT_MS
    )
    if (error) return 'error'

    const row = (data ?? null) as { found?: boolean; status?: string } | null
    if (!row || row.found !== true) return 'not_found'
    if (row.status === 'active') return 'active'
    if (row.status === 'suspended') return 'suspended'
    return 'unknown'
  } catch {
    return 'error'
  }
}

export interface AccountVerification {
  /** Best-known access status after this check. */
  status: 'active' | 'suspended' | 'unverified'
  /** True when the backend actually answered (the result is authoritative). */
  checked: boolean
}

/**
 * Verify a user's status and cache an authoritative result locally.
 *
 * - `active` / `suspended` are persisted so they survive refresh and offline.
 * - `not_found` / `unknown` reach the backend but are not definitive, so the
 *   account is reported as `unverified` (session preserved).
 * - offline / error keep the last known status and report `unverified`.
 */
export async function verifyAccountStatus(
  user: Pick<User, 'id' | 'email'>
): Promise<AccountVerification> {
  const outcome = await fetchAccountStatus(user.email)

  if (outcome === 'active' || outcome === 'suspended') {
    await persistStatus(user.id, outcome)
    return { status: outcome, checked: true }
  }

  if (outcome === 'not_found' || outcome === 'unknown') {
    return { status: 'unverified', checked: true }
  }

  // offline / error — nothing authoritative was learned.
  return { status: 'unverified', checked: false }
}

async function persistStatus(userId: string, status: PersistedAccountStatus): Promise<void> {
  try {
    await markUserAccountStatus(userId, status, nowIso())
  } catch {
    /* caching is best-effort; the caller still gets the verified result */
  }
}
