import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { PLAN_PRICES } from '@/lib/plan-constants'
import type { AppNotification, PaymentRequest, PaymentRequestStatus, PlanId } from '@/lib/types'

export function getPaymentRequests(userId: string): PaymentRequest[] {
  return getCache()
    .paymentRequests.filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getPendingPaymentRequest(userId: string): PaymentRequest | null {
  return getPaymentRequests(userId).find((r) => r.status === 'pending') ?? null
}

export interface SubmitPaymentRequestInput {
  userId: string
  plan: Exclude<PlanId, 'trial'>
  referenceNo: string
  notes?: string
  proofImage?: string | null
}

/**
 * Records a GCash payment proof LOCALLY and queues it for the (mock) sync
 * pipeline. It deliberately does NOT touch the subscription — activation only
 * ever happens after an administrator approves the request on the backend.
 */
export async function submitPaymentRequest(
  input: SubmitPaymentRequestInput
): Promise<PaymentRequest> {
  const referenceNo = input.referenceNo.trim()
  if (referenceNo.length < 4) {
    throw new Error('Enter the GCash transaction reference number (at least 4 characters).')
  }

  const existing = getPaymentRequests(input.userId)
  if (existing.some((r) => r.status !== 'rejected' && r.referenceNo === referenceNo)) {
    throw new Error('That transaction reference has already been submitted.')
  }

  const request: PaymentRequest = {
    id: newId('pay'),
    userId: input.userId,
    plan: input.plan,
    amount: PLAN_PRICES[input.plan],
    referenceNo,
    notes: (input.notes ?? '').trim(),
    proofImage: input.proofImage ?? null,
    status: 'pending',
    rejectionReason: null,
    createdAt: nowIso(),
    reviewedAt: null,
  }

  await db.transaction('rw', db.paymentRequests, db.syncQueue, async () => {
    await db.paymentRequests.put(request)
    await putSyncOp(
      syncOpFor('paymentRequest', request.id, 'create', undefined, {
        plan: request.plan,
        amount: request.amount,
        referenceNo: request.referenceNo,
        hasProof: Boolean(request.proofImage),
      })
    )
  })
  patchCache({
    paymentRequests: [request, ...getCache().paymentRequests],
  })
  notifySyncQueueChanged()
  return request
}

/**
 * Applies an administrator's review decision to the local record. Called by a
 * future real sync adapter when the backend resolves a submission; the UI
 * itself never changes a request's status, so nothing self-approves.
 */
export async function applyPaymentReview(
  requestId: string,
  status: Exclude<PaymentRequestStatus, 'pending'>,
  rejectionReason?: string
): Promise<void> {
  const existing = getCache().paymentRequests.find((r) => r.id === requestId)
  if (!existing) return
  const reviewedAt = nowIso()
  const notification: AppNotification = {
    id: newId('ntf'),
    userId: existing.userId,
    kind: status === 'approved' ? 'payment_approved' : 'payment_rejected',
    title: status === 'approved' ? 'Payment approved' : 'Payment rejected',
    body:
      status === 'approved'
        ? `Your GCash payment (${existing.referenceNo}) was approved. Your subscription is now active.`
        : `Your GCash payment (${existing.referenceNo}) was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
    read: false,
    createdAt: reviewedAt,
  }
  await db.transaction('rw', db.paymentRequests, db.notifications, db.syncQueue, async () => {
    await db.paymentRequests.update(requestId, {
      status,
      rejectionReason: status === 'rejected' ? rejectionReason ?? null : null,
      reviewedAt,
    })
    await db.notifications.put(notification)
    await putSyncOp(syncOpFor('paymentRequest', requestId, 'update', undefined, { status }))
  })
  patchCache({
    paymentRequests: getCache().paymentRequests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status,
            rejectionReason: status === 'rejected' ? rejectionReason ?? null : null,
            reviewedAt,
          }
        : r
    ),
    notifications: [notification, ...getCache().notifications],
  })
  notifySyncQueueChanged()
}

export type { PaymentRequest, PaymentRequestStatus }
