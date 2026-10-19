/**
 * "Remember me" support.
 *
 * The local session lives in IndexedDB, which survives a browser/app restart.
 * When "Remember me" is OFF we still create the session (so the current visit
 * works), but we mark it ephemeral via `sessionStorage`: that marker is cleared
 * when the tab / browser session ends, so on the next launch the persisted
 * session is discarded and the user must sign in again. A normal page refresh
 * keeps it, because the marker survives a reload within the same tab.
 *
 * Internal key intentionally keeps the legacy `cpos:` prefix — renaming stored
 * keys would orphan existing client state.
 */
const EPHEMERAL_KEY = 'cpos:ephemeral-session'

export function markEphemeralSession(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(EPHEMERAL_KEY, '1')
  } catch {
    /* storage unavailable — fall back to the persistent behaviour */
  }
}

export function hasEphemeralSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(EPHEMERAL_KEY) === '1'
  } catch {
    return false
  }
}

export function clearEphemeralSession(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(EPHEMERAL_KEY)
  } catch {
    /* ignore */
  }
}
