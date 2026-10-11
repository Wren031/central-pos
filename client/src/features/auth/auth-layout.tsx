import { Link } from 'react-router-dom'
import { BarChart3, CreditCard, Store } from 'lucide-react'
import { Brand } from '@/components/common/brand'
import { POS_TYPES } from '@/lib/pos-types'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh w-full lg:h-svh lg:overflow-hidden lg:grid-cols-[1fr_minmax(0,26rem)] xl:grid-cols-[1fr_minmax(0,30rem)]">
      <div className="relative hidden overflow-hidden bg-[#0c0a09] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(60% 50% at 20% 10%, oklch(0.6 0.2 25 / 0.5) 0%, transparent 60%), radial-gradient(50% 40% at 80% 90%, oklch(0.55 0.15 260 / 0.4) 0%, transparent 60%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <Link to="/" aria-label="Central POS home">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
                <Store className="size-5" aria-hidden />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">Central POS</div>
                <div className="text-[11px] text-white/60">Philippine Subscription Platform</div>
              </div>
            </div>
          </Link>
        </div>
        <div className="relative max-w-md space-y-5">
          <h2 className="text-3xl font-semibold tracking-tight">
            One platform for every kind of&nbsp;counter.
          </h2>
          <p className="text-sm leading-relaxed text-white/70">
            Register your business, pick a POS built for your trade, and start with a 30-day free
            trial — no credit card needed.
          </p>
          <ul className="space-y-3 text-sm text-white/80">
            <li className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                <Store className="size-4" aria-hidden />
              </span>
              7 industry-ready POS workspaces — BBQ, grocery, cafe, pharmacy &amp; more
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                <CreditCard className="size-4" aria-hidden />
              </span>
              Flexible weekly, monthly, and yearly subscriptions in pesos
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                <BarChart3 className="size-4" aria-hidden />
              </span>
              Live dashboards, inventory, receipts, and sales reports
            </li>
          </ul>
        </div>
        <div className="relative flex flex-wrap gap-1.5">
          {POS_TYPES.map((t) => (
            <span
              key={t.id}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70"
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col bg-background lg:min-h-0">
        <div className="flex items-center justify-between border-b px-4 py-4 sm:px-8 lg:hidden">
          <Link to="/">
            <Brand />
          </Link>
        </div>
        {/* Only the form column scrolls on lg+ — the marketing panel stays fixed. */}
        <div className="flex flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:min-h-0">
          <div className="m-auto w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            <div className="mb-6 space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
        {footer && (
          <div className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-8">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
