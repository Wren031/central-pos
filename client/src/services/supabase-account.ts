import { createLocalAccountFromCloud, isEmailRegistered } from '@/database/repos/auth'
import { isOnline } from '@/offline/connectivity'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { AuthFlowError } from '@/services/auth-service'
import { isAccountDeleted } from '@/lib/deleted-accounts'
import {
  readCloudStoreConfig,
  type CloudStoreConfig,
} from '@/services/cloud-store-config-service'
import type { User } from '@/lib/types'

/**
 * Repairs the "created in Supabase but can't sign in locally" case.
 *
 * Registration creates the Supabase account first (to send the confirmation
 * link) and the LOCAL account only after the email is confirmed. If a user
 * confirmed on another device, abandoned registration before the redirect
 * finished, or cleared browser data — they may have no local record to sign in
 * with.
 *
 * As an online-only fallback, we re-authenticate against Supabase. When the
 * credentials are valid AND the email is confirmed AND no local account exists
 * yet, we recreate the local IDENTITY from the metadata captured at signup.
 *
 * IMPORTANT: this must not pretend the account is brand new. The cloud store
 * configuration is read in the same transient session and returned to the
 * caller so the login flow can show "This account already exists." and offer to
 * restore the workspace instead of silently onboarding (and re-choosing a POS
 * type). No store is created here, and the cloud subscription (when present)
 * is mirrored instead of granting a fresh trial.
 *
 * Returns null when Supabase rejects the credentials (caller rethrows the
 * original local error) or when we're offline/not configured.
 */
export interface HealLocalAccountResult {
  user: User
  cloud: CloudStoreConfig
}

export async function healLocalAccountViaSupabase(
  email: string,
  password: string
): Promise<HealLocalAccountResult | null> {
  if (!isOnline() || !supabaseConfigured) return null

  const normalized = email.trim().toLowerCase()

  // Never resurrect an account the user deliberately deleted on this device.
  if (isAccountDeleted(normalized)) return null

  let result
  try {
    result = await supabase.auth.signInWithPassword({ email: normalized, password })
  } catch {
    return null
  }
  if (result.error || !result.data.user) return null

  const supaUser = result.data.user
  if (!supaUser.email_confirmed_at) {
    throw new AuthFlowError(
      'invalid',
      'Your email is not confirmed yet. Click the confirmation link we emailed you to finish signing up.'
    )
  }

  // A local account exists but its stored password did not match — do not
  // silently rewrite credentials the user may have changed.
  if (await isEmailRegistered(normalized)) {
    await supabase.auth.signOut().catch(() => {})
    return null
  }

  try {
    // Read the account's existing configuration while the session is live.
    const cloud = await readCloudStoreConfig()
    const meta = (supaUser.user_metadata ?? {}) as Record<string, string | undefined>
    const sub = cloud.subscription

    const local = await createLocalAccountFromCloud({
      fullName: meta.full_name?.trim() || normalized.split('@')[0],
      address: meta.address?.trim() || '',
      contactNumber: meta.contact_number?.trim() || '',
      businessName:
        cloud.store?.name?.trim() || meta.business_name?.trim() || meta.full_name?.trim() || '',
      email: normalized,
      password,
      subscription:
        sub && sub.expiresAt
          ? {
              plan: sub.planId,
              startedAt: sub.startedAt ?? new Date().toISOString(),
              expiresAt: sub.expiresAt,
              pricePaid: sub.pricePaid,
            }
          : undefined,
    })

    return { user: local, cloud }
  } finally {
    await supabase.auth.signOut().catch(() => {})
  }
}
