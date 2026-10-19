import * as React from 'react'
import { CloudUpload, Download, MonitorDown, ShieldCheck, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/use-async'
import {
  fetchPublishedReleases,
  formatBytes,
  latestPerPlatform,
  PLATFORM_LABELS,
  releaseDownloadHref,
} from '@/lib/releases'
import { supabaseConfigured } from '@/lib/supabase'
import type { PosRelease } from '@/lib/types'
import { Container, Section, SectionHeading } from './primitives'
import { Reveal } from './reveal'

function DownloadSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-56 rounded-xl" />
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
    <Card className="h-full transition-shadow duration-300 hover:ring-primary/35">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <CardTitle>{PLATFORM_LABELS[release.platform]}</CardTitle>
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
      </CardHeader>
    </Card>
  )
}

export function DownloadSection() {
  const releases = useAsync(async () => {
    if (!supabaseConfigured) return [] as PosRelease[]
    return fetchPublishedReleases()
  }, [])

  const latest = latestPerPlatform(releases.data ?? [])
  const hasAny = Boolean(latest.android ?? latest.windows)

  return (
    <Section id="download" tone="muted">
      <Container>
        <SectionHeading
          eyebrow="Download"
          title="Get the POS app"
          description="Install UniPOS on your device and start selling. Only published releases are shown."
        />

        <div className="mx-auto mt-12 max-w-2xl">
          {releases.loading ? (
            <DownloadSkeleton />
          ) : releases.error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm font-semibold text-destructive">
                Could not load available downloads
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{releases.error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={releases.reload}>
                Try again
              </Button>
            </div>
          ) : !hasAny ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <CloudUpload className="mx-auto size-10 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-foreground">
                No installer published yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                The first POS build has not been published. Check back soon — installers appear here
                the moment a release goes live.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {latest.android ? (
                <DownloadCard release={latest.android} icon={Smartphone} />
              ) : (
                <div className="flex flex-col rounded-xl border border-dashed border-border bg-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Smartphone className="size-5" aria-hidden />
                    </span>
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
            <Reveal className="rounded-xl border border-border/70 bg-card p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Smartphone className="size-4 text-primary" aria-hidden />
                Installing on Android
              </h4>
              <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>1. Download the APK file to your device.</li>
                <li>2. Open the file and allow “install from this source” if prompted.</li>
                <li>3. Tap Install, then open UniPOS and register your store.</li>
              </ol>
            </Reveal>
            <Reveal delay={0.08} className="rounded-xl border border-border/70 bg-card p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MonitorDown className="size-4 text-primary" aria-hidden />
                Installing on Windows
              </h4>
              <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>1. Download the installer when a Windows build is published.</li>
                <li>2. Run the installer and follow the setup wizard.</li>
                <li>3. Launch UniPOS from your Start menu and register.</li>
              </ol>
            </Reveal>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />
            Installers are hosted on our official Supabase storage — never download from third-party
            mirrors.
          </p>
        </div>
      </Container>
    </Section>
  )
}
