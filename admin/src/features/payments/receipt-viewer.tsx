import * as React from 'react'
import { Download, ExternalLink, ImageOff, Loader2, ReceiptText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDateTime, peso } from '@/lib/format'
import { planLabel } from '@/lib/constants'
import { PROOF_BUCKET } from '@/lib/payment-requests'
import { Modal } from '@/components/common/modal'
import { Button } from '@/components/ui/button'

/**
 * Everything the viewer needs, normalized from either a `payment_requests` row
 * (verification queue) or a `payments` row (ledger).
 */
export interface ReceiptSubject {
  /** Reference shown in the header — GCash ref for requests, ledger ref for payments. */
  reference: string
  amount: number
  planId: string | null
  planName?: string | null
  submittedAt: string
  notes?: string | null
  proofPath?: string | null
  proofUrl?: string | null
}

/**
 * Resolves a browser-facing URL for a receipt image. Prefers an explicit URL;
 * otherwise mints a short-lived signed URL for the private object. Returns
 * null when there is no proof (never fabricates a link).
 */
export async function resolveReceiptHref(subject: ReceiptSubject): Promise<string | null> {
  if (subject.proofUrl) return subject.proofUrl
  if (!subject.proofPath) return null
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(subject.proofPath, 60 * 60)
  if (error) return null
  return data?.signedUrl ?? null
}

/** True when there is an image to show (so callers can hide the action). */
export function hasReceipt(subject: Pick<ReceiptSubject, 'proofPath' | 'proofUrl'>): boolean {
  return Boolean(subject.proofUrl || subject.proofPath)
}

export function ReceiptViewer({
  subject,
  onClose,
}: {
  subject: ReceiptSubject | null
  onClose: () => void
}) {
  const [href, setHref] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!subject) {
      setHref(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setHref(null)
    void resolveReceiptHref(subject)
      .then((url) => {
        if (!cancelled) setHref(url)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [subject])

  const fileName = subject
    ? `receipt-${subject.reference.replace(/[^A-Za-z0-9._-]/g, '_')}.png`
    : 'receipt.png'

  return (
    <Modal open={subject !== null} onClose={onClose} title="Payment receipt" size="lg">
      {subject && (
        <div className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Reference: </span>
              <span className="font-mono">{subject.reference}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Amount: </span>
              {peso(Number(subject.amount))}
            </p>
            <p>
              <span className="text-muted-foreground">Plan: </span>
              {subject.planName ?? planLabel(subject.planId)}
            </p>
            <p>
              <span className="text-muted-foreground">Submitted: </span>
              {formatDateTime(subject.submittedAt)}
            </p>
          </div>

          {subject.notes && (
            <p className="rounded-lg bg-muted/60 p-3 text-sm">
              <span className="text-muted-foreground">Notes: </span>
              {subject.notes}
            </p>
          )}

          <div className="flex min-h-56 items-center justify-center rounded-lg border border-white/10 bg-black/30 p-3">
            {loading ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : href ? (
              <img
                src={href}
                alt={`Payment receipt for ${subject.reference}`}
                className="max-h-[60vh] w-auto rounded-md object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                <ImageOff className="size-7" />
                <p className="text-sm">No receipt image attached to this payment.</p>
              </div>
            )}
          </div>

          {href && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={href} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open original
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={href} download={fileName} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  Download
                </a>
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Small inline button used in tables to open the viewer. */
export function ReceiptButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} title="View receipt">
      <ReceiptText className="size-3.5" />
      <span className="hidden sm:inline">Receipt</span>
    </Button>
  )
}
