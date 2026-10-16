import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { getPosType, getPosTypes, isPosCatalogEmpty } from '@/lib/pos-types'
import { refreshPosCatalog, getPosCatalogError } from '@/services/pos-catalog-service'
import { setInitialSubscription, setupStore } from '@/lib/repos'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { Brand } from '@/components/common/brand'
import { PlanDurationStep, PosTypeStep } from './onboarding-steps'

const SETUP_STEPS = [
  'Provisioning workspace…',
  'Preparing your empty catalog…',
  'Configuring categories & receipts…',
  'Applying theme…',
  'Almost ready…',
]

export function OnboardingPage() {
  const { user, store, refresh, setStoreLocal } = useAuth()
  const { allPlans, plansLoading, plansError } = useSubscription()
  const online = useOnlineStatus()
  const navigate = useNavigate()

  // Post-verification wizard: POS type → plan duration → workspace.
  const [stage, setStage] = React.useState<'pos' | 'plan'>('pos')
  const [selected, setSelected] = React.useState<string | null>(store?.posType ?? null)
  const [planId, setPlanId] = React.useState<string | null>(null)
  const [generating, setGenerating] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [types, setTypes] = React.useState(() => getPosTypes())
  const [loading, setLoading] = React.useState(() => isPosCatalogEmpty())
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const ok = await refreshPosCatalog()
    if (!ok && isPosCatalogEmpty()) {
      setError(
        getPosCatalogError() ??
          'Could not load POS types. Check your connection and try again.'
      )
    } else {
      setError(null)
    }
    setTypes(getPosTypes())
    setLoading(false)
  }, [])

  React.useEffect(() => {
    const sync = () => setTypes(getPosTypes())
    void load()
    window.addEventListener('cpos:data-changed', sync)
    return () => window.removeEventListener('cpos:data-changed', sync)
  }, [load])

  // Default the duration step to the free trial (or the first plan) once loaded.
  React.useEffect(() => {
    if (stage !== 'plan' || planId || allPlans.length === 0) return
    const trial = allPlans.find((p) => p.isTrial) ?? allPlans[0]
    setPlanId(trial.id)
  }, [stage, planId, allPlans])

  if (!user) return <Navigate to="/login" replace />

  // POS type is chosen once during first-time setup — account holders cannot switch.
  if (store?.onboarded) return <Navigate to="/" replace />

  async function handleGenerate() {
    if (!selected || !user) return
    // Validate the selection is still an active, available POS type before
    // creating the store (the admin may have deactivated it since it loaded).
    let available = getPosTypes()
    if (!available.some((t) => t.id === selected)) {
      await refreshPosCatalog()
      available = getPosTypes()
    }
    if (!available.some((t) => t.id === selected)) {
      setTypes(available)
      toast.error('That POS type is no longer available. Please pick another.')
      return
    }

    setGenerating(true)
    setStep(0)
    const timer = setInterval(() => {
      setStep((s) => Math.min(s + 1, SETUP_STEPS.length - 1))
    }, 550)
    try {
      const plan = allPlans.find((p) => p.id === planId)
      const s = await setupStore(user.id, selected)
      if (plan) {
        await setInitialSubscription({
          userId: user.id,
          planId: plan.id,
          planName: plan.name,
          durationDays: plan.durationDays,
        })
      }
      clearInterval(timer)
      setStoreLocal(s)
      refresh()
      toast.success(`${getPosType(selected).name} is ready!`)
      navigate('/', { replace: true })
    } catch (err) {
      clearInterval(timer)
      toast.error(err instanceof Error ? err.message : 'Could not set up the POS.')
      setGenerating(false)
    }
  }

  if (generating) {
    const def = selected ? getPosType(selected) : null
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div
            className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl text-white shadow-lg"
            style={{ backgroundColor: def?.theme.accent ?? 'var(--primary)' }}
          >
            {def && <def.icon className="size-8" aria-hidden />}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Setting up your {def?.name ?? 'POS'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{def?.tagline}</p>
          <div className="mt-8 space-y-3 text-left">
            {SETUP_STEPS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all',
                  i < step && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                  i === step && 'border-blue-200 bg-blue-50 text-blue-800',
                  i > step && 'opacity-40'
                )}
              >
                {i < step ? (
                  <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : i === step ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" aria-hidden />
                ) : (
                  <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6">
          <Brand />
          <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">
            Workspace setup
          </Badge>
        </div>
      </header>
      <main className="w-full px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {stage === 'pos' ? (
            <PosTypeStep
              types={types}
              loading={loading}
              error={error}
              selected={selected}
              onSelect={setSelected}
              onRetry={() => void load()}
              onContinue={() => setStage('plan')}
            />
          ) : (
            <PlanDurationStep
              plans={allPlans}
              loading={plansLoading}
              error={plansError}
              selected={planId}
              onSelect={setPlanId}
              onContinue={() => void handleGenerate()}
              onBack={() => setStage('pos')}
              submitting={generating}
              offline={!online}
              submitLabel="Create my workspace"
            />
          )}
        </div>
      </main>
    </div>
  )
}
