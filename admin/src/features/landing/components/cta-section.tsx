import { ArrowRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REGISTER_URL, SITE } from '../site'
import { Container } from './primitives'
import { Reveal } from './reveal'

export function CtaSection() {
  return (
    <section className="scroll-mt-20 border-t border-border bg-muted/60 py-16 sm:py-20">
      <Container>
        <Reveal className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_120%_at_50%_0%,oklch(0.66_0.21_277/0.16),transparent)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
              Ready to sell — even without internet?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-muted-foreground">
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
            <p className="mt-5 text-xs text-muted-foreground">
              Questions? Email{' '}
              <a
                href={`mailto:${SITE.contactEmail}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {SITE.contactEmail}
              </a>
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
