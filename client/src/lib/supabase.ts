import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client for the POS app.
 *
 * Used ONLY for real email-verification during registration: signUp sends a
 * confirmation link, the user clicks it, and the /auth/confirm route reads the
 * confirmed session back. The POS workspace keeps its existing local/offline
 * authentication and data model, so this client does NOT persist a session —
 * it stays a transient helper and never interferes with the local login flow.
 *
 * Only the anon / publishable key belongs here. It is safe for the browser
 * because every table is protected by Row Level Security. NEVER put the
 * service_role key in a VITE_ variable.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(
  url ?? 'https://invalid.supabase.co',
  anonKey ?? 'invalid-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      // Parse the confirmation-link redirect (hash tokens / PKCE code) so the
      // /auth/confirm route can read the confirmed session.
      detectSessionInUrl: true,
    },
  }
)

/** Throws a clear error when registration is attempted without config. */
export function requireSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      'Email verification is not configured. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    )
  }
  return supabase
}
