/**
 * Account-status domain (shared by the auth context, guards, login UI and the
 * Supabase account-status service).
 *
 * The POS client authenticates LOCALLY (Dexie/IndexedDB). `profiles.status`
 * in Supabase is the authoritative source of truth, so an account can be
 * suspended by an administrator at any time — this module gives the client a
 * single vocabulary to reason about and display that state.
 */

/** The exact, required copy shown whenever an account is suspended. */
export const ACCOUNT_SUSPENDED_MESSAGE =
  'Your account has been suspended. Please contact the administrator for assistance.'

/** A status the client may PERSIST from a verified server response. */
export type PersistedAccountStatus = 'active' | 'suspended'

/**
 * The full set of access states the UI reacts to:
 *  - `active`      verified active against Supabase (authoritative)
 *  - `suspended`   suspended (verified online, or cached from a prior response)
 *  - `unverified`  allowed to use the POS offline-first, but the current status
 *                  could not be confirmed (never checked, or the check failed)
 *  - `unknown`     no signed-in user
 */
export type AccountAccessStatus = 'active' | 'suspended' | 'unverified' | 'unknown'

/**
 * Thrown when a sign-in is denied because the account is suspended. Carries the
 * exact `ACCOUNT_SUSPENDED_MESSAGE` so callers can surface it verbatim.
 */
export class AccountSuspendedError extends Error {
  constructor(message: string = ACCOUNT_SUSPENDED_MESSAGE) {
    super(message)
    this.name = 'AccountSuspendedError'
  }
}

/**
 * Persistent "this device was signed out for suspension" marker (email).
 *
 * Stored in localStorage (not IndexedDB) so it can be read before the database
 * boots, which lets the block screen show immediately on a reload instead of
 * flashing the login page. It is self-healing: the app re-checks the marker's
 * email against Supabase and clears it as soon as the account is active again,
 * and the user can always clear it by acknowledging the block.
 */
const SUSPENDED_MARKER_KEY = 'cpos:account-suspended'

export function readSuspendedMarker(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(SUSPENDED_MARKER_KEY)
  } catch {
    return null
  }
}

export function writeSuspendedMarker(email: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SUSPENDED_MARKER_KEY, email.trim().toLowerCase())
  } catch {
    /* storage unavailable — the in-memory block still applies for this session */
  }
}

export function clearSuspendedMarker(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SUSPENDED_MARKER_KEY)
  } catch {
    /* ignore */
  }
}
