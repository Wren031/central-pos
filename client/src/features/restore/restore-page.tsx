import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CloudDownload,
  Database,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Brand } from '@/components/common/brand'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { getPosType } from '@/lib/pos-types'
import { exportDatabase, downloadExport } from '@/services/export-service'
import { importDatabase, readBackupMeta, readFileAsText } from '@/services/import-service'
import {
  clearRestoreContext,
  readRestoreContextFor,
  releaseRetainedSession,
  retryCloudStoreConfig,
  stashRestoreContext,
  type CloudStoreConfig,
  type RestoreContext,
} from '@/services/cloud-store-config-service'
import { restoreStoreFromCloud } from '@/lib/repos'
import { useAuth } from '@/state/auth-context'

/**
 * Landing screen for an EXISTING account that signed in on a device with no
 * local POS data.
 *
 * This is the important distinction the old flow got wrong: an empty local
 * database is not a new account. The account's store/pos type already exist in
 * the cloud; here the user chooses how to bring the DATA across (or explicitly
 * continues with an empty workspace using their existing POS type).
 *
 * Restoring never changes the account's POS type and never creates a duplicate.
 */
export function RestorePage() {
  const { user, store, refresh, logout } = useAuth()
  const online = useOnlineStatus()
  const navigate = useNavigate()

  // Read once; the context is a one-shot hand-off from the login flow, scoped to
  // this account so a stale hand-off can never be reused by someone else.
  const [ctx] = React.useState<RestoreContext | null>(() => readRestoreContextFor(user?.email))
  const [cloud, setCloud] = React.useState<CloudStoreConfig | null>(() => ctx?.cloud ?? null)
  const [retryError, setRetryError] = React.useState<string | null>(() => ctx?.error ?? null)
  const [retrying, setRetrying] = React.useState(false)
  const [busy, setBusy] = React.useState<'recover' | 'export' | 'import' | null>(null)
  const [pendingFile, setPendingFile] = React.useState<{ name: string; text: string } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  // Already has a workspace (e.g. refreshed here before) → nothing to restore.
  if (user && store) return <Navigate to="/" replace />

  const cloudStore = cloud?.store ?? null
  const hasCloudStore = Boolean(cloudStore?.posType)
  const unavailable = cloud?.status === 'unavailable'
  const posDef = hasCloudStore ? getPosType(cloudStore!.posType) : null

  async function finish() {
    clearRestoreContext()
    await releaseRetainedSession()
    refresh()
    navigate('/', { replace: true })
  }

  /** Re-check the cloud after a timeout/network failure — no re-login needed. */
  async function handleRetry() {
    if (!user) return
    setRetrying(true)
    setRetryError(null)
    try {
      const next = await retryCloudStoreConfig()
      setCloud(next)
      if (next.status === 'unavailable') {
        setRetryError(next.error)
      } else {
        stashRestoreContext({
          email: user.email,
          cloud: next,
          hasCloudStore: Boolean(next.store),
          unavailable: false,
          error: null,
        })
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Could not reach the server.')
    } finally {
      setRetrying(false)
    }
  }

  /**
   * Last-resort escape: the in-memory verification session only survives while
   * this tab stays open. After a reload a retry cannot authenticate, so offer a
   * clean sign-in instead of leaving the user stuck.
   */
  async function signInAgain() {
    if (!user) return
    await logout()
    navigate('/login', { replace: true })
  }

  /** Create the local workspace from the account's cloud configuration. */
  async function handleRecoverFromCloud() {
    if (!user || !cloudStore) return
    setBusy('recover')
    try {
      await restoreStoreFromCloud(user.id, {
        name: cloudStore.name,
        posType: cloudStore.posType,
      })
      toast.success(`${getPosType(cloudStore.posType).name} restored`, {
        description: 'Your workspace type is back. Restore a backup to add products and orders.',
      })
      await finish()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not restore the workspace.')
    } finally {
      setBusy(null)
    }
  }

  /**
   * Explicit empty workspace. If the account's POS type is known it is used
   * as-is (never re-chosen). A brand-new account with no cloud config must pick
   * once, so it goes to onboarding. While the cloud answer is unknown we refuse
   * to create anything — the retry above resolves it first.
   */
  async function handleContinueEmpty() {
    if (!user) return
    if (cloudStore) {
      await handleRecoverFromCloud()
      return
    }
    if (unavailable) {
      toast.error('We could not verify your saved workspace.', {
        description: 'Check your connection and use Retry before creating a new one.',
      })
      return
    }
    clearRestoreContext()
    await releaseRetainedSession()
    navigate('/onboarding', { replace: true })
  }

  async function handleExport() {
    if (!user) return
    if (!store) {
      toast.error('This device has no workspace data to export.', {
        description: 'Export the backup from the device that has your data.',
      })
      return
    }
    setBusy('export')
    try {
      const payload = await exportDatabase({ userId: user.id, email: user.email, store })
      downloadExport(payload)
      toast.success('Backup downloaded from this device.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  async function onPickFile(file: File) {
    try {
      const text = await readFileAsText(file)
      setPendingFile({ name: file.name, text })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (!pendingFile || !user) return
    setBusy('import')
    try {
      // Read the backup's own workspace metadata first. This is what fixes the
      // old dead-end: when the cloud has no store row, the POS type recorded in
      // the backup is still authoritative, so no "sign in again" is needed.
      const meta = readBackupMeta(pendingFile.text)

      // A backup may carry a store config but business rows need a local store
      // to attach to. Create it first (using the cloud POS type when known, or
      // the type recorded inside the backup).
      let targetStore = store
      if (!targetStore) {
        const posType = cloudStore?.posType ?? meta.store.posType
        if (!posType) {
          toast.error('This backup does not record a POS workspace type.', {
            description: 'Export a fresh backup from the device that has your data.',
          })
          return
        }
        targetStore = await restoreStoreFromCloud(user.id, {
          name: cloudStore?.name ?? meta.store.name ?? user.businessName,
          posType,
        })
      }

      const result = await importDatabase(pendingFile.text, {
        userId: user.id,
        store: targetStore,
        email: user.email,
      })
      const added = Object.entries(result.restored)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
      toast.success('Backup restored', {
        description: added ? `Added ${added}.` : 'This backup is already on the device.',
      })
      await finish()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(null)
      setPendingFile(null)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6">
          <Brand />
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Existing account
          </Badge>
        </div>
      </header>

      <main className="w-full px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">This account already exists</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ctx?.email ?? user?.email} is already registered. This device just doesn&apos;t have
              its POS data yet — your products, orders and reports stay on the device where they
              were created (or in a backup file).
            </p>
          </div>

          {cloudStore && (
            <Card className="shadow-none">
              <CardHeader className="flex-row items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: posDef?.theme.accent ?? 'var(--primary)' }}
                >
                  {posDef ? <posDef.icon className="size-5" aria-hidden /> : <ShieldCheck className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">{cloudStore.name}</CardTitle>
                  <CardDescription>
                    Assigned POS type: <strong>{posDef?.name ?? cloudStore.posType}</strong> · cannot
                    be changed here
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  From cloud
                </Badge>
              </CardHeader>
            </Card>
          )}

          {unavailable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">We couldn&apos;t verify your saved workspace yet.</p>
                  <p className="mt-1 leading-relaxed">
                    {retryError ??
                      cloud?.error ??
                      'The server did not answer. Your existing workspace was not replaced.'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleRetry()}
                    disabled={retrying || busy !== null}
                  >
                    {retrying ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    {retrying ? 'Checking…' : 'Retry check'}
                  </Button>
                  {retryError?.toLowerCase().includes('session expired') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 ml-2"
                      onClick={() => void signInAgain()}
                      disabled={retrying || busy !== null}
                    >
                      Sign in again
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!cloudStore && !unavailable && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                This account has no saved workspace in the cloud. If you set it up on another
                device, export a backup there and restore it here — or continue with an empty
                workspace and choose a POS type.
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Upload className="size-4" aria-hidden />
                  Restore backup
                </CardTitle>
                <CardDescription className="text-xs">
                  Import the JSON backup exported from your original device.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy !== null || !user}
                >
                  {busy === 'import' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Choose backup file
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Download className="size-4" aria-hidden />
                  Export this device
                </CardTitle>
                <CardDescription className="text-xs">
                  Save whatever is on THIS device. Usually empty on a new device.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => void handleExport()}
                  disabled={busy !== null || !store}
                >
                  {busy === 'export' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export backup
                </Button>
              </CardContent>
            </Card>
          </div>

          {hasCloudStore && (
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CloudDownload className="size-4" aria-hidden />
                  Recover from cloud
                </CardTitle>
                <CardDescription className="text-xs">
                  Recreate your <strong>{posDef?.name}</strong> workspace on this device using the
                  saved account configuration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => void handleRecoverFromCloud()}
                  disabled={busy !== null || !online}
                  title={!online ? 'Connect to the internet to recover from the cloud' : undefined}
                >
                  {busy === 'recover' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {online ? 'Recover workspace' : 'Offline — connect to recover'}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="flex items-start gap-2">
              <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <strong>Exporting from an empty device will not recover your data.</strong> The
                backup must be exported from the original device (or restored from an existing
                backup). Restoring merges records and never deletes what is already here.
              </span>
            </span>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => void handleContinueEmpty()}
              disabled={busy !== null || retrying || unavailable}
              title={
                unavailable
                  ? 'Retry the workspace check before creating a new workspace'
                  : undefined
              }
            >
              Continue with an empty workspace
              <ArrowRight className="size-4" />
            </Button>
            <p className="self-center text-[11px] text-muted-foreground">
              {unavailable ? 'Your existing workspace will never be replaced.' : 'Your POS type is kept either way.'}
            </p>
          </div>
        </div>
      </main>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Choose a backup file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPickFile(file)
        }}
      />

      <AlertDialog open={pendingFile !== null} onOpenChange={(o) => !o && setPendingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{pendingFile?.name}</span> will be merged into your
              workspace. Existing records are kept; nothing is overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'import'}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmImport()} disabled={busy === 'import'}>
              {busy === 'import' ? 'Restoring…' : 'Restore backup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
