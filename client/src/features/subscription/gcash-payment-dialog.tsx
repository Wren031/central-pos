import * as React from 'react'
import {
  BadgeCheck,
  Clock,
  ImagePlus,
  Info,
  Loader2,
  Maximize2,
  QrCode,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { PLAN_DAYS, PLAN_LABELS, PLAN_PRICES } from '@/lib/repos'
import { GCASH_QR_URL } from '@/lib/gcash-qr'
import { peso } from '@/lib/format'
import { submitPaymentRequest } from '@/lib/repos'
import type { PaymentRequest, PlanId } from '@/lib/types'
import { useAuth } from '@/state/auth-context'

type Step = 'review' | 'pay' | 'submitted'

/** Downscales and re-encodes a receipt image so it stays a small local blob. */
function fileToReceiptDataUrl(file: File, maxSize = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file (PNG or JPG).'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas unavailable.'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    img.src = url
  })
}

function GcashQrPanel({ onEnlarge }: { onEnlarge: () => void }) {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    setFailed(false)
  }, [])

  if (!GCASH_QR_URL || failed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6 text-center">
        <QrCode className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">GCash QR not configured</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {failed
            ? 'The configured QR image could not be loaded. Please contact support to complete your payment.'
            : 'The payment QR code has not been set up yet. Please contact support to pay for your subscription.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-fit rounded-xl border bg-white p-3">
        <img
          src={GCASH_QR_URL}
          alt="GCash payment QR code"
          className="h-56 w-56 object-contain"
          onError={() => setFailed(true)}
        />
        <button
          type="button"
          onClick={onEnlarge}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm hover:bg-background"
        >
          <Maximize2 className="size-3" />
          Enlarge
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Open the GCash app → Scan QR → pay the exact amount, then keep the reference number.
      </p>
    </div>
  )
}

export function GcashPaymentDialog({
  open,
  onOpenChange,
  plan,
  currentExpiry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: Exclude<PlanId, 'trial'> | null
  currentExpiry: string | null
}) {
  const { user } = useAuth()
  const [step, setStep] = React.useState<Step>('review')
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [proofImage, setProofImage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [enlarged, setEnlarged] = React.useState(false)
  const [submitted, setSubmitted] = React.useState<PaymentRequest | null>(null)

  React.useEffect(() => {
    if (open) {
      setStep('review')
      setReference('')
      setNotes('')
      setProofImage(null)
      setError(null)
      setBusy(false)
      setEnlarged(false)
      setSubmitted(null)
    }
  }, [open, plan])

  if (!plan) return null

  const selectedPlan: Exclude<PlanId, 'trial'> = plan
  const price = PLAN_PRICES[selectedPlan]
  const days = PLAN_DAYS[selectedPlan]

  async function attachProof(file: File | null) {
    if (!file) return
    setError(null)
    try {
      setProofImage(await fileToReceiptDataUrl(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  async function submit() {
    if (!user) return
    setError(null)
    if (reference.trim().length < 4) {
      setError('Enter the GCash transaction reference number.')
      return
    }
    setBusy(true)
    try {
      const request = await submitPaymentRequest({
        userId: user.id,
        plan: selectedPlan,
        referenceNo: reference,
        notes,
        proofImage,
      })
      setSubmitted(request)
      setStep('submitted')
      toast.success('Payment submitted — awaiting verification.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your payment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="flex max-h-[92svh] flex-col gap-3 sm:max-w-lg">
          {step === 'review' && (
            <>
              <DialogHeader>
                <DialogTitle>Pay for the {PLAN_LABELS[plan]} plan</DialogTitle>
                <DialogDescription>
                  Manual GCash payment. Your plan is activated only after an administrator verifies
                  your payment.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium">{PLAN_LABELS[plan]}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{days} days</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Access starts</span>
                    <span className="font-medium">
                      {currentExpiry
                        ? `After ${new Date(currentExpiry).toLocaleDateString('en-PH')}`
                        : 'Once approved'}
                    </span>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Amount to pay (PHP)</span>
                    <span className="text-lg font-semibold">{peso(price)}</span>
                  </div>
                </div>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  If your subscription is still active, approved days are added on top of the current
                  expiration date so you never lose paid time.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setStep('pay')}>
                  <QrCode className="size-4" />
                  Continue to GCash payment
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'pay' && (
            <>
              <DialogHeader>
                <DialogTitle>Scan &amp; pay with GCash</DialogTitle>
                <DialogDescription>
                  Pay {peso(price)} for the {PLAN_LABELS[plan]} plan, then submit your proof below.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                <GcashQrPanel onEnlarge={() => setEnlarged(true)} />

                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>Open the GCash app and tap <strong>Scan QR</strong>.</li>
                    <li>Scan the QR code above and enter the exact amount ({peso(price)}).</li>
                    <li>Complete the payment and copy the <strong>reference number</strong>.</li>
                    <li>Return here, enter the reference, attach a screenshot, and submit.</li>
                  </ol>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="space-y-2">
                  <Label htmlFor="gcash-ref">
                    GCash reference number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="gcash-ref"
                    inputMode="numeric"
                    placeholder="e.g. 1234 567 890123"
                    value={reference}
                    onChange={(e) => setReference(e.target.value.replace(/[^\d\s-]/g, ''))}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gcash-notes">Payment notes (optional)</Label>
                  <Textarea
                    id="gcash-notes"
                    rows={2}
                    placeholder="e.g. paid from 09•••••123, name on the account"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment receipt / screenshot</Label>
                  {proofImage ? (
                    <div className="flex items-start gap-3 rounded-lg border p-2.5">
                      <img
                        src={proofImage}
                        alt="Receipt preview"
                        className="h-20 w-20 rounded-md border object-cover"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Receipt attached</p>
                        <p className="text-xs text-muted-foreground">
                          Stored locally and included in your submission.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setProofImage(null)}
                        aria-label="Remove receipt"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted/40">
                      <ImagePlus className="size-4" aria-hidden />
                      Attach a screenshot of your GCash confirmation
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => void attachProof(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>

                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Submitting proof does not activate your plan. An administrator verifies your
                  payment first — a screenshot alone is not confirmation that a payment was received.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep('review')} disabled={busy}>
                  Back
                </Button>
                <Button onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}
                  Submit payment for verification
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'submitted' && (
            <>
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-amber-100">
                  <Clock className="size-7 text-amber-600" aria-hidden />
                </div>
                <DialogTitle>Payment submitted</DialogTitle>
                <DialogDescription>
                  Your GCash payment is now <strong>pending verification</strong>. An administrator
                  will review your proof and approve or reject it. Your {PLAN_LABELS[plan]} plan
                  activates only after approval.
                </DialogDescription>
                {submitted && (
                  <div className="mt-1 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Pending Verification
                    </Badge>
                    <span className="font-mono text-xs">{submitted.referenceNo}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => onOpenChange(false)}>
                  <BadgeCheck className="size-4" />
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {enlarged && GCASH_QR_URL && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setEnlarged(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setEnlarged(false)}
            aria-label="Close enlarged QR code"
          >
            <X className="size-5" />
          </button>
          <img
            src={GCASH_QR_URL}
            alt="Enlarged GCash payment QR code"
            className="max-h-[80svh] max-w-[90vw] rounded-xl bg-white p-4 object-contain"
          />
          <p className="text-sm text-white/80">Scan this code with the GCash app</p>
        </div>
      )}
    </>
  )
}
