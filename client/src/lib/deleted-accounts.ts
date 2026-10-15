/**
 * Local tombstones for accounts the user has DELETED on this device.
 *
 * The authoritative deletion happens server-side (`delete_my_account` in
 * 13_delete_my_account.sql). This marker is a local safety net: it stops the
 * Supabase "heal" fallback from silently re-creating a deleted account if the
 * cloud row somehow still exists (pure-local account, a failed server call, or
 * a device that was offline at delete time). It is cleared the moment the user
 * deliberately signs up again with the same email.
 *
 * Stored in localStorage so it survives a reload and is readable before the
 * database boots.
 */

const DELETED_KEY = 'cpos:deleted-accounts'

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(DELETED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map((e) => String(e).toLowerCase()) : [])
  } catch {
    return new Set()
  }
}

function writeSet(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DELETED_KEY, JSON.stringify([...set]))
  } catch {
    /* storage unavailable — server-side deletion still protects the account */
  }
}

export function isAccountDeleted(email: string): boolean {
  return readSet().has(email.trim().toLowerCase())
}

export function markAccountDeleted(email: string): void {
  const set = readSet()
  set.add(email.trim().toLowerCase())
  writeSet(set)
}

export function clearAccountDeleted(email: string): void {
  const set = readSet()
  if (set.delete(email.trim().toLowerCase())) writeSet(set)
}
