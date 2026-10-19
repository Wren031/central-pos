import { supabase, supabaseConfigured } from '@/lib/supabase'
import { isOnline } from '@/offline/connectivity'
import { newId, nowIso } from '@/database/repos/helpers'
import {
  activatePlanFromServer,
} from '@/database/repos/subscription'
import {
  addNotification,
  persistPaymentRequest,
  reconcileServerRequest,
  type ServerPaymentRequest,
} from '@/database/repos/payment-requests'
import type { AppNotification, PaymentRequest, PlanRecord } from '@/lib/types'

/**
 * Manual GCash payment flow. Submissions and status checks require an internet
 * connection AND Supabase to be configured — there is no offline fallback that
 * would let a stale plan be purchased or a payment "self-approve".
 *
 * Nothing here activates a subscription. Only Supabase approving a request
 * (admin_approve_payment_request) can do that, and `refreshPaymentStatuses`
 * merely mirrors the result locally.
 */

const ONLINE_REQUIRED =
  'You need an internet connection to submit a GCash payment. Reconnect and try again.'
const NOT_CONFIGURED =
  'Payments are not configured on this build. Contact support to activate your subscription.'

/** Turn Supabase/PostgREST plain-object errors into a user-facing message. */
function errorMessage(err: unknown, fallback = 'Could not submit your payment.'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  const e = err as { message?: string; error_description?: string; hint?: string } | null
  if (e && typeof e === 'object') {
    if (e.message) return e.message
    if (e.error_description) return e.error_description
    if (e.hint) return e.hint
  }
  return fallback
}

/** Stable cross-device client identifier for a payment submission. */
export function clientIdFor(email: string): string {
  return email.trim().toLowerCase()
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}

/** Upload a receipt image into the private payment-proofs bucket. */
async function uploadProof(dataUrl: string): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl)
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `anon/${rand}.jpg`
  const { error } = await supabase.storage
    .from('payment-proofs')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(errorMessage(error, 'Could not upload your receipt image.'))
  return path
}

export interface SubmitGcashPaymentInput {
  userId: string
  email: string
  fullName: string
  businessName: string
  plan: PlanRecord
  referenceNo: string
  notes?: string
  proofImage?: string | null
}

/**
 * Submit a manual GCash payment. Uploads the optional receipt, then calls the
 * `submit_payment_request` RPC (always writes status='pending', amount pinned
 * to the plan's current price). Returns the local mirror record.
 */
export async function submitGcashPayment(input: SubmitGcashPaymentInput): Promise<PaymentRequest> {
  if (!supabaseConfigured) throw new Error(NOT_CONFIGURED)
  if (!isOnline()) throw new Error(ONLINE_REQUIRED)

  const referenceNo = input.referenceNo.trim()
  if (referenceNo.length < 4) {
    throw new Error('Enter the GCash transaction reference number (at least 4 characters).')
  }

  let proofPath: string | null = null
  if (input.proofImage) {
    proofPath = await uploadProof(input.proofImage)
  }

  const { data, error } = await supabase.rpc('submit_payment_request', {
    p_client_user_id: clientIdFor(input.email),
    p_plan_id: input.plan.id,
    p_reference_no: referenceNo,
    p_submitter_name: input.fullName,
    p_submitter_email: input.email,
    p_business_name: input.businessName,
    p_notes: input.notes?.trim() || null,
    p_proof_path: proofPath,
  })
  if (error) throw new Error(errorMessage(error))

  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; reference_no: string; amount: number | string; plan_id: string | null }
    | null
  if (!row?.id) throw new Error('The payment was saved but the response was unreadable.')

  return persistPaymentRequest({
    userId: input.userId,
    plan: row.plan_id ?? input.plan.id,
    planName: input.plan.name,
    amount: Number(row.amount),
    referenceNo: row.reference_no ?? referenceNo,
    notes: input.notes?.trim() ?? '',
    proofImage: input.proofImage ?? null,
    proofPath,
    remoteId: row.id,
  })
}

export interface RefreshPaymentResult {
  /** False when offline / unconfigured — nothing was checked. */
  checked: boolean
  approved: number
  rejected: number
}

/**
 * Pull the status of this client's submissions from Supabase and mirror the
 * result locally. An `approved` row activates/extends the local subscription;
 * a `rejected` row only records the reason. Online-only; a no-op offline.
 */
export async function refreshPaymentStatuses(
  userId: string,
  email: string
): Promise<RefreshPaymentResult> {
  if (!supabaseConfigured || !isOnline()) {
    return { checked: false, approved: 0, rejected: 0 }
  }

  try {
    const { data, error } = await supabase.rpc('client_payment_requests', {
      p_client_user_id: clientIdFor(email),
    })
    if (error) throw new Error(errorMessage(error, 'Could not check your payment status.'))

    const rows = (Array.isArray(data) ? data : []) as ServerPaymentRequest[]
    let approved = 0
    let rejected = 0

    for (const server of rows) {
      const { approved: justApproved, rejected: justRejected } = await reconcileServerRequest(
        userId,
        server
      )
      if (justApproved) {
        approved++
        if (justApproved.expires_at) {
          await activatePlanFromServer({
            userId,
            planId: justApproved.plan_id ?? 'unknown',
            planName: justApproved.plan_name ?? 'Subscription',
            durationDays: justApproved.duration_days ?? 0,
            expiresAt: justApproved.expires_at,
            amount: Number(justApproved.amount),
            reference: justApproved.reference_no,
          })
        }
        await addNotification(notification(userId, 'payment_approved', justApproved))
      } else if (justRejected) {
        rejected++
        await addNotification(notification(userId, 'payment_rejected', justRejected))
      }
    }

    return { checked: true, approved, rejected }
  } catch (err) {
    console.error('[subscription-payment] status refresh failed', err)
    return { checked: true, approved: 0, rejected: 0 }
  }
}

function notification(
  userId: string,
  kind: 'payment_approved' | 'payment_rejected',
  row: ServerPaymentRequest
): AppNotification {
  return {
    id: newId('ntf'),
    userId,
    kind,
    title: kind === 'payment_approved' ? 'Payment approved' : 'Payment rejected',
    body:
      kind === 'payment_approved'
        ? `Your GCash payment (${row.reference_no}) was approved. Your ${row.plan_name ?? 'plan'} subscription is now active.`
        : `Your GCash payment (${row.reference_no}) was rejected.${
            row.rejection_reason ? ` Reason: ${row.rejection_reason}` : ''
          }`,
    read: false,
    createdAt: nowIso(),
  }
}
