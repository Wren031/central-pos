/**
 * Display initials for a person's name.
 *
 * Uses the FIRST and LAST name parts, ignoring middle names, so
 * "Renie Montero Javier" → "RJ" (not "RM").
 */
export function personInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return `${first}${last}`.toUpperCase() || 'U'
}
