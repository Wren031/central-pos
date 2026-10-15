import { db } from '../schema'
import { getCache, patchCache } from '../cache'
import { newId, nowIso, syncOpFor, putSyncOp } from './helpers'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import type { AppNotification, PaymentRequest, PaymentRequestStatus } from '@/lib/types'

export function getPaymentRequests(userId: string): PaymentRequest[] {
  return getCache()
    .paymentRequests.filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getPendingPaymentRequest(userId: string): PaymentRequest | null {
  return getPaymentRequests(userId).find((r) => r.status === 'pending') ?? null
}

export interface NewPaymentRequestInput {
  userId: string
  plan: string
  planName: string
  amount: number
  referenceNo: string
  notes: string
  proofImage: string | null
  proofPath: string | null
  remoteId: string
}

/**
 * Persist the local mirror of a payment submission that has already been
 * accepted by Supabase. The remote row is the source of truth — this record
 * exists so the UI can render before the next status refresh.
 */
export async function persistPaymentRequest(input: NewPaymentRequestInput): Promise<PaymentRequest> {
  const record: PaymentRequest = {
    id: newId('pay'),
    userId: input.userId,
    plan: input.plan,
    planName: input.planName,
    amount: input.amount,
    referenceNo: input.referenceNo,
    notes: input.notes,
    proofImage: input.proofImage,
    proofPath: input.proofPath,
    remoteId: input.remoteId,
    status: 'pending',
    rejectionReason: null,
    createdAt: nowIso(),
    reviewedAt: null,
  }

  await db.transaction('rw', db.paymentRequests, db.syncQueue, async () => {
    await db.paymentRequests.put(record)
    await putSyncOp(
      syncOpFor('paymentRequest', record.id, 'create', undefined, {
        plan: record.plan,
        amount: record.amount,
        referenceNo: record.referenceNo,
        hasProof: Boolean(record.proofImage),
      })
    )
  })
  patchCache({ paymentRequests: [record, ...getCache().paymentRequests] })
  notifySyncQueueChanged()
  return record
}

/** A single row from the `client_payment_requests()` RPC. */
export interface ServerPaymentRequest {
  id: string
  reference_no: string
  plan_id: string | null
  plan_name: string | null
  duration_days: number | null
  amount: number | string
  status: PaymentRequestStatus
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
  expires_at: string | null
  subscription_status: string | null
}

export interface ReconcileResult {
  /** Set when this merge first moved the request to 'approved'. */
  approved: ServerPaymentRequest | null
  /** Set when this merge first moved the request to 'rejected'. */
  rejected: ServerPaymentRequest | null
}

/**
 * Merge one server row into the local mirror (matched by remote id, then by
 * reference number). Records that originated on another device are created
 * locally so the customer still sees them. Never activates a subscription —
 * the caller does that from the returned `approved` row.
 */
export async function reconcileServerRequest(
  userId: string,
  server: ServerPaymentRequest
): Promise<ReconcileResult> {
  const existing =
    getCache().paymentRequests.find((r) => r.remoteId === server.id) ??
    getCache().paymentRequests.find(
      (r) => r.userId === userId && r.referenceNo === server.reference_no
    ) ??
    null

  const nextStatus = server.status
  const changed = !existing || existing.status !== nextStatus
  const reviewedAt = server.reviewed_at ?? null

  if (!existing) {
    const record: PaymentRequest = {
      id: newId('pay'),
      userId,
      plan: server.plan_id ?? 'unknown',
      planName: server.plan_name ?? undefined,
      amount: Number(server.amount),
      referenceNo: server.reference_no,
      notes: '',
      proofImage: null,
      proofPath: null,
      remoteId: server.id,
      status: nextStatus,
      rejectionReason: server.rejection_reason,
      createdAt: server.created_at,
      reviewedAt,
    }
    await db.paymentRequests.put(record)
    patchCache({
      paymentRequests: [record, ...getCache().paymentRequests],
    })
  } else {
    await db.paymentRequests.update(existing.id, {
      status: nextStatus,
      rejectionReason: server.rejection_reason,
      reviewedAt,
      remoteId: server.id,
      amount: Number(server.amount),
      planName: server.plan_name ?? existing.planName,
    })
    patchCache({
      paymentRequests: getCache().paymentRequests.map((r) =>
        r.id === existing.id
          ? {
              ...r,
              status: nextStatus,
              rejectionReason: server.rejection_reason,
              reviewedAt,
              remoteId: server.id,
              amount: Number(server.amount),
              planName: server.plan_name ?? r.planName,
            }
          : r
      ),
    })
  }

  notifySyncQueueChanged()

  return {
    approved: changed && nextStatus === 'approved' ? server : null,
    rejected: changed && nextStatus === 'rejected' ? server : null,
  }
}

/** Append a local notification (e.g. "payment approved"). */
export async function addNotification(notification: AppNotification): Promise<void> {
  await db.transaction('rw', db.notifications, db.syncQueue, async () => {
    await db.notifications.put(notification)
    await putSyncOp(syncOpFor('notification', notification.id, 'create'))
  })
  patchCache({ notifications: [notification, ...getCache().notifications] })
  notifySyncQueueChanged()
}

export type { PaymentRequest, PaymentRequestStatus }
