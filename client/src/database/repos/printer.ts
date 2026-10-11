import { db } from '../schema'
import { detectPrintPlatform, type PlatformInfo } from '@/lib/print/platform'
import { createTransport, type PrinterDevice, type PrinterTransport } from '@/lib/print/transport'
import { buildReceipt, buildTestReceipt } from '@/lib/print/receipt'
import { buildRasterReceipt, buildRasterTest } from '@/lib/print/raster/receipt-raster'
import { WIDTH_PIXELS } from '@/lib/print/raster/canvas'
import { mockClock } from '@/lib/mock-clock'
import { notifySyncQueueChanged } from '@/offline/sync-manager'
import { syncOpFor, putSyncOp } from '../repos/helpers'
import type { Order, PrinterSettings, ReceiptLayout, Store } from '@/lib/types'
import { DEFAULT_RECEIPT_LAYOUT } from '@/lib/types'

export interface PrinterState {
  platform: PlatformInfo
  supported: boolean
  scanning: boolean
  connecting: boolean
  devices: PrinterDevice[]
  connected: PrinterDevice | null
  printing: boolean
  autoPrint: boolean
  paperWidth: 58 | 80
  layout: ReceiptLayout
  savedDevice: PrinterDevice | null
  error: string | null
}

const listeners = new Set<(s: PrinterState) => void>()

let transport: PrinterTransport | null = null
let state: PrinterState = {
  platform: detectPrintPlatform(),
  supported: false,
  scanning: false,
  connecting: false,
  devices: [],
  connected: null,
  printing: false,
  autoPrint: false,
  paperWidth: 80,
  layout: { ...DEFAULT_RECEIPT_LAYOUT },
  savedDevice: null,
  error: null,
}

function emit(): void {
  const snapshot: PrinterState = { ...state }
  listeners.forEach((fn) => fn(snapshot))
}

function patch(partial: Partial<PrinterState>): void {
  state = { ...state, ...partial }
  emit()
}

function setError(err: unknown): void {
  patch({ error: err instanceof Error ? err.message : String(err), scanning: false, connecting: false, printing: false })
}

async function currentTransport(): Promise<PrinterTransport> {
  if (transport) return transport
  transport = createTransport(state.platform.platform.kind === 'native' ? 'native' : 'web')
  transport.onDisconnect(() => {
    // OS/hardware dropped the link — reflect it honestly.
    patch({ connected: null })
    void persist()
  })
  return transport
}

async function persist(): Promise<void> {
  const settings: PrinterSettings = {
    storeId: currentStoreId,
    deviceId: state.connected?.id ?? state.savedDevice?.id ?? null,
    deviceName: state.connected?.name ?? state.savedDevice?.name ?? null,
    protocol: state.connected?.protocol ?? state.savedDevice?.protocol ?? null,
    autoPrint: state.autoPrint,
    paperWidth: state.paperWidth,
    layout: { ...state.layout },
    updatedAt: mockClock.nowIso(),
  }
  await db.printerSettings.put(settings)
  notifySyncQueueChanged()
}

let currentStoreId = ''
let initialized = false

export const printerService = {
  getState(): PrinterState {
    return state
  },

  subscribe(fn: (s: PrinterState) => void): () => void {
    listeners.add(fn)
    fn({ ...state })
    return () => listeners.delete(fn)
  },

  /**
   * Re-detect platform and load saved settings for a store.
   * Idempotent: calling again for the same store refreshes platform info
   * without dropping a live connection.
   */
  async init(storeId: string): Promise<void> {
    const info = detectPrintPlatform()
    if (initialized && currentStoreId === storeId) {
      patch({ platform: info, supported: info.canPrint })
      return
    }
    currentStoreId = storeId
    initialized = true
    patch({ platform: info, supported: info.canPrint, connected: null })
    try {
      const saved = await db.printerSettings.get(storeId)
      if (saved) {
        const device: PrinterDevice | null = saved.deviceId
          ? { id: saved.deviceId, name: saved.deviceName ?? 'Printer', protocol: saved.protocol ?? 'ble' }
          : null
        patch({
          savedDevice: device,
          autoPrint: saved.autoPrint,
          paperWidth: saved.paperWidth,
          layout: { ...DEFAULT_RECEIPT_LAYOUT, ...saved.layout },
          // Bluetooth links do not survive page reloads — saved ≠ connected.
          connected: null,
        })
      } else {
        patch({ savedDevice: null, autoPrint: false, paperWidth: 80, layout: { ...DEFAULT_RECEIPT_LAYOUT } })
      }
    } catch (err) {
      setError(err)
    }
  },

  async scan(): Promise<void> {
    if (!state.supported) return
    patch({ scanning: true, error: null, devices: [] })
    try {
      const t = await currentTransport()
      const found = await t.scan()
      patch({ scanning: false, devices: found })
      if (found.length === 0) {
        patch({ error: 'No printers found. Make sure the printer is on, in pairing mode, and nearby.' })
      }
    } catch (err) {
      setError(err)
    }
  },

  async connect(device: PrinterDevice): Promise<void> {
    if (!state.supported) return
    patch({ connecting: true, error: null })
    try {
      const t = await currentTransport()
      await t.connect(device)
      patch({ connecting: false, connected: device, savedDevice: device })
      await persist()
      await putSyncOp(
        syncOpFor('printerSettings', device.id, 'update', undefined, {
          deviceId: device.id,
          protocol: device.protocol,
        })
      )
    } catch (err) {
      setError(err)
    }
  },

  async disconnect(): Promise<void> {
    if (!state.connected) return
    try {
      const t = await currentTransport()
      await t.disconnect()
    } catch (err) {
      // Disconnect can fail if the link is already gone — still clear local state.
      console.warn('disconnect warning:', err)
    }
    patch({ connected: null })
    await persist()
  },

  async setAutoPrint(on: boolean): Promise<void> {
    patch({ autoPrint: on })
    await persist()
  },

  async setPaperWidth(width: 58 | 80): Promise<void> {
    patch({ paperWidth: width })
    await persist()
  },

  /** Update one or more receipt-layout options and persist them. */
  async setLayout(partial: Partial<ReceiptLayout>): Promise<void> {
    patch({ layout: { ...state.layout, ...partial } })
    await persist()
  },

  /** Print the self-test page. Real hardware required. */
  async testPrint(storeName: string): Promise<void> {
    if (!state.connected) {
      patch({ error: 'No printer connected.' })
      return
    }
    patch({ printing: true, error: null })
    try {
      const t = await currentTransport()
      if (t.mode === 'graphic') {
        if (typeof t.writeRaster !== 'function') {
          throw new Error('This printer is graphic-mode but the raster path is unavailable.')
        }
        await t.writeRaster(buildRasterTest(storeName, WIDTH_PIXELS, state.layout))
      } else {
        await t.write(buildTestReceipt(storeName, state.paperWidth, state.layout))
      }
    } catch (err) {
      setError(err)
      return
    }
    patch({ printing: false })
  },

  /**
   * Print an order receipt. Returns true only if the hardware accepted the job.
   * Callers must surface failures — never assume success.
   */
  async printOrder(order: Order, store: Store): Promise<boolean> {
    if (!state.connected || !state.autoPrint) return false
    if (state.printing) return false
    patch({ printing: true })
    try {
      const t = await currentTransport()
      if (t.mode === 'graphic') {
        if (typeof t.writeRaster !== 'function') {
          throw new Error('This printer is graphic-mode but the raster path is unavailable.')
        }
        await t.writeRaster(
          buildRasterReceipt(order, {
            storeName: store.name,
            layout: state.layout,
          })
        )
      } else {
        await t.write(
          buildReceipt(order, {
            storeName: store.name,
            paperWidth: state.paperWidth,
            layout: state.layout,
          })
        )
      }
      patch({ printing: false })
      return true
    } catch (err) {
      setError(err)
      return false
    }
  },

  /** Reconnect to a previously saved device (user action, not automatic). */
  async reconnectSaved(): Promise<void> {
    if (!state.savedDevice || state.connected) return
    await this.connect(state.savedDevice)
  },
}
