import * as React from 'react'
import { scannerService, type ScannerState } from '@/database/repos/scanner'

/**
 * Subscribe to the store's persisted barcode-scanner preference, loading it from
 * Dexie on mount / when the store changes. Returns the live mode so the POS and
 * the scanner settings page stay in sync without a reload.
 */
export function useScannerSettings(storeId: string | null | undefined): ScannerState {
  const [state, setState] = React.useState<ScannerState>(() => scannerService.getState())

  React.useEffect(() => {
    const unsubscribe = scannerService.subscribe(setState)
    void scannerService.init(storeId ?? null)
    return unsubscribe
  }, [storeId])

  return state
}
