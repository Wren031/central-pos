import { CloudOff, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useSyncStatus } from '@/hooks/use-sync-status'
import { syncManager } from '@/offline/sync-manager'
import { cn } from '@/lib/utils'

function dotClass(s: ReturnType<typeof useSyncStatus>, online: boolean): string {
  if (s.syncing) return 'bg-blue-500 animate-pulse'
  if (!online) return 'bg-amber-500'
  if (s.failedCount > 0) return 'bg-destructive'
  return 'bg-emerald-500'
}

/**
 * Compact connectivity + sync pill for the app header.
 * Shows offline/failed states at a glance; click for details and manual sync.
 */
export function SyncStatusPill() {
  const online = useOnlineStatus()
  const s = useSyncStatus()
  const hasIssue = !online || s.failedCount > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors',
            hasIssue
              ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-transparent text-muted-foreground hover:bg-muted'
          )}
          aria-label={
            online
              ? `Sync status: ${s.pendingCount} pending`
              : 'You are offline — changes are saved on this device'
          }
        >
          <span className={cn('size-2 rounded-full', dotClass(s, online))} aria-hidden />
          {s.syncing ? (
            <RefreshCw className="size-3 animate-spin" aria-hidden />
          ) : online ? (
            <Wifi className="size-3" aria-hidden />
          ) : (
            <WifiOff className="size-3" aria-hidden />
          )}
          {!online && <span>Offline</span>}
          {online && s.failedCount > 0 && <span>{s.failedCount} failed</span>}
          {online && s.failedCount === 0 && s.pendingCount > 0 && !s.syncing && (
            <span>{s.pendingCount} queued</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-sm">
          <div className="flex items-center justify-between">
            <span>Data &amp; sync</span>
            <Badge variant={online ? 'secondary' : 'outline'} className="text-[10px]">
              {online ? 'Online' : 'Offline'}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between py-0.5">
            <span>Pending changes</span>
            <span className="font-medium text-foreground">{s.pendingCount}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span>Failed</span>
            <span className={cn('font-medium', s.failedCount > 0 ? 'text-destructive' : 'text-foreground')}>
              {s.failedCount}
            </span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span>Last synced</span>
            <span className="font-medium text-foreground">
              {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString() : 'Never'}
            </span>
          </div>
        </div>
        <p className="px-3 pb-2 text-[10px] leading-relaxed text-muted-foreground">
          {online
            ? 'Changes are queued locally and pushed to the cloud sync service.'
            : 'You can keep selling — everything is saved on this device and syncs when you are back online.'}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!online || s.syncing}
          onSelect={() => void syncManager.syncNow()}
        >
          <RefreshCw className={cn('size-4', s.syncing && 'animate-spin')} /> Sync now
        </DropdownMenuItem>
        {s.failedCount > 0 && (
          <DropdownMenuItem onSelect={() => void syncManager.retryFailed()}>
            <CloudOff className="size-4" /> Retry failed ({s.failedCount})
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => syncManager.setSimulateFailure(!s.simulateFailure)}
        >
          <CloudOff className={cn('size-4', s.simulateFailure && 'text-destructive')} />
          Simulate sync failure
          <span className="ml-auto text-[10px] text-muted-foreground">
            {s.simulateFailure ? 'On' : 'Off'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-3 pb-2 text-[10px] text-muted-foreground">
          Cloud sync is simulated for demo purposes.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Compact offline-only badge (no dropdown) for tight headers. */
export function OfflineBadge() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
      <CloudOff className="size-3" /> Offline
    </Badge>
  )
}
