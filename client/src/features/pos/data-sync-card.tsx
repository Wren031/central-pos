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
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useSyncStatus } from '@/hooks/use-sync-status'
import { syncManager } from '@/offline/sync-manager'
import { downloadExport, exportDatabase } from '@/services/export-service'
import { importDatabase, readFileAsText } from '@/services/import-service'
import { cn } from '@/lib/utils'

/**
 * Export/import + sync controls. Cloud sync is simulated; this is an
 * offline-first demo build with no backend.
 */
export function DataSyncCard() {
  const online = useOnlineStatus()
  const s = useSyncStatus()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = React.useState(false)
  const [importing, setImporting] = React.useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const payload = await exportDatabase()
      downloadExport(payload)
      toast.success('Backup downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    try {
      const text = await readFileAsText(file)
      const result = await importDatabase(text)
      const parts = Object.entries(result.restored)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
      toast.success(`Backup restored — ${parts || 'nothing to restore'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
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
          Your data lives in this browser (IndexedDB) and works fully offline. Cloud sync is
          simulated for demo purposes — export a JSON backup to move data between devices.
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
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Export backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import backup file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
            }}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Importing replaces all local data with the backup contents. Passwords are not included
          in exports — accounts must re-register or reset after a restore.
        </p>
      </CardContent>
    </Card>
  )
}
