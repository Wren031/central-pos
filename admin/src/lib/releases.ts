import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import type { PosRelease, ReleasePlatform } from '@/lib/types'

export const RELEASE_BUCKET = 'pos-releases'

export const PLATFORM_LABELS: Record<ReleasePlatform, string> = {
  android: 'Android',
  windows: 'Windows',
}

export const PLATFORM_FILE_HINTS: Record<ReleasePlatform, string> = {
  android: '.apk',
  windows: '.exe',
}

/** Published releases, newest first. Readable by anon (landing page). */
export async function fetchPublishedReleases(): Promise<PosRelease[]> {
  const { data, error } = await supabase
    .from('pos_releases')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw new Error(errorMessage(error))
  return (data ?? []) as PosRelease[]
}

/** Latest published release per platform (undefined when none published). */
export function latestPerPlatform(
  releases: PosRelease[]
): Partial<Record<ReleasePlatform, PosRelease>> {
  const latest: Partial<Record<ReleasePlatform, PosRelease>> = {}
  for (const r of releases) {
    if (!latest[r.platform]) latest[r.platform] = r
  }
  return latest
}

/**
 * Resolves the browser-facing download URL for a release. Prefers an
 * explicitly configured external URL; falls back to the public URL of the
 * uploaded installer in the pos-releases bucket. Returns null when the row
 * has no usable source (never fabricates a link).
 */
export function releaseDownloadHref(release: PosRelease): string | null {
  if (release.download_url) return release.download_url
  if (release.file_path) {
    return supabase.storage.from(RELEASE_BUCKET).getPublicUrl(release.file_path).data
      .publicUrl
  }
  return null
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const u of units) {
    if (value < 1024) {
      unit = u
      break
    }
    value /= 1024
    unit = u
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
}
