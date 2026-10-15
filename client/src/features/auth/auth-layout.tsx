import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CreditCard, Sparkles, Store } from 'lucide-react'
import { Brand } from '@/components/common/brand'
import { getPosTypes } from '@/lib/pos-types'
import { refreshPosCatalog } from '@/services/pos-catalog-service'

const FEATURES = [
  {
    icon: Store,
    title: '7 tailored POS workspaces',
    body: 'BBQ, grocery, café, pharmacy and more — set up for your exact trade.',
  },
  {
    icon: CreditCard,
    title: 'Simple peso subscriptions',
    body: 'Weekly, monthly, or yearly. Start with a 30-day free trial — no card needed.',
  },
  {
    icon: BarChart3,
    title: 'Works offline, syncs later',
    body: 'Keep selling when the internet drops; your products and sales stay intact.',
  },
]

const STATS = [
  { value: '30', label: 'days free' },
  { value: '₱0', label: 'to start' },
]

export function AuthLayout({
  title,
  subtitle,
  eyebrow,
  children,
  footer,
}: {
  title: string
  subtitle: string
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const [posTypes, setPosTypes] = useState(() => getPosTypes())

  useEffect(() => {
    const sync = () => setPosTypes(getPosTypes())
    void refreshPosCatalog().then(sync)
    window.addEventListener('cpos:data-changed', sync)
    return () => window.removeEventListener('cpos:data-changed', sync)
  }, [])

  return (
    <div className="grid min-h-svh w-full lg:h-svh lg:overflow-hidden lg:grid-cols-[1.15fr_minmax(0,30rem)] xl:grid-cols-[1.25fr_minmax(0,34rem)]">
      {/* Brand / marketing panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-[#0b0b0d] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(75% 55% at 12% 0%, oklch(0.55 0.22 25 / 0.55) 0%, transparent 60%), radial-gradient(55% 50% at 92% 18%, oklch(0.55 0.18 265 / 0.42) 0%, transparent 60%), radial-gradient(85% 60% at 72% 100%, oklch(0.5 0.16 180 / 0.3) 0%, transparent 62%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
              backgroundSize: '52px 52px',
            }}
          />
        </div>

        <div className="relative">
          <Link to="/" aria-label="UniPOS home" className="inline-flex">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                <Store className="size-5" aria-hidden />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight">UniPOS</div>
                <div className="text-[11px] text-white/55">Philippine Subscription Platform</div>
              </div>
            </div>
          </Link>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
              <Sparkles className="size-3" aria-hidden />
              Built for Philippine businesses
            </span>
            <h2 className="text-3xl font-semibold tracking-tight text-balance xl:text-4xl">
              One platform for every kind of counter.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-white/70">
              Register your business, pick a POS built for your trade, and start selling — online or
              off.
            </p>
          </div>

          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                  <f.icon className="size-4" aria-hidden />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-sm leading-relaxed text-white/60">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative space-y-5">
          <div className="flex items-center gap-6">
            {posTypes.length > 0 && (
              <div>
                <div className="text-xl font-semibold tracking-tight">{posTypes.length}</div>
                <div className="text-[11px] text-white/55">POS types</div>
              </div>
            )}
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-xl font-semibold tracking-tight">{s.value}</div>
                <div className="text-[11px] text-white/55">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {posTypes.map((t) => (
              <span
                key={t.id}
                className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] text-white/65"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </aside>

      {/* Form column */}
      <div className="flex flex-col bg-muted/30 lg:min-h-0">
        <header className="flex items-center justify-between border-b bg-background/80 px-4 py-4 backdrop-blur sm:px-8 lg:hidden">
          <Link to="/" aria-label="UniPOS home">
            <Brand />
          </Link>
        </header>

        {/* Only the form column scrolls on lg+ — the marketing panel stays fixed. */}
        <div className="flex flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:min-h-0 lg:px-10">
          <div className="m-auto w-full max-w-md">
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
              <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm shadow-black/[0.03] sm:p-8">
                <header className="mb-6 space-y-2">
                  {eyebrow}
                  <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                    {subtitle}
                  </p>
                </header>
                {children}
              </div>

              {footer && (
                <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
