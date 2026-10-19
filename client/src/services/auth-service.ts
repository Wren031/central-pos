import { supabase, requireSupabase } from '@/lib/supabase'
import { isOnline } from '@/offline/connectivity'

/**
 * REAL email verification via Supabase Auth — confirmation LINK flow.
 *
 * `startSignup` asks Supabase to create the account and email a confirmation
 * link. The user clicks it; Supabase confirms the email and redirects back to
 * /auth/confirm, where `readConfirmedUserFromRedirect` returns the confirmed
 * session. The frontend never generates or stores any verification code, and
 * confirmation is only ever trusted when Supabase reports it.
 */

export interface SignupDetails {
  fullName: string
  address: string
  contactNumber: string
  businessName: string
  email: string
  password: string
}

export type AuthFailureKind =
  | 'offline'
  | 'config'
  | 'invalid'
  | 'expired'
  | 'rate_limit'
  | 'duplicate'
  | 'weak_password'
  | 'network'
  | 'unknown'

export class AuthFlowError extends Error {
  readonly kind: AuthFailureKind
  constructor(kind: AuthFailureKind, message: string) {
    super(message)
    this.name = 'AuthFlowError'
    this.kind = kind
  }
}

const OFFLINE_MESSAGE =
  'You are offline. Connect to the internet to register and confirm your email.'

function ensureOnline(): void {
  if (!isOnline()) throw new AuthFlowError('offline', OFFLINE_MESSAGE)
}

interface SupabaseAuthError {
  message?: string
  code?: string
  status?: number
}

function classifyAuthError(error: SupabaseAuthError): AuthFlowError {
  const code = (error.code ?? '').toLowerCase()
  const message = (error.message ?? '').toLowerCase()
  const status = error.status

  if (
    code.includes('rate_limit') ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many')
  ) {
    return new AuthFlowError(
      'rate_limit',
      'Supabase’s email sending limit was reached, so no email was sent. Wait a few minutes and try again — or ask an administrator to configure custom SMTP in the Supabase dashboard for reliable delivery.'
    )
  }

  if (code === 'otp_expired' || message.includes('expired')) {
    return new AuthFlowError(
      'expired',
      'That confirmation link has expired. Request a new one from the sign-up page.'
    )
  }

  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('already confirmed')
  ) {
    return new AuthFlowError(
      'duplicate',
      'An account with this email already exists. Try signing in instead.'
    )
  }

  if (code === 'weak_password' || message.includes('password should')) {
    return new AuthFlowError(
      'weak_password',
      'That password is too weak. Use at least 8 characters with letters and numbers.'
    )
  }

  if (
    code === 'invalid_credentials' ||
    code === 'validation_failed' ||
    code === 'otp_disabled' ||
    message.includes('invalid') ||
    message.includes('token')
  ) {
    return new AuthFlowError(
      'invalid',
      'That confirmation link is invalid or has already been used. Request a new one and try again.'
    )
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('failed to fetch')) {
    return new AuthFlowError('network', 'Network error. Check your connection and try again.')
  }

  return new AuthFlowError('unknown', error.message || 'Something went wrong. Please try again.')
}

/** Supabase reports an existing unconfirmed/confirmed user with empty identities. */
function isDuplicateSignupResponse(identities: unknown[] | null | undefined): boolean {
  return Array.isArray(identities) && identities.length === 0
}

/** Absolute URL Supabase should redirect the confirmation link back to. */
export function confirmationRedirectUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/auth/confirm`
}

/**
 * Creates the Supabase account and triggers the confirmation email.
 * Requires an internet connection.
 */
export async function startSignup(details: SignupDetails): Promise<void> {
  ensureOnline()
  const client = requireSupabase()

  let result
  try {
    result = await client.auth.signUp({
      email: details.email.trim().toLowerCase(),
      password: details.password,
      options: {
        emailRedirectTo: confirmationRedirectUrl(),
        data: {
          full_name: details.fullName.trim(),
          business_name: details.businessName.trim(),
          contact_number: details.contactNumber.trim(),
          address: details.address.trim(),
        },
      },
    })
  } catch (err) {
    throw classifyAuthError(err as SupabaseAuthError)
  }

  if (result.error) throw classifyAuthError(result.error)

  const user = result.data.user
  if (!user) {
    throw new AuthFlowError('unknown', 'Supabase did not return an account. Please try again.')
  }

  // Supabase returns no error for an email that already exists (to avoid
  // account enumeration) — it yields a user with no identities. Resend the
  // confirmation link; if the account is already confirmed, that fails and the
  // real reason is surfaced (usually "already exists — sign in").
  if (isDuplicateSignupResponse(user.identities)) {
    await resendConfirmation(details.email)
    return
  }

  // Fresh signup. If Supabase already marked the email confirmed (or returned a
  // session), "Confirm email" is switched OFF on the project — so NO
  // verification email is ever sent. Surface that clearly instead of leaving the
  // user on an endless "check your email" screen.
  if (result.data.session || user.email_confirmed_at) {
    throw new AuthFlowError(
      'config',
      'Email confirmation is turned off for this Supabase project, so no verification email is sent. Ask an administrator to enable “Confirm email” in Authentication → Providers → Email.'
    )
  }
}

/** Re-sends the confirmation email. Requires an internet connection. */
export async function resendConfirmation(email: string): Promise<void> {
  ensureOnline()
  const client = requireSupabase()

  let result
  try {
    result = await client.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: confirmationRedirectUrl() },
    })
  } catch (err) {
    throw classifyAuthError(err as SupabaseAuthError)
  }

  if (result.error) throw classifyAuthError(result.error)
}

export interface RedirectResult {
  email: string
  confirmed: boolean
}

function decode(text: string | null): string {
  if (!text) return ''
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

/**
 * Reads the confirmation link's redirect. Supabase (with detectSessionInUrl)
 * parses the session from the URL; we also handle a PKCE `?code=` and any
 * explicit link error. Only Supabase's own `email_confirmed_at` is trusted.
 */
export async function readConfirmedUserFromRedirect(): Promise<RedirectResult> {
  const client = requireSupabase()

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)

  const errCode = hash.get('error') ?? query.get('error')
  if (errCode) {
    const description = decode(hash.get('error_description') ?? query.get('error_description'))
    throw new AuthFlowError(
      errCode.toLowerCase().includes('expired') ? 'expired' : 'invalid',
      description ||
        'This confirmation link is invalid or has expired. Please sign up again or request a new link.'
    )
  }

  let session = (await client.auth.getSession()).data.session

  // PKCE flow: exchange the ?code= for a session.
  if (!session) {
    const code = query.get('code')
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code)
      if (error) throw classifyAuthError(error)
      session = data.session
    }
  }

  // Implicit flow fallback: if Supabase's URL detection didn't run, adopt the
  // tokens straight from the hash.
  if (!session) {
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (accessToken && refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) throw classifyAuthError(error)
      session = data.session
    }
  }

  const user = session?.user ?? null
  if (!user?.email) return { email: '', confirmed: false }
  return { email: user.email, confirmed: Boolean(user.email_confirmed_at) }
}

/** Drops the transient Supabase session (local auth stays the source of truth). */
export async function signOutSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    /* best effort */
  }
}

export function authErrorMessage(err: unknown): { kind: AuthFailureKind; message: string } {
  if (err instanceof AuthFlowError) return { kind: err.kind, message: err.message }
  if (err instanceof Error && err.message) return { kind: 'unknown', message: err.message }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' }
}
