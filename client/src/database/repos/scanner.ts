import { db } from '../schema'
import { mockClock } from '@/lib/mock-clock'
import type { ScannerMode, ScannerSettings } from '@/lib/types'

/**
 * Store-scoped barcode-scanner preference.
 *
 * The scanner itself is either a camera (software decode) or a USB device that
 * emulates a keyboard; the mode only changes how the POS captures input, so it
 * is persisted locally in Dexie (`scannerSettings`) and works fully offline —
 * exactly like the printer settings service. Whether scanning exists at all is
 * decided by the admin POS-type flag (`PosTypeDef.barcodeEnabled`), not here.
 */
export interface ScannerState {
  storeId: string | null
  mode: ScannerMode
  loaded: boolean
}

export const DEFAULT_SCANNER_MODE: ScannerMode = 'camera'

const listeners = new Set<(s: ScannerState) => void>()

let state: ScannerState = {
  storeId: null,
  mode: DEFAULT_SCANNER_MODE,
  loaded: false,
}

function emit(): void {
  const snapshot: ScannerState = { ...state }
  listeners.forEach((fn) => fn(snapshot))
}

function patch(partial: Partial<ScannerState>): void {
  state = { ...state, ...partial }
  emit()
}

function coerceMode(value: unknown): ScannerMode {
  return value === 'usb' ? 'usb' : DEFAULT_SCANNER_MODE
}

export const scannerService = {
  getState(): ScannerState {
    return state
  },

  subscribe(fn: (s: ScannerState) => void): () => void {
    listeners.add(fn)
    fn({ ...state })
    return () => listeners.delete(fn)
  },

  /** Load the persisted preference for a store. Idempotent per store. */
  async init(storeId: string | null): Promise<void> {
    if (!storeId) {
      patch({ storeId: null, mode: DEFAULT_SCANNER_MODE, loaded: true })
      return
    }
    try {
      const saved = await db.scannerSettings.get(storeId)
      patch({ storeId, mode: coerceMode(saved?.mode), loaded: true })
    } catch {
      // Storage unavailable — fall back to the default without breaking the POS.
      patch({ storeId, mode: DEFAULT_SCANNER_MODE, loaded: true })
    }
  },

  async setMode(storeId: string, mode: ScannerMode): Promise<void> {
    const settings: ScannerSettings = {
      storeId,
      mode: coerceMode(mode),
      updatedAt: mockClock.nowIso(),
    }
    await db.scannerSettings.put(settings)
    patch({ storeId, mode: settings.mode, loaded: true })
  },
}
