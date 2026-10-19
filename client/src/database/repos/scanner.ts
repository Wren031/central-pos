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
  /** Whether barcode scanning is currently allowed at the POS. */
  enabled: boolean
  loaded: boolean
}

export const DEFAULT_SCANNER_MODE: ScannerMode = 'camera'
export const DEFAULT_SCANNER_ENABLED = true

const listeners = new Set<(s: ScannerState) => void>()

let state: ScannerState = {
  storeId: null,
  mode: DEFAULT_SCANNER_MODE,
  enabled: DEFAULT_SCANNER_ENABLED,
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

function coerceEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SCANNER_ENABLED
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
      patch({
        storeId: null,
        mode: DEFAULT_SCANNER_MODE,
        enabled: DEFAULT_SCANNER_ENABLED,
        loaded: true,
      })
      return
    }
    try {
      const saved = await db.scannerSettings.get(storeId)
      patch({
        storeId,
        mode: coerceMode(saved?.mode),
        enabled: coerceEnabled(saved?.enabled),
        loaded: true,
      })
    } catch {
      // Storage unavailable — fall back to the default without breaking the POS.
      patch({
        storeId,
        mode: DEFAULT_SCANNER_MODE,
        enabled: DEFAULT_SCANNER_ENABLED,
        loaded: true,
      })
    }
  },

  async setMode(storeId: string, mode: ScannerMode): Promise<void> {
    const settings: ScannerSettings = {
      storeId,
      mode: coerceMode(mode),
      enabled: coerceEnabled(state.enabled),
      updatedAt: mockClock.nowIso(),
    }
    await db.scannerSettings.put(settings)
    patch({ storeId, mode: settings.mode, enabled: settings.enabled, loaded: true })
  },

  /** Turn barcode scanning on or off for the store without forgetting the mode. */
  async setEnabled(storeId: string, enabled: boolean): Promise<void> {
    const settings: ScannerSettings = {
      storeId,
      mode: coerceMode(state.mode),
      enabled: Boolean(enabled),
      updatedAt: mockClock.nowIso(),
    }
    await db.scannerSettings.put(settings)
    patch({ storeId, mode: settings.mode, enabled: settings.enabled, loaded: true })
  },
}
