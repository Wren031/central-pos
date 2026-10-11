import * as React from 'react'
import { syncManager, type SyncState } from '@/offline/sync-manager'

export function useSyncStatus(): SyncState {
  const [state, setState] = React.useState<SyncState>(() => syncManager.getState())
  React.useEffect(() => {
    syncManager.start()
    return syncManager.subscribe(setState)
  }, [])
  return state
}
