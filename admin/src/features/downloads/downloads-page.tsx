import * as React from 'react'
import {
  ExternalLink,
  Link2,
  Loader2,
  MonitorDown,
  Pencil,
  Plus,
  RotateCw,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import {
  PLATFORM_FILE_HINTS,
  PLATFORM_LABELS,
  releaseDownloadHref,
} from '@/lib/releases'
import type { PosRelease, ReleasePlatform, ReleaseStatus } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { Modal } from '@/components/common/modal'
import { ConfirmModal, EmptyState, ErrorState, TableWrap } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

interface ReleaseForm {
  platform: ReleasePlatform
  version: string
  release_notes: string
  published: boolean
  download_url: string
}

const EMPTY_FORM: ReleaseForm = {
  platform: 'android',
  version: '',
  release_notes: '',
  published: false,
  download_url: '',
}

const VERSION_RE = /^\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.-]+)?$/

function platformIcon(platform: ReleasePlatform) {
  return platform === 'android' ? Smartphone : MonitorDown
}

export function DownloadsPage() {
  const [editing, setEditing] = React.useState<
    { mode: 'create' | 'edit'; id?: string; form: ReleaseForm } | null
  >(null)
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState<PosRelease | null>(null)

  const releases = useAsync(async () => {
    const { data, error } = await supabase
      .from('pos_releases')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as PosRelease[]
  }, [])

  function openCreate() {
    setEditing({ mode: 'create', form: { ...EMPTY_FORM } })
  }

  function openEdit(r: PosRelease) {
    setEditing({
      mode: 'edit',
      id: r.id,
      form: {
        platform: r.platform,
        version: r.version,
        release_notes: r.release_notes ?? '',
        published: r.status === 'published',
        download_url: r.download_url ?? '',
      },
    })
  }

  async function togglePublished(r: PosRelease) {
    setBusy(true)
    try {
      const next: ReleaseStatus = r.status === 'published' ? 'draft' : 'published'
      const { error } = await supabase
        .from('pos_releases')
        .update({ status: next })
        .eq('id', r.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`v${r.version} ${next === 'published' ? 'published' : 'unpublished'}.`)
      releases.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      const { error } = await supabase.from('pos_releases').delete().eq('id', deleting.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`Release v${deleting.version} deleted.`)
      setDeleting(null)
      releases.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveForm() {
    if (!editing) return
    const { form, mode, id } = editing

    if (!VERSION_RE.test(form.version.trim())) {
      toast.error('Enter a version like 1.0.0 or 1.2.3-beta.')
      return
    }

    const downloadUrl = form.download_url.trim()
    if (!downloadUrl) {
      toast.error('A download URL is required.')
      return
    }
    try {
      const u = new URL(downloadUrl)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error()
    } catch {
      toast.error('Download URL must be a valid http(s) URL.')
      return
    }

    setBusy(true)
    try {
      const payload = {
        platform: form.platform,
        version: form.version.trim(),
        release_notes: form.release_notes.trim() || null,
        status: (form.published ? 'published' : 'draft') as ReleaseStatus,
        download_url: downloadUrl,
      }

      if (mode === 'create') {
        const { error } = await supabase.from('pos_releases').insert(payload)
        if (error) throw new Error(errorMessage(error))
        toast.success(`Release v${payload.version} created.`)
      } else {
        const { error } = await supabase
          .from('pos_releases')
          .update(payload)
          .eq('id', id!)
        if (error) throw new Error(errorMessage(error))
        toast.success(`Release v${payload.version} updated.`)
      }
      setEditing(null)
      releases.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Downloads"
        description="Publish the latest POS installers shown on the public landing page."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={releases.reload}>
              <RotateCw className="size-4" />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              New release
            </Button>
          </>
        }
      />

      {releases.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : releases.error ? (
        <ErrorState message={releases.error} onRetry={releases.reload} />
      ) : (releases.data ?? []).length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No releases yet"
          description="Create your first release with an external download URL to make the POS installer available from the landing page."
          action={
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              New release
            </Button>
          }
        />
      ) : (
        <div className="rounded-2xl border border-border/70 bg-card shadow-xs">
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Download URL</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="w-36 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(releases.data ?? []).map((r) => {
                  const Icon = platformIcon(r.platform)
                  const href = releaseDownloadHref(r)
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                          <Icon className="size-4 text-primary" aria-hidden />
                          {PLATFORM_LABELS[r.platform]}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">v{r.version}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === 'published'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-white/10 bg-white/5 text-muted-foreground'
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden max-w-56 md:table-cell">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 truncate font-mono text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="size-3 shrink-0" aria-hidden />
                            {href}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {formatDateTime(r.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void togglePublished(r)}
                          >
                            {r.status === 'published' ? 'Unpublish' : 'Publish'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            title="Edit"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleting(r)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableWrap>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Installers are hosted externally — each release stores a direct http(s) download URL. Only
        published releases appear on the landing page.
      </p>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'create' ? 'New release' : 'Edit release'}
        size="lg"
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select
                  value={editing.form.platform}
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, platform: v as ReleasePlatform },
                    })
                  }
                  disabled={editing.mode === 'edit'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="android">Android (APK)</SelectItem>
                    <SelectItem value="windows">Windows (EXE)</SelectItem>
                  </SelectContent>
                </Select>
                {editing.mode === 'edit' && (
                  <p className="text-[11px] text-muted-foreground/70">
                    Platform cannot change after creation.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Version</Label>
                <Input
                  type="text"
                  className="font-mono"
                  placeholder="1.0.0"
                  value={editing.form.version}
                  onChange={(e) =>
                    setEditing({ ...editing, form: { ...editing.form, version: e.target.value } })
                  }
                />
                <p className="text-[11px] text-muted-foreground/70">
                  Semantic version, e.g. 1.0.0. Unique per platform.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="release-download-url">
                Download URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="release-download-url"
                type="url"
                inputMode="url"
                required
                placeholder="https://example.com/central-pos.apk"
                value={editing.form.download_url}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, download_url: e.target.value } })
                }
              />
              <p className="text-[11px] text-muted-foreground/70">
                Direct link to the {PLATFORM_FILE_HINTS[editing.form.platform]} hosted outside
                Supabase (GitHub Releases, Google Drive, your CDN). Required — releases without a
                URL cannot be published.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Release notes</Label>
              <Textarea
                rows={4}
                placeholder="What’s new in this build?"
                value={editing.form.release_notes}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, release_notes: e.target.value },
                  })
                }
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <Switch
                size="sm"
                checked={editing.form.published}
                onCheckedChange={(checked) =>
                  setEditing({ ...editing, form: { ...editing.form, published: checked } })
                }
              />
              <span className="text-sm font-medium">Published (visible on landing page)</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void saveForm()} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {editing.mode === 'create' ? 'Create release' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title="Delete release"
        message={
          <>
            Delete <span className="font-mono font-semibold">v{deleting?.version}</span> (
            {deleting && PLATFORM_LABELS[deleting.platform]})? The external file itself is not
            touched. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
