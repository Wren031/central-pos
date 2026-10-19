import * as React from 'react'
import { MotionConfig } from 'motion/react'
import { CtaSection } from './components/cta-section'
import { DownloadSection } from './components/download-section'
import { FaqSection } from './components/faq-section'
import { FeaturesSection } from './components/features-section'
import { Hero } from './components/hero'
import { HowItWorksSection } from './components/how-it-works-section'
import { LandingHeader } from './components/landing-header'
import { LegalDialogs } from './components/legal-dialogs'
import { PosTypesSection } from './components/pos-types-section'
import { PricingSection } from './components/pricing-section'
import { SiteFooter } from './components/site-footer'

/**
 * Public marketing page for the POS platform.
 *
 * Everything interactive here is presentation only: the checkout
 * demonstration uses fixed sample products and never writes to Supabase or
 * starts a real transaction. Registration and sign-in still hand off to the
 * POS client via `VITE_POS_APP_URL`, and published installers are still the
 * only downloads offered.
 */
export function LandingPage() {
  const [legal, setLegal] = React.useState<'privacy' | 'terms' | null>(null)

  React.useEffect(() => {
    document.documentElement.classList.add('scroll-smooth')
    return () => document.documentElement.classList.remove('scroll-smooth')
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing-surface min-h-svh bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>

        <LandingHeader />

        <main id="main-content">
          <Hero />
          <FeaturesSection />
          <PosTypesSection />
          <HowItWorksSection />
          <PricingSection />
          <DownloadSection />
          <FaqSection />
          <CtaSection />
        </main>

        <SiteFooter onOpenLegal={setLegal} />
        <LegalDialogs doc={legal} onClose={() => setLegal(null)} />
      </div>
    </MotionConfig>
  )
}
