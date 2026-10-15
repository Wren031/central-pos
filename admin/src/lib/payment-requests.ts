import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import type { PaymentRequest } from '@/lib/types'

/** Private bucket holding customer-submitted GCash receipts. */
export const PROOF_BUCKET = 'payment-proofs'
/** Public bucket holding the admin-managed GCash QR image. */
export const ASSET_BUCKET = 'payment-assets'
/** system_settings key holding the GCash QR image URL. */
export const GCASH_QR_SETTING_KEY = 'gcash_qr'

/** All payment requests, newest first, including submitter + plan joins. */
export async function fetchPaymentRequests(): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select(
      // `!user_id` disambiguates the FK: payment_requests has two FKs to
      // profiles (user_id and reviewed_by), so PostgREST needs the hint.
      '*, user:profiles!user_id(id, full_name, email, business_name), plan:subscription_plans(id, name, duration_days, price)'
    )
    .order('created_at', { ascending: false })
  if (error) throw new Error(errorMessage(error))
  return (data ?? []) as PaymentRequest[]
}

/**
 * Resolves a browser-facing URL for a proof image. Prefers an explicit URL;
 * otherwise mints a short-lived signed URL for the private object. Returns
 * null when the row carries no proof (never fabricates a link).
 */
export async function resolveProofHref(pr: PaymentRequest): Promise<string | null> {
  if (pr.proof_url) return pr.proof_url
  if (!pr.proof_path) return null
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(pr.proof_path, 60 * 60)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function approvePaymentRequest(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_approve_payment_request', {
    request_id: id,
    reason: reason?.trim() || null,
  })
  if (error) throw new Error(errorMessage(error))
}

export async function rejectPaymentRequest(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reject_payment_request', {
    request_id: id,
    reason,
  })
  if (error) throw new Error(errorMessage(error))
}

export async function linkPaymentRequest(id: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_link_payment_request', {
    request_id: id,
    target_user: userId,
  })
  if (error) throw new Error(errorMessage(error))
}

/** GCash QR configuration stored under the `gcash_qr` system setting. */
export interface GcashQrSetting {
  /** Public image URL, or '' when unset. */
  url: string
  /** When false the POS client shows a "not configured" notice. */
  active: boolean
}

/** Reads the configured GCash QR (url + active) from system_settings. */
export async function fetchGcashQr(): Promise<GcashQrSetting> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', GCASH_QR_SETTING_KEY)
    .maybeSingle()
  if (error) throw new Error(errorMessage(error))
  const value = data?.value as { url?: string; active?: boolean } | null | undefined
  return {
    url: value?.url?.trim() ?? '',
    active: value?.active ?? true,
  }
}

/** Merges a partial QR config into the `gcash_qr` system setting. */
async function writeGcashQr(patch: Partial<GcashQrSetting>): Promise<GcashQrSetting> {
  const current = await fetchGcashQr()
  const next: GcashQrSetting = {
    url: patch.url !== undefined ? patch.url.trim() : current.url,
    active: patch.active !== undefined ? patch.active : current.active,
  }
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: GCASH_QR_SETTING_KEY,
        value: next,
        description: 'GCash QR code image URL shown on the POS client subscription payment page.',
      },
      { onConflict: 'key' }
    )
  if (error) throw new Error(errorMessage(error))
  return next
}

/** Replaces the QR image asset and points the system setting at its public URL. */
export async function setGcashQrFromFile(file: File): Promise<GcashQrSetting> {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const path = `gcash-qr-${Date.now()}-${safeName}`
  const { error: upErr } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (upErr) throw new Error(errorMessage(upErr))
  const publicUrl = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
  return writeGcashQr({ url: publicUrl, active: true })
}

/** Points the QR setting at an external URL (no upload). */
export async function setGcashQrUrl(url: string): Promise<GcashQrSetting> {
  return writeGcashQr({ url })
}

/** Toggles whether the POS client may show the configured QR. */
export async function setGcashQrActive(active: boolean): Promise<GcashQrSetting> {
  return writeGcashQr({ active })
}

