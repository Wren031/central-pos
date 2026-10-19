import { ArrowRight, Check, Download, Sparkles } from 'lucide-react'
import heroBackground from '@/assets/unipos.jpeg'
import { Button } from '@/components/ui/button'
import { CheckoutDemo } from '../showcase/checkout-demo'
import { CTA_BENEFITS, REGISTER_URL, SITE } from '../site'
import { Container } from './primitives'
import { Reveal } from './reveal'

export function Hero() {
  return (
    <section id="top" className="relative -mt-16 scroll-mt-20 overflow-hidden">
      {/*
        Storefront photo behind the whole hero. Decorative only — the copy and
        the POS demo carry the meaning, so the image is hidden from assistive
        technology and framed by scrims that keep text readable.
      */}
      <img
        src={heroBackground}
        alt=""
        aria-hidden
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 size-full object-cover object-center brightness-110"
      />

      {/* Base scrim: knocks the photo back just enough to keep text contrast. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-background/40 lg:bg-background/0 dark:bg-background/60"
      />

      {/* Horizontal fade: readable copy on the left, photo open toward the demo. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-background/5 lg:from-background/75 lg:via-background/25 lg:to-transparent dark:from-background dark:via-background/85 dark:to-background/40"
      />

      {/* Blend the photo into the next section instead of ending on a hard edge. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,oklch(0.66_0.21_277/0.16),transparent)]"
      />

      {/* Soften the photo where the transparent nav sits so links stay readable. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/70 to-transparent dark:from-background/80"
      />

      <Container className="relative grid max-w-7xl items-center gap-12 pt-24 pb-10 sm:pt-28 sm:pb-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:pt-32 lg:pb-16">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" aria-hidden />
              30-day free trial — no card required
            </p>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Run your store{' '}
              <span className="bg-gradient-to-br from-primary to-violet-500 bg-clip-text text-transparent">
                offline
              </span>
              , sell anywhere
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-5 max-w-lg text-base text-pretty text-muted-foreground sm:text-lg">
              {SITE.name} is an offline-first point of sale built for BBQ stands, retail shops,
              groceries, restaurants, cafes, pharmacies, and general merchandise — with receipt
              printing, inventory, and sales reports that work without internet.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
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
          </Reveal>

          <Reveal delay={0.24}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {CTA_BENEFITS.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="size-4 text-emerald-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="lg:pl-2">
          <CheckoutDemo />
        </Reveal>
      </Container>
    </section>
  )
}
