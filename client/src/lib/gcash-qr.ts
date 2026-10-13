/**
 * GCash QR image configuration.
 *
 * The real GCash QR is owned and updated by administrators (they upload it in
 * the admin dashboard and set its URL). This module never generates or
 * fabricates a QR code — when no URL is configured the payment page shows a
 * clear "not configured" notice instead of a fake code.
 *
 * Resolution order:
 *   1. VITE_GCASH_QR_URL   — configurable at build time, no code change needed
 *   2. /gcash-qr.png       — optional image bundled under client/public/
 */
const ENV_QR_URL = (import.meta.env.VITE_GCASH_QR_URL as string | undefined)?.trim()

export const GCASH_QR_FALLBACK_PATH = '/gcash-qr.png'

export const GCASH_QR_URL: string | null = ENV_QR_URL && ENV_QR_URL.length > 0 ? ENV_QR_URL : null

export function hasConfiguredGcashQr(): boolean {
  return GCASH_QR_URL !== null
}
