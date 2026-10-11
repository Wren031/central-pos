import * as React from 'react'
import { CreditCard, Loader2, Lock, ShieldCheck } from 'lucide-react'
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
import { PLAN_DAYS, PLAN_LABELS, PLAN_PRICES } from '@/lib/repos'
import { peso } from '@/lib/format'
import type { PlanId } from '@/lib/types'

type Step = 'review' | 'payment' | 'processing' | 'success'

export function CheckoutDialog({
  open,
  onOpenChange,
  plan,
  onPurchase,
  currentExpiry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: Exclude<PlanId, 'trial'> | null
  onPurchase: (plan: Exclude<PlanId, 'trial'>) => Promise<void>
  currentExpiry: string | null
}) {
  const [step, setStep] = React.useState<Step>('review')
  const [card, setCard] = React.useState('')
  const [expiry, setExpiry] = React.useState('')
  const [cvc, setCvc] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setStep('review')
      setError(null)
      setCard('')
      setExpiry('')
      setCvc('')
    }
  }, [open, plan])

  if (!plan) return null

  const selectedPlan: Exclude<PlanId, 'trial'> = plan
  const price = PLAN_PRICES[selectedPlan]
  const days = PLAN_DAYS[selectedPlan]

  function formatCard(v: string): string {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  function formatExpiry(v: string): string {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }

  async function pay() {
    setError(null)
    if (card.replace(/\s/g, '').length < 16) {
      setError('Enter a 16-digit card number.')
      return
    }
    if (expiry.length < 5) {
      setError('Enter the card expiry as MM/YY.')
      return
    }
    if (cvc.length < 3) {
      setError('Enter the 3-digit CVC.')
      return
    }
    setStep('processing')
    try {
      await onPurchase(selectedPlan)
      setStep('success')
    } catch (err) {
      setStep('payment')
      setError(err instanceof Error ? err.message : 'Payment failed. Try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        {step === 'review' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm {PLAN_LABELS[plan]} plan</DialogTitle>
              <DialogDescription>
                Simulated checkout — no real payment is processed.
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
                  <span className="text-muted-foreground">Extends from</span>
                  <span className="font-medium">
                    {currentExpiry ? new Date(currentExpiry).toLocaleDateString('en-PH') : 'Today'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="font-medium">Total (PHP)</span>
                  <span className="text-lg font-semibold">{peso(price)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your plan extends from the current expiration date so you never lose paid days.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('payment')}>
                <CreditCard className="size-4" />
                Continue to payment
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'payment' && (
          <>
            <DialogHeader>
              <DialogTitle>Payment details</DialogTitle>
              <DialogDescription>
                Demo card form — use any digits. Nothing leaves your browser.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="card-number">Card number</Label>
                <Input
                  id="card-number"
                  inputMode="numeric"
                  placeholder="4242 4242 4242 4242"
                  value={card}
                  onChange={(e) => setCard(formatCard(e.target.value))}
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="card-exp">Expiry</Label>
                  <Input
                    id="card-exp"
                    inputMode="numeric"
                    placeholder="12/28"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-cvc">CVC</Label>
                  <Input
                    id="card-cvc"
                    inputMode="numeric"
                    placeholder="123"
                    maxLength={4}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                    autoComplete="off"
                  />
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                Simulated secure checkout · {peso(price)}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('review')}>
                Back
              </Button>
              <Button onClick={pay}>
                <CreditCard className="size-4" />
                Pay {peso(price)}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Processing payment…</p>
            <p className="text-xs text-muted-foreground">Do not close this dialog.</p>
          </div>
        )}

        {step === 'success' && (
          <>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck className="size-7 text-emerald-600" aria-hidden />
              </div>
              <DialogTitle>Payment successful!</DialogTitle>
              <DialogDescription>
                Your {PLAN_LABELS[plan]} plan is active — {days} days added. A mock receipt was saved
                to your billing history.
              </DialogDescription>
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Back to subscription
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
