import { ArrowRight, Check, Download, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CheckoutDemo } from '../showcase/checkout-demo'
import { CTA_BENEFITS, REGISTER_URL, SITE } from '../site'
import { Container } from './primitives'
import { Reveal } from './reveal'

export function Hero() {
  return (
    <section id="top" className="relative scroll-mt-20 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,oklch(0.511_0.262_277/0.12),transparent)]"
      />

      <Container className="relative grid max-w-7xl items-center gap-12 py-14 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:py-24">
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
