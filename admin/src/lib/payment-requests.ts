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
      '*, user:profiles(id, full_name, email, business_name), plan:subscription_plans(id, name, duration_days, price)'
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

/** Reads the configured GCash QR image URL (empty string when unset). */
export async function fetchGcashQrUrl(): Promise<string> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', GCASH_QR_SETTING_KEY)
    .maybeSingle()
  if (error) throw new Error(errorMessage(error))
  const value = data?.value as { url?: string } | null | undefined
  return value?.url?.trim() ?? ''
}

/** Replaces the QR image asset and points the system setting at its public URL. */
export async function setGcashQrFromFile(file: File): Promise<string> {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const path = `gcash-qr-${Date.now()}-${safeName}`
  const { error: upErr } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (upErr) throw new Error(errorMessage(upErr))
  const publicUrl = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: GCASH_QR_SETTING_KEY,
        value: { url: publicUrl },
        description: 'GCash QR code image URL shown on the POS client subscription payment page.',
      },
      { onConflict: 'key' }
    )
  if (error) throw new Error(errorMessage(error))
  return publicUrl
}

/** Points the QR setting at an external URL (no upload). */
export async function setGcashQrUrl(url: string): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: GCASH_QR_SETTING_KEY,
        value: { url: url.trim() },
        description: 'GCash QR code image URL shown on the POS client subscription payment page.',
      },
      { onConflict: 'key' }
    )
  if (error) throw new Error(errorMessage(error))
}
