import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { POS_TYPES, getPosType } from '@/lib/pos-types'
import { setupStore } from '@/lib/repos'
import type { PosTypeId } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/state/auth-context'
import { Brand } from '@/components/common/brand'

const SETUP_STEPS = [
  'Provisioning workspace…',
  'Preparing your empty catalog…',
  'Configuring categories & receipts…',
  'Applying theme…',
  'Almost ready…',
]

function PosPreview({ posType }: { posType: PosTypeId }) {
  const def = getPosType(posType)
  const t = def.theme
  return (
    <div
      className="relative h-24 overflow-hidden rounded-lg border"
      style={{ backgroundColor: t.accentSoft }}
      aria-hidden
    >
      <div className="flex items-center gap-1.5 border-b bg-white/70 px-2 py-1.5">
        <span className="size-2 rounded-full" style={{ backgroundColor: t.chart[0] }} />
        <span className="size-2 rounded-full bg-black/10" />
        <span className="size-2 rounded-full bg-black/10" />
        <span className="ml-1 text-[8px] font-semibold" style={{ color: t.accent }}>
          {def.name}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1.5 p-2">
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-9 rounded bg-white/80"
              style={{ borderBottom: `3px solid ${t.chart[i % 3]}` }}
            />
          ))}
          <div className="col-span-3 flex h-6 items-end gap-0.5 rounded bg-white/60 px-1 py-0.5">
            {[40, 65, 35, 80, 55, 70, 45].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{ height: `${h}%`, backgroundColor: t.chart[i % 3], opacity: 0.85 }}
              />
            ))}
          </div>
        </div>
        <div className="w-12 space-y-1 rounded bg-white/80 p-1">
          <div className="h-1.5 rounded bg-black/10" />
          <div className="h-1.5 w-2/3 rounded" style={{ backgroundColor: t.accent }} />
          <div className="mt-2 h-3 rounded" style={{ backgroundColor: t.accent }} />
        </div>
      </div>
    </div>
  )
}

export function OnboardingPage() {
  const { user, store, refresh, setStoreLocal } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = React.useState<PosTypeId | null>(store?.posType ?? null)
  const [generating, setGenerating] = React.useState(false)
  const [step, setStep] = React.useState(0)

  if (!user) return <Navigate to="/login" replace />

  // POS type is chosen once during first-time setup — account holders cannot switch.
  if (store?.onboarded) return <Navigate to="/" replace />

  async function handleGenerate() {
    if (!selected || !user) return
    setGenerating(true)
    setStep(0)
    const timer = setInterval(() => {
      setStep((s) => Math.min(s + 1, SETUP_STEPS.length - 1))
    }, 550)
    try {
      const s = await setupStore(user.id, selected)
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
            30-day free trial active
          </Badge>
        </div>
      </header>
      <main className="w-full px-4 py-8 sm:px-6">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Step 2 of 2 · Choose your POS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What kind of business are you running?
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Pick the workspace that fits your trade. Your catalog starts empty — add your own
            products after setup. You can switch types later in settings.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {POS_TYPES.map((type) => {
            const isSelected = selected === type.id
            return (
              <Card
                key={type.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setSelected(type.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(type.id)
                  }
                }}
                className={cn(
                  'relative cursor-pointer gap-3 p-4 shadow-none transition-all hover:border-foreground/25 hover:shadow-sm',
                  isSelected && 'border-2 shadow-md ring-1 ring-foreground/10'
                )}
                style={isSelected ? { borderColor: type.theme.accent } : undefined}
              >
                {isSelected && (
                  <span
                    className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: type.theme.accent }}
                    aria-hidden
                  >
                    <Check className="size-3" />
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: type.theme.accent }}
                  >
                    <type.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{type.name}</p>
                    <p className="text-xs text-muted-foreground">{type.tagline}</p>
                  </div>
                </div>
                <PosPreview posType={type.id} />
                <p className="text-xs leading-relaxed text-muted-foreground">{type.description}</p>
                <ul className="space-y-1">
                  {type.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs">
                      <Check className="mt-0.5 size-3 shrink-0" style={{ color: type.theme.accent }} aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>

        <div className="sticky bottom-16 z-10 mt-8 flex flex-col items-center gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur md:bottom-4 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected ? (
              <>
                Selected: <span className="font-medium text-foreground">{getPosType(selected).name}</span>
              </>
            ) : (
              'Select a POS type to continue'
            )}
          </p>
          <Button size="lg" disabled={!selected} onClick={handleGenerate} className="w-full sm:w-auto">
            <Sparkles className="size-4" />
            Generate my POS workspace
          </Button>
        </div>
      </main>
    </div>
  )
}
