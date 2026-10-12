import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Bluetooth,
  Check,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Download,
  FileText,
  Mail,
  Menu,
  MonitorDown,
  Package,
  Printer,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  WifiOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { peso } from '@/lib/format'
import { posTypeIcon } from '@/lib/constants'
import {
  fetchPublishedReleases,
  formatBytes,
  latestPerPlatform,
  releaseDownloadHref,
  PLATFORM_LABELS,
} from '@/lib/releases'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import type { PosRelease, PosType, SubscriptionPlan } from '@/lib/types'

/* -------------------------------------------------------------------------- */
/* Site configuration                                                          */
/* -------------------------------------------------------------------------- */

const SITE = {
  name: 'Central POS',
  tagline: 'Offline-first point of sale for every kind of store',
  contactEmail: 'support@centralpos.ph',
}

const COPYRIGHT_YEAR = new Date().getFullYear()

/** Base URL of the POS client app (registration + merchant login live there). */
const POS_APP_URL = (
  (import.meta.env.VITE_POS_APP_URL as string | undefined) ?? 'http://localhost:5173'
).replace(/\/+$/, '')

const REGISTER_URL = `${POS_APP_URL}/register`
const LOGIN_URL = `${POS_APP_URL}/login`

/* -------------------------------------------------------------------------- */
/* Static fallbacks (used when Supabase is unreachable / not configured)        */
/* -------------------------------------------------------------------------- */

const FALLBACK_POS_TYPES: { id: string; name: string; tagline: string }[] = [
  { id: 'bbq', name: 'BBQ POS', tagline: 'Grills, skewers & plated meals' },
  { id: 'retail', name: 'Retail POS', tagline: 'Shops, boutiques & general goods' },
  { id: 'grocery', name: 'Grocery POS', tagline: 'Per-kilo items & essentials' },
  { id: 'restaurant', name: 'Restaurant POS', tagline: 'Dine-in, takeout & tables' },
  { id: 'cafe', name: 'Cafe POS', tagline: 'Coffee, pastries & add-ons' },
  { id: 'pharmacy', name: 'Pharmacy POS', tagline: 'Medicines & health products' },
  { id: 'general', name: 'General Merchandise', tagline: 'Flexible layout for any trade' },
]

const FALLBACK_PLANS: {
  id: string
  name: string
  duration_days: number
  price: number
  is_trial: boolean
  description: string | null
}[] = [
  { id: 'trial', name: 'Free Trial', duration_days: 30, price: 0, is_trial: true, description: 'Full access, no card required' },
  { id: 'weekly', name: 'Weekly', duration_days: 7, price: 99, is_trial: false, description: null },
  { id: 'monthly', name: 'Monthly', duration_days: 30, price: 299, is_trial: false, description: 'Most popular' },
  { id: 'yearly', name: 'Yearly', duration_days: 365, price: 2999, is_trial: false, description: 'Best value — 2 months free' },
]

const FEATURES = [
  {
    icon: WifiOff,
    title: 'Offline sales processing',
    description:
      'Keep selling when the internet drops. Every sale is stored on-device and stays available — no downtime, no lost revenue.',
  },
  {
    icon: Package,
    title: 'Inventory management',
    description:
      'Track stock levels per item, get low-stock visibility, and adjust counts with a proper movement history.',
  },
  {
    icon: ClipboardList,
    title: 'Order tracking',
    description:
      'Every order and receipt is recorded with timestamps, items, and totals so you can always trace a transaction.',
  },
  {
    icon: Printer,
    title: 'Receipt printing',
    description:
      'Print clean, itemized receipts for every sale — ready for ESC/POS thermal printers and standard setups.',
  },
  {
    icon: BarChart3,
    title: 'Sales reports',
    description:
      'See revenue, best sellers, and trends with built-in reports that work offline and update as you sell.',
  },
  {
    icon: Bluetooth,
    title: 'Bluetooth printer support',
    description:
      'Pair a Bluetooth thermal printer and print receipts right from the counter — no cables, no extra software.',
  },
] as const

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Register your business',
    description:
      'Create your merchant account with your store name and contact details. Your 30-day free trial starts immediately.',
  },
  {
    step: '2',
    title: 'Pick your POS type',
    description:
      'Choose from BBQ, retail, grocery, restaurant, cafe, pharmacy, or general merchandise — each layout fits its trade.',
  },
  {
    step: '3',
    title: 'Set up your products',
    description:
      'Add your items, prices, and categories. Import-ready categories come pre-arranged for your chosen POS type.',
  },
  {
    step: '4',
    title: 'Start selling',
    description:
      'Ring up sales offline, print receipts, and watch your reports build — subscription-synced when you are back online.',
  },
] as const

const FAQS = [
  {
    q: 'Does Central POS really work offline?',
    a: 'Yes. The POS app stores products, sales, and reports in an on-device database. You can ring up sales, print receipts, and view reports with no internet connection. Data syncs to the cloud when a connection is available.',
  },
  {
    q: 'What happens after the 30-day free trial?',
    a: 'Your trial includes full access for 30 days with no card required. When it ends, pick a weekly, monthly, or yearly plan inside the app to keep selling — your data stays on your device either way.',
  },
  {
    q: 'Which devices are supported?',
    a: 'Android phones and tablets via the APK download. A Windows build is offered here whenever a compatible installer is published. The app runs fully on-device on both platforms.',
  },
  {
    q: 'Can I print receipts?',
    a: 'Yes. Central POS supports ESC/POS receipt printing, including Bluetooth thermal printers — pair the printer, pick it in POS settings, and print with every sale.',
  },
  {
    q: 'Can I switch POS types later?',
    a: 'Yes. You can change your store’s POS type from settings. Note that switching clears the current catalog so your product layout matches the new type.',
  },
  {
    q: 'Is my business data safe?',
    a: 'Your data lives primarily on your own device. Subscription status and store profiles sync securely through Supabase; the admin team can never access your on-device sales database.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Shared layout bits                                                           */
/* -------------------------------------------------------------------------- */

function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  center = true,
}: {
  id?: string
  eyebrow: string
  title: string
  description?: string
  center?: boolean
}) {
  return (
    <div id={id} className={`scroll-mt-24 ${center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}`}>
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {description && <p className="mt-3 text-base text-muted-foreground">{description}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Header                                                                       */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pos-types', label: 'POS Types' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#download', label: 'Download' },
  { href: '#faq', label: 'FAQ' },
]

function LandingHeader() {
  const [scrolled, setScrolled] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${
        scrolled
          ? 'border-border bg-background/85 backdrop-blur-md'
          : 'border-transparent bg-background/60 backdrop-blur-sm'
      }`}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5" aria-label={`${SITE.name} home`}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25">
            <Store className="size-[18px]" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">
            {SITE.name}
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href={LOGIN_URL}>Sign in</a>
          </Button>
          <Button asChild size="sm">
            <a href={REGISTER_URL}>
              Get Started
              <ArrowRight aria-hidden />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </Container>

      {menuOpen && (
        <nav
          id="landing-mobile-nav"
          aria-label="Mobile navigation"
          className="border-t border-border bg-background md:hidden"
        >
          <Container className="flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href={LOGIN_URL}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Sign in
            </a>
          </Container>
        </nav>
      )}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Hero + product preview                                                       */
/* -------------------------------------------------------------------------- */

const PREVIEW_PRODUCTS = [
  { name: 'Chicken BBQ', price: '₱45.00' },
  { name: 'Pork BBQ', price: '₱35.00' },
  { name: 'Garlic Rice', price: '₱20.00' },
  { name: 'Isaw', price: '₱15.00' },
  { name: 'Grilled Bangus', price: '₱90.00' },
  { name: 'Softdrinks', price: '₱25.00' },
]

function ProductPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-xl"
      aria-hidden
      role="presentation"
    >
      <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/15 via-transparent to-violet-500/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-[11px] font-medium text-muted-foreground">
            Central POS — BBQ layout
          </span>
        </div>
        <div className="grid grid-cols-[88px_1fr_128px] sm:grid-cols-[110px_1fr_150px]">
          <div className="space-y-1.5 border-r border-border bg-muted/30 p-2.5">
            {['Sales', 'Orders', 'Stock', 'Reports'].map((item, i) => (
              <div
                key={item}
                className={`rounded-md px-2 py-1.5 text-[10px] font-medium sm:text-[11px] ${
                  i === 0 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {item}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {PREVIEW_PRODUCTS.map((p) => (
              <div key={p.name} className="rounded-lg border border-border bg-background p-2">
                <p className="truncate text-[10px] font-semibold text-foreground sm:text-[11px]">
                  {p.name}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-primary">{p.price}</p>
              </div>
            ))}
          </div>
          <div className="border-l border-border bg-muted/30 p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Current sale</p>
            <div className="mt-2 space-y-1.5">
              {[
                ['2× Chicken', '90.00'],
                ['1× Garlic', '20.00'],
                ['2× Softdrinks', '50.00'],
              ].map(([label, amount]) => (
                <div key={label} className="flex justify-between text-[10px] text-foreground/80">
                  <span className="truncate">{label}</span>
                  <span>{amount}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-2">
              <div className="flex justify-between text-[11px] font-semibold text-foreground">
                <span>Total</span>
                <span>₱160.00</span>
              </div>
              <div className="mt-2 rounded-md bg-primary px-2 py-1.5 text-center text-[10px] font-semibold text-primary-foreground">
                Charge
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-1 text-[9px] text-emerald-600">
                <Bluetooth className="size-2.5" />
                Printer ready
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,oklch(0.511_0.262_277/0.12),transparent)]" />
      <Container className="relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            30-day free trial — no card required
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
            Run your store{' '}
            <span className="bg-gradient-to-br from-primary to-violet-500 bg-clip-text text-transparent">
              offline
            </span>
            , sell anywhere
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            {SITE.name} is an offline-first point of sale built for BBQ stands, retail shops,
            groceries, restaurants, cafes, pharmacies, and general merchandise — with receipt
            printing, inventory, and sales reports that work without internet.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <a href={REGISTER_URL}>
                Get Started — it’s free
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-6 text-base">
              <a href="#download">
                <Download aria-hidden />
                Download POS
              </a>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {['Works fully offline', 'Bluetooth receipts', 'Android & Windows'].map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="size-4 text-emerald-500" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview />
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Features                                                                     */
/* -------------------------------------------------------------------------- */

function FeaturesSection() {
  return (
    <section className="border-t border-border bg-muted/20 py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="features"
          eyebrow="Features"
          title="Everything a busy counter needs"
          description="Built for real-world selling — from a single grill station to a full retail floor."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* POS types                                                                    */
/* -------------------------------------------------------------------------- */

function PosTypesSection() {
  const posTypes = useAsync(async () => {
    if (!supabaseConfigured) return null
    const { data, error } = await supabase
      .from('pos_types')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as PosType[]
  }, [])

  const types =
    posTypes.data && posTypes.data.length > 0
      ? posTypes.data.map((t) => ({
          id: t.id,
          name: t.name,
          tagline: t.tagline ?? t.description ?? 'Purpose-built layout',
        }))
      : FALLBACK_POS_TYPES

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="pos-types"
          eyebrow="POS types"
          title="A layout for every kind of store"
          description="Pick the POS type that matches your trade — the catalog, categories, and screens are arranged for it."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {types.map((t) => {
            const Icon = posTypeIcon(t.id)
            return (
              <div
                key={t.id}
                className="flex flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-xs"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{t.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.tagline}</p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Pricing                                                                      */
/* -------------------------------------------------------------------------- */

function PricingSection() {
  const plans = useAsync(async () => {
    if (!supabaseConfigured) return null
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as SubscriptionPlan[]
  }, [])

  const list =
    plans.data && plans.data.length > 0
      ? plans.data.map((p) => ({
          id: p.id,
          name: p.name,
          duration_days: p.duration_days,
          price: Number(p.price),
          is_trial: p.is_trial,
          description: p.description,
        }))
      : FALLBACK_PLANS

  function durationLabel(days: number): string {
    if (days === 1) return 'per day'
    if (days === 7) return 'per week'
    if (days === 30) return 'per month'
    if (days === 365) return 'per year'
    return `per ${days} days`
  }

  return (
    <section className="border-t border-border bg-muted/20 py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="pricing"
          eyebrow="Subscription plans"
          title="Start free, subscribe when you’re ready"
          description="Every account begins with a full-access 30-day free trial. No credit card required."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((plan) => {
            const highlighted = plan.id === 'monthly' || (!plan.is_trial && plan.duration_days === 30)
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs ${
                  highlighted ? 'border-primary ring-2 ring-primary/20' : 'border-border/70'
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-1 min-h-4 text-xs text-muted-foreground">
                  {plan.description ?? `${plan.duration_days}-day access`}
                </p>
                <p className="mt-4">
                  {plan.price === 0 ? (
                    <span className="text-3xl font-semibold tracking-tight text-foreground">
                      Free
                    </span>
                  ) : (
                    <>
                      <span className="text-3xl font-semibold tracking-tight text-foreground">
                        {peso(plan.price)}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {durationLabel(plan.duration_days)}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs font-medium text-primary">{plan.duration_days} days</p>
                <div className="mt-4 flex-1">
                  <ul className="space-y-2">
                    {[
                      plan.is_trial ? 'Full access for 30 days' : `${plan.duration_days} days of access`,
                      'Offline sales & reports',
                      'Receipt printing (incl. Bluetooth)',
                      'All POS types included',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button asChild variant={highlighted ? 'default' : 'outline'} className="mt-6 w-full">
                  <a href={REGISTER_URL}>
                    {plan.is_trial ? 'Start free trial' : `Choose ${plan.name}`}
                  </a>
                </Button>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* How it works                                                                 */
/* -------------------------------------------------------------------------- */

function HowItWorksSection() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="how-it-works"
          eyebrow="How it works"
          title="From sign-up to first sale in minutes"
        />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.step} className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {item.step}
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Download                                                                     */
/* -------------------------------------------------------------------------- */

function DownloadSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-56 rounded-2xl" />
      ))}
    </div>
  )
}

function DownloadCard({
  release,
  icon: Icon,
}: {
  release: PosRelease
  icon: React.ComponentType<{ className?: string }>
}) {
  const href = releaseDownloadHref(release)

  return (
    <div className="flex flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {PLATFORM_LABELS[release.platform]}
          </h3>
          <p className="text-xs text-muted-foreground">
            Version {release.version} · {formatBytes(release.file_size_bytes)}
          </p>
        </div>
      </div>
      {release.release_notes && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {release.release_notes}
        </p>
      )}
      <div className="mt-auto pt-5">
        {href ? (
          <Button asChild size="lg" className="w-full">
            <a href={href} download>
              <Download aria-hidden />
              Download for {PLATFORM_LABELS[release.platform]}
            </a>
          </Button>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">
            No downloadable file is attached to this release yet.
          </p>
        )}
      </div>
    </div>
  )
}

function DownloadSection() {
  const releases = useAsync(async () => {
    if (!supabaseConfigured) return [] as PosRelease[]
    return fetchPublishedReleases()
  }, [])

  const latest = latestPerPlatform(releases.data ?? [])
  const hasAny = Boolean(latest.android ?? latest.windows)

  return (
    <section className="border-t border-border bg-muted/20 py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="download"
          eyebrow="Download"
          title="Get the POS app"
          description="Install Central POS on your device and start selling. Only published releases are shown."
        />

        <div className="mx-auto mt-12 max-w-2xl">
          {releases.loading ? (
            <DownloadSkeleton />
          ) : releases.error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm font-semibold text-destructive">
                Could not load available downloads
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{releases.error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={releases.reload}>
                Try again
              </Button>
            </div>
          ) : !hasAny ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <CloudUpload className="mx-auto size-10 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-foreground">
                No installer published yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                The first POS build has not been published. Check back soon — installers appear
                here the moment a release goes live.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {latest.android ? (
                <DownloadCard release={latest.android} icon={Smartphone} />
              ) : (
                <div className="flex flex-col rounded-2xl border border-dashed border-border bg-card p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Smartphone className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Android</h3>
                      <p className="text-xs text-muted-foreground">APK · not published yet</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    The Android APK has not been published. It will appear here once available.
                  </p>
                </div>
              )}
              {latest.windows && <DownloadCard release={latest.windows} icon={MonitorDown} />}
            </div>
          )}

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Smartphone className="size-4 text-primary" aria-hidden />
                Installing on Android
              </h4>
              <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>1. Download the APK file to your device.</li>
                <li>2. Open the file and allow “install from this source” if prompted.</li>
                <li>3. Tap Install, then open Central POS and register your store.</li>
              </ol>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MonitorDown className="size-4 text-primary" aria-hidden />
                Installing on Windows
              </h4>
              <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>1. Download the installer when a Windows build is published.</li>
                <li>2. Run the installer and follow the setup wizard.</li>
                <li>3. Launch Central POS from your Start menu and register.</li>
              </ol>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />
            Installers are hosted on our official Supabase storage — never download from third-party
            mirrors.
          </p>
        </div>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                          */
/* -------------------------------------------------------------------------- */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="rounded-2xl border border-border/70 bg-card shadow-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-foreground sm:text-base">{q}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <p className="border-t border-border/70 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          {a}
        </p>
      )}
    </div>
  )
}

function FaqSection() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading
          id="faq"
          eyebrow="FAQ"
          title="Frequently asked questions"
        />
        <div className="mx-auto mt-12 grid max-w-3xl gap-3">
          {FAQS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Footer + legal dialogs                                                       */
/* -------------------------------------------------------------------------- */

const PRIVACY_POLICY = `Central POS collects only the information needed to run your store account: your name, business name, contact number, store address, and email address. Sales and product data are stored on your own device and are not uploaded unless a future sync feature is enabled.

We use Supabase (hosted PostgreSQL and authentication) to store account profiles, store records, and subscription status. We do not sell your data. Payment records in this system are mock entries for demonstration and are not connected to a real payment gateway.

You may request export or deletion of your account data at any time by contacting ${SITE.contactEmail}.`

const TERMS_OF_SERVICE = `By using Central POS you agree to use the software for lawful business purposes and to keep your account credentials secure.

Subscriptions grant access for the purchased period (weekly, monthly, or yearly) and begin after the 30-day free trial. Subscription fees are non-refundable once a period has started, except where required by law.

The software is provided “as is” without warranty of any kind. Offline data remains your responsibility — maintain backups of your device. We may update these terms; continued use after a change constitutes acceptance.

Questions: ${SITE.contactEmail}`

function SiteFooter({ onOpenLegal }: { onOpenLegal: (doc: 'privacy' | 'terms') => void }) {
  return (
    <footer className="border-t border-border bg-background">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Store className="size-[18px]" aria-hidden />
              </span>
              <span className="text-base font-semibold tracking-tight text-foreground">
                {SITE.name}
              </span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {SITE.tagline}. Built for businesses that need to keep selling — internet or not.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Product</h3>
            <ul className="mt-3 space-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Company</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Mail className="size-3.5" aria-hidden />
                  {SITE.contactEmail}
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('privacy')}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('terms')}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <Link
                  to="/login"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Admin console
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {COPYRIGHT_YEAR} {SITE.name}. All rights reserved.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5" aria-hidden />
            Works offline · Syncs when online
          </p>
        </div>
      </Container>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                         */
/* -------------------------------------------------------------------------- */

export function LandingPage() {
  const [legal, setLegal] = React.useState<'privacy' | 'terms' | null>(null)

  React.useEffect(() => {
    document.documentElement.classList.add('scroll-smooth')
    return () => document.documentElement.classList.remove('scroll-smooth')
  }, [])

  return (
    <div className="min-h-svh bg-background">
      <a
        href="#features"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <LandingHeader />
      <main>
        <Hero />
        <FeaturesSection />
        <PosTypesSection />
        <PricingSection />
        <HowItWorksSection />
        <DownloadSection />
        <FaqSection />
        <section className="border-t border-border bg-gradient-to-br from-primary/10 via-background to-violet-500/10 py-16 sm:py-20">
          <Container className="text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Ready to sell — even without internet?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
              Create your account, pick your POS type, and start your 30-day free trial. No card
              required.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <a href={REGISTER_URL}>
                  Get Started
                  <ArrowRight aria-hidden />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-6 text-base">
                <a href="#download">
                  <Download aria-hidden />
                  Download POS
                </a>
              </Button>
            </div>
          </Container>
        </section>
      </main>

      <SiteFooter onOpenLegal={setLegal} />

      <Dialog open={legal !== null} onOpenChange={(o) => { if (!o) setLegal(null) }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{legal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {legal === 'privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
