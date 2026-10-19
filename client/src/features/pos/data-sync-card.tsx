import * as React from 'react'
import { Database, Download, Loader2, RefreshCw, Upload } from 'lucide-react'
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
import { useAuth } from '@/state/auth-context'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useSyncStatus } from '@/hooks/use-sync-status'
import { syncManager } from '@/offline/sync-manager'
import { downloadExport, exportDatabase } from '@/services/export-service'
import { importDatabase, readFileAsText } from '@/services/import-service'
import { cn } from '@/lib/utils'

/**
 * Account-scoped export/import + sync controls. Cloud sync of business data is
 * simulated (the data lives in this browser's IndexedDB); the JSON backup is the
 * supported way to move a workspace between devices.
 */
export function DataSyncCard() {
  const { user, store, refresh } = useAuth()
  const online = useOnlineStatus()
  const s = useSyncStatus()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [pendingFile, setPendingFile] = React.useState<{ name: string; text: string } | null>(null)

  async function handleExport() {
    if (!user || !store) {
      toast.error('Set up your workspace before exporting a backup.')
      return
    }
    setExporting(true)
    try {
      const payload = await exportDatabase({ userId: user.id, email: user.email, store })
      downloadExport(payload)
      const count =
        payload.data.products.length +
        payload.data.orders.length +
        payload.data.customers.length
      toast.success('Backup downloaded', {
        description: count === 0 ? 'This workspace has no sales data yet.' : undefined,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
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
    if (!pendingFile || !user || !store) return
    setImporting(true)
    try {
      const result = await importDatabase(pendingFile.text, {
        userId: user.id,
        store,
        email: user.email,
      })
      const added = Object.entries(result.restored)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
      toast.success('Backup merged', {
        description: added
          ? `Added ${added}. Existing records were kept.`
          : 'Nothing new to add — this backup is already on the device.',
      })
      if (result.differentAccount) {
        toast.info('Backup came from a different account', {
          description: 'Rows were attached to your current account and workspace.',
        })
      }
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
      setPendingFile(null)
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4" aria-hidden />
          Data &amp; sync
        </CardTitle>
        <CardDescription>
          Your data lives in this browser (IndexedDB) and works fully offline. Export a JSON backup
          to move this workspace to another device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs">
          <span
            className={cn(
              'size-2 rounded-full',
              s.failedCount > 0 ? 'bg-destructive' : s.syncing ? 'animate-pulse bg-blue-500' : online ? 'bg-emerald-500' : 'bg-amber-500'
            )}
            aria-hidden
          />
          <span className="font-medium">{online ? (s.syncing ? 'Syncing…' : 'Online') : 'Offline — changes queued locally'}</span>
          <span className="ml-auto flex items-center gap-2 text-muted-foreground">
            {s.pendingCount > 0 && <Badge variant="secondary">{s.pendingCount} pending</Badge>}
            {s.failedCount > 0 && <Badge variant="destructive">{s.failedCount} failed</Badge>}
            <span>Last sync: {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never'}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void syncManager.syncNow()} disabled={!online || s.syncing}>
            {s.syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Sync now
          </Button>
          {s.failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => void syncManager.retryFailed()}>
              Retry failed
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting || !store}
          >
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Export backup
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={importing || !store}
          >
            {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Restore backup
          </Button>
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
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The backup contains only <strong>this account and this store</strong> (products, stock,
          customers, orders, reports and device settings). Restoring <strong>merges</strong> — it
          never deletes or overwrites existing records. Passwords and keys are never included.
        </p>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
          <strong>Moving devices?</strong> Export the backup from the device that has the data. A
          backup exported from an empty device will not recover data saved on another device.
        </p>

        <AlertDialog open={pendingFile !== null} onOpenChange={(o) => !o && setPendingFile(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-mono text-xs">{pendingFile?.name}</span> will be merged into{' '}
                <strong>{store?.name ?? 'your workspace'}</strong>. Existing products, orders and
                customers are kept; only records that aren&apos;t already here are added.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmImport()} disabled={importing}>
                {importing ? 'Restoring…' : 'Restore backup'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
