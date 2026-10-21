import { Link } from 'react-router-dom'
import { Download, FileText, Mail } from 'lucide-react'
import { BrandLogo } from '@/components/common/brand-logo'
import { Container } from './primitives'
import { COPYRIGHT_YEAR, LOGIN_URL, NAV_LINKS, REGISTER_URL, SITE } from '../site'

const SUPPORT_LINKS = [
  { href: `mailto:${SITE.contactEmail}`, label: SITE.contactEmail, icon: Mail },
  { href: '#download', label: 'Installers & guides', icon: Download },
  { href: '#faq', label: 'Help & FAQ', icon: FileText },
] as const

export function SiteFooter({ onOpenLegal }: { onOpenLegal: (doc: 'privacy' | 'terms') => void }) {
  return (
    <footer className="border-t border-border bg-background">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center">
              <BrandLogo tone="mono" className="h-9" />
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">
              {SITE.tagline}. Built for businesses that need to keep selling — internet or not.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={REGISTER_URL}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Start free trial
              </a>
              <a
                href={LOGIN_URL}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Merchant sign in
              </a>
            </div>
          </div>

          <nav aria-label="Product">
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
          </nav>

          <nav aria-label="Support and legal">
            <h3 className="text-sm font-semibold text-foreground">Support & legal</h3>
            <ul className="mt-3 space-y-2">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <link.icon className="size-3.5" aria-hidden />
                    <span className="truncate">{link.label}</span>
                  </a>
                </li>
              ))}
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
          </nav>
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
