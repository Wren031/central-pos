/** Turn any thrown value into a user-facing message. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  const anyErr = err as { message?: string; error_description?: string; hint?: string } | null
  if (anyErr && typeof anyErr === 'object') {
    if (anyErr.message) return anyErr.message
    if (anyErr.error_description) return anyErr.error_description
    if (anyErr.hint) return anyErr.hint
  }
  return fallback
}

/** Strip characters that would break PostgREST `.or()` filters. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%"]/g, ' ').trim()
}
