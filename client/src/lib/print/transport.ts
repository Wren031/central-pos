/**
 * Printer transports — the only code that talks to hardware.
 *
 * Every method either succeeds because the hardware actually acknowledged it,
 * or rejects with the real error. Nothing here simulates success.
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  CHAR_CONTROL,
  CHAR_DATA,
  CHAR_NOTIFY,
  GATT_SERVICE,
  KEEPALIVE_MS,
  PrinterError,
  uuid,
  Mxw01PrintSession,
  type Mxw01Link,
} from './raster/mxw01'
import type { PrinterProtocol } from './platform'

export type PrinterMode = 'escpos' | 'graphic'

export interface PrinterDevice {
  id: string
  name: string
  protocol: PrinterProtocol
  /** Bluetooth signal strength when known (0-100). */
  rssi?: number
}

export interface PrinterTransport {
  readonly kind: 'web-ble' | 'capacitor'
  /**
   * 'graphic' = a raster printer (MXW01) that does not speak ESC/POS. When
   * set, write() is off limits and writeRaster() is the only thing to call.
   */
  readonly mode: PrinterMode
  /** Returns the transport's own device list (native) or [] (web picker handles discovery). */
  scan(): Promise<PrinterDevice[]>
  connect(device: PrinterDevice): Promise<void>
  disconnect(): Promise<void>
  /** Write raw bytes with hardware pacing. Rejects on real failure. */
  write(bytes: Uint8Array): Promise<void>
  /** Print a 48-bytes-per-line raster to a graphic-mode printer. */
  writeRaster?(lines: Uint8Array, opts?: { feedLines?: number }): Promise<void>
  /** Register for async disconnects fired by the OS/hardware. */
  onDisconnect(cb: (deviceId: string) => void): () => void
}

/* ------------------------------------------------------------------ */
/* Web Bluetooth (BLE GATT) — real implementation, Chrome/Edge only.  */
/* ------------------------------------------------------------------ */

/** BLE services commonly used by portable mini thermal printers. */
const KNOWN_PRINTER_SERVICES = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 UART
  '0000ae30-0000-1000-8000-00805f9b34fb', // XPrinter BLE
  '0000fe59-0000-1000-8000-00805f9b34fb', // WeChat-style BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common Chinese thermal modules
  '0000fff0-0000-1000-8000-00805f9b34fb', // HDSC / many BLE printers
  '0000ff10-0000-1000-8000-00805f9b34fb', // Generic BLE serial
  '000018f0-0000-1000-8000-00805f9b34fb', // Some ESC/POS BLE printers
  '0000fee7-0000-1000-8000-00805f9b34fb', // WeChat hardware platform
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Generic BLE serial bridge
]

/** Max bytes per characteristic write (default GATT MTU minus 3 byte header). */
const BLE_CHUNK = 20
const BLE_WRITE_DELAY_MS = 20
/** Give the printer firmware a moment to be ready before the first write. */
const BLE_SETTLE_MS = 150

type CharacteristicValueEvent = { target: { value: DataView } }

type WebBluetoothCharacteristic = {
  writeValue(data: Uint8Array): Promise<void>
  writeValueWithoutResponse?(data: Uint8Array): Promise<void>
  startNotifications?(): Promise<void>
  uuid?: string
  properties: { write: boolean; writeWithoutResponse: boolean; notify?: boolean }
  addEventListener?(type: 'characteristicvaluechanged', cb: (ev: CharacteristicValueEvent) => void): void
}

type WebBluetoothService = {
  getCharacteristic(uuid: string): Promise<WebBluetoothCharacteristic>
  getCharacteristics(): Promise<WebBluetoothCharacteristic[]>
}

type WebBluetoothDevice = {
  id: string
  name?: string
  gatt?: {
    connected: boolean
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<WebBluetoothService>
      getPrimaryServices(): Promise<WebBluetoothService[]>
    }>
    disconnect(): void
  }
  /**
   * The `gattserverdisconnected` event fires on the BluetoothDevice itself,
   * never on BluetoothRemoteGATTServer (which is not an EventTarget).
   */
  addEventListener?(type: 'gattserverdisconnected', cb: () => void): void
  removeEventListener?(type: 'gattserverdisconnected', cb: () => void): void
}

declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: {
        acceptAllDevices?: boolean
        filters?: { namePrefix?: string; services?: string[] }[]
        optionalServices?: string[]
      }): Promise<WebBluetoothDevice>
      getDevices?(): Promise<WebBluetoothDevice[]>
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class WebBleTransport implements PrinterTransport {
  readonly kind = 'web-ble' as const
  mode: PrinterMode = 'escpos'
  private device: WebBluetoothDevice | null = null
  /** Device chosen in the most recent scan() — reused by connect() without a second picker. */
  private lastPicked: WebBluetoothDevice | null = null
  private characteristic: WebBluetoothCharacteristic | null = null
  /** True when the chosen characteristic prefers write-without-response. */
  private useNoResponse = false
  /** Graphic-mode (MXW01) characteristics — set only when the link is live. */
  private graphic: { control: WebBluetoothCharacteristic; data: WebBluetoothCharacteristic; notify: WebBluetoothCharacteristic } | null = null
  /** The graphic-mode session; methods reject until setupGraphic() has run. */
  private mxwSession: Mxw01PrintSession | null = null
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null
  private disconnectCb: ((deviceId: string) => void) | null = null
  /** Handler registered on the device for 'gattserverdisconnected' (kept for cleanup). */
  private deviceDisconnectHandler: (() => void) | null = null

  /** Web Bluetooth has no scan API — Chrome shows its own picker. */
  async scan(): Promise<PrinterDevice[]> {
    const nav = navigator as unknown as Navigator & {
      bluetooth?: Navigator['bluetooth']
    }
    if (!nav.bluetooth) {
      throw new Error('Web Bluetooth is not available in this browser.')
    }
    try {
      const picked = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PRINTER_SERVICES,
      })
      this.lastPicked = picked
      return [
        {
          id: picked.id,
          name: picked.name || 'BLE printer',
          protocol: 'ble',
        },
      ]
    } catch (err) {
      // User dismissed the picker, or no BLE adapter — surface it honestly.
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        throw new Error('No printer was selected in the browser picker.')
      }
      throw err instanceof Error ? err : new Error('Could not scan for BLE devices.')
    }
  }

  async connect(device: PrinterDevice): Promise<void> {
    const nav = navigator as unknown as Navigator & {
      bluetooth?: Navigator['bluetooth']
    }
    if (!nav.bluetooth) throw new Error('Web Bluetooth is not available in this browser.')

    // Drop any listener left over from a previous connection.
    if (this.device && this.deviceDisconnectHandler && typeof this.device.removeEventListener === 'function') {
      this.device.removeEventListener('gattserverdisconnected', this.deviceDisconnectHandler)
      this.deviceDisconnectHandler = null
    }

    // Web Bluetooth forbids passing both acceptAllDevices and filters, and a
    // device must be resolved without a second picker whenever possible:
    //  1. the device picked during scan() in this session, else
    //  2. a previously granted device (Chrome keeps origin permission across reloads), else
    //  3. a fresh picker using ONLY filters (never together with acceptAllDevices).
    let picked: WebBluetoothDevice | null = null

    if (this.lastPicked?.id === device.id) {
      picked = this.lastPicked
    }

    if (!picked && typeof nav.bluetooth.getDevices === 'function') {
      try {
        const known = await nav.bluetooth.getDevices()
        picked = known.find((d) => d.id === device.id) ?? null
      } catch {
        // Permission lookup failed — fall through to the picker.
      }
    }

    if (!picked) {
      picked = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: device.name.slice(0, 8) }],
        optionalServices: KNOWN_PRINTER_SERVICES,
      })
    }
    this.lastPicked = picked

    const gatt = picked.gatt
    if (!gatt) throw new Error('The selected device exposes no GATT server.')

    const server = await gatt.connect()
    this.device = picked

    // Graphic-mode (MXW01) printers first: they expose ae30 and talk a raster
    // protocol that has nothing to do with ESC/POS. The ae01/ae02/ae03 layout
    // must win over the generic writable-characteristic search below — that
    // search grabs ae01 (the control pipe) and quietly eats every byte.
    if (await this.trySetupGraphic(server, picked.name ?? '')) {
      await sleep(BLE_SETTLE_MS)
      this.registerDisconnect(picked, device.id)
      return
    }

    // Find a writable characteristic. BLE thermal printers stream raw bytes and
    // many never ack a "with response" write, so prefer write-without-response.
    const pick = (
      chars: WebBluetoothCharacteristic[]
    ): { ch: WebBluetoothCharacteristic; noResponse: boolean } | null => {
      const writable = chars.filter((c) => c.properties.write || c.properties.writeWithoutResponse)
      if (writable.length === 0) return null
      const noResp = writable.find((c) => c.properties.writeWithoutResponse)
      if (noResp) return { ch: noResp, noResponse: true }
      return { ch: writable[0], noResponse: false }
    }

    let found: WebBluetoothCharacteristic | null = null
    let preferNoResponse = false
    for (const serviceUuid of KNOWN_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid)
        const picked = pick(await service.getCharacteristics())
        if (picked) {
          found = picked.ch
          preferNoResponse = picked.noResponse
          break
        }
      } catch {
        // Service not present on this printer — try the next known one.
      }
    }

    // Fallback: any service this page was already granted (covers printers whose
    // service UUID we do not recognise but that are exposed to us).
    if (!found) {
      try {
        for (const service of await server.getPrimaryServices()) {
          const picked = pick(await service.getCharacteristics())
          if (picked) {
            found = picked.ch
            preferNoResponse = picked.noResponse
            break
          }
        }
      } catch {
        // getPrimaryServices unsupported — ignore.
      }
    }

    if (!found) {
      gatt.disconnect()
      throw new Error(
        'No writable print characteristic found on this printer. It may not be an ESC/POS BLE printer.'
      )
    }
    this.characteristic = found
    this.useNoResponse = preferNoResponse
    // Let the printer firmware settle before the first write.
    await sleep(BLE_SETTLE_MS)

    this.registerDisconnect(picked, device.id)
  }

  /**
   * Binds the device's own disconnect event — it belongs to the BluetoothDevice,
   * not the GATT server. Older/edge implementations may not expose EventTarget
   * on the device, so skip registration gracefully; write failures still surface.
   */
  private registerDisconnect(picked: WebBluetoothDevice, deviceId: string): void {
    if (typeof picked.addEventListener === 'function') {
      const onDisconnected = () => {
        this.characteristic = null
        this.teardownGraphic()
        this.disconnectCb?.(deviceId)
      }
      picked.addEventListener('gattserverdisconnected', onDisconnected)
      this.deviceDisconnectHandler = onDisconnected
    }
  }

  /**
   * Opens the ae30 service the MXW01 exposes and verifies the graphic layout
   * (write-without-response control, notify data stream). A device named MXW01
   * is trusted unconditionally; anything else must actually show that layout,
   * because ESC/POS serial-tunnel printers also use ae30.
   */
  private async trySetupGraphic(
    server: { getPrimaryService(uuid: string): Promise<WebBluetoothService> },
    deviceName: string,
  ): Promise<boolean> {
    let service: WebBluetoothService
    try {
      service = await server.getPrimaryService(uuid(GATT_SERVICE))
    } catch {
      return false
    }
    if (!/mxw/i.test(deviceName) && !/mxw0?-?1/i.test(deviceName)) {
      // ae30 alone is not proof: some ESC/POS printers tunnel over it too.
      // The graphic layout is the ae01(write) + ae02(notify) + ae03(data)
      // triad; require all three before trusting the raster protocol.
      try {
        const chars = await service.getCharacteristics()
        const find = (prefix: string) =>
          chars.find((c) => (c.uuid ?? '').toLowerCase().startsWith(`0000${prefix}`))
        const ctrl = find('ae01')
        const nf = find('ae02')
        const data = find('ae03')
        if (
          !ctrl?.properties.writeWithoutResponse ||
          !nf?.properties.notify ||
          !data?.properties.writeWithoutResponse
        ) {
          return false
        }
      } catch {
        return false
      }
    }
    try {
      const control = await service.getCharacteristic(uuid(CHAR_CONTROL))
      const data = await service.getCharacteristic(uuid(CHAR_DATA))
      const notify = await service.getCharacteristic(uuid(CHAR_NOTIFY))
      this.graphic = { control, data, notify }
      if (typeof notify.startNotifications !== 'function') {
        throw new PrinterError('this printer does not stream notifications')
      }
      await notify.startNotifications()
      const link: Mxw01Link = {
        isConnected: () => this.device?.gatt?.connected === true && this.graphic !== null,
        writeControl: async (b) => {
          const g = this.graphic
          if (!g || !g.control.writeValueWithoutResponse) throw new PrinterError('not connected')
          await g.control.writeValueWithoutResponse(b)
        },
        writeData: async (b) => {
          const g = this.graphic
          if (!g || !g.data.writeValueWithoutResponse) throw new PrinterError('not connected')
          await g.data.writeValueWithoutResponse(b)
        },
        onNotification: (cb) => {
          this.graphic?.notify.addEventListener?.('characteristicvaluechanged', (ev) => {
            const v = ev.target.value
            cb(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
          })
        },
      }
      this.mxwSession = new Mxw01PrintSession(link, {
        // Advisory (non-blocking) printer diagnostics — surfaced, never fatal.
        onWarning: (message) => console.warn('[printer]', message),
      })
      this.mode = 'graphic'
      this.startKeepalive()
      return true
    } catch {
      this.teardownGraphic()
      return false
    }
  }

  /** Re-open a dropped GATT connection and rebuild the graphic session. */
  private async rewireGraphic(): Promise<void> {
    if (!this.device?.gatt) throw new PrinterError('not connected')
    const server = await this.device.gatt.connect()
    const ok = await this.trySetupGraphic(server, this.device.name ?? '')
    if (!ok) throw new PrinterError('could not re-open the graphic pipe')
  }

  private startKeepalive(): void {
    this.stopKeepalive()
    const tick = (): void => {
      this.keepaliveTimer = setTimeout(() => {
        void (async () => {
          if (this.mode !== 'graphic' || !this.graphic) return
          try {
            await this.mxwSession?.keepalive()
          } catch {
            // A drop surfaces on its own (next print, or the disconnect event).
          }
          tick()
        })()
      }, KEEPALIVE_MS)
    }
    tick()
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  private teardownGraphic(): void {
    this.stopKeepalive()
    this.graphic = null
    this.mxwSession = null
    this.mode = 'escpos'
  }

  /** Prints a graphic-mode raster on an MXW01, verified by the printer's checksum echo. */
  async writeRaster(lines: Uint8Array, opts?: { feedLines?: number }): Promise<void> {
    if (this.mode !== 'graphic' || !this.mxwSession) {
      throw new Error('This printer is not in graphic mode.')
    }
    const result = await this.mxwSession.print(lines, opts, () => this.rewireGraphic())
    if (!result.ok) {
      throw new Error(
        `The printer checksum did not match (received ${result.reported}, expected ${result.expected}); ` +
          `the ticket is incomplete — re-print it.`,
      )
    }
  }

  async disconnect(): Promise<void> {
    // Detach the listener first so our own disconnect() doesn't fire the callback.
    if (this.device && this.deviceDisconnectHandler && typeof this.device.removeEventListener === 'function') {
      this.device.removeEventListener('gattserverdisconnected', this.deviceDisconnectHandler)
    }
    this.deviceDisconnectHandler = null
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.device = null
    this.characteristic = null
    this.useNoResponse = false
    this.teardownGraphic()
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (this.mode === 'graphic') {
      throw new Error('This printer is a graphic-mode printer — use the receipt raster.')
    }
    const ch = this.characteristic
    if (!ch) {
      throw new Error('Printer is not connected.')
    }
    const noResponse = this.useNoResponse && typeof ch.writeValueWithoutResponse === 'function'
    for (let i = 0; i < bytes.length; i += BLE_CHUNK) {
      const chunk = bytes.slice(i, i + BLE_CHUNK)
      if (noResponse) {
        await ch.writeValueWithoutResponse!(chunk)
      } else {
        await ch.writeValue(chunk)
      }
      if (i + BLE_CHUNK < bytes.length) await sleep(BLE_WRITE_DELAY_MS)
    }
  }

  onDisconnect(cb: (deviceId: string) => void): () => void {
    this.disconnectCb = cb
    return () => {
      this.disconnectCb = null
    }
  }
}

/* ------------------------------------------------------------------ */
/* Capacitor native bridge — talks to PrinterPlugin.kt on Android.    */
/* Handles Classic SPP (RfcommSocket) and BLE (BluetoothGatt).        */
/* ------------------------------------------------------------------ */

interface NativePrinterPlugin {
  scan(): Promise<{ devices: PrinterDevice[] }>
  connect(options: { deviceId: string; protocol: PrinterProtocol }): Promise<{ ok: boolean }>
  disconnect(): Promise<{ ok: boolean }>
  print(options: { deviceId: string; protocol: PrinterProtocol; data: string }): Promise<{ ok: boolean }>
  testPrint(): Promise<{ ok: boolean }>
  getStatus(): Promise<{ connected: boolean; deviceId: string | null; protocol: PrinterProtocol | null }>
  addListener(event: string, cb: (data: { deviceId: string }) => void): Promise<{ remove: () => void }>
}

/**
 * Access the Android plugin through Capacitor's API. We must NOT read
 * `window.Capacitor.Plugins.PrinterPlugin` — Capacitor only populates that
 * object after a JS `registerPlugin()` call, so it is always undefined for a
 * plugin registered purely on the native side (as ours is, in MainActivity).
 */
function nativePlugin(): NativePrinterPlugin {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('PrinterPlugin')) {
    throw new Error('The native printer bridge is not available. Open this in the Android app.')
  }
  return registerPlugin<NativePrinterPlugin>('PrinterPlugin')
}

export class CapacitorPrinterTransport implements PrinterTransport {
  readonly kind = 'capacitor' as const
  readonly mode = 'escpos' as const
  private current: PrinterDevice | null = null
  private disconnectCb: ((deviceId: string) => void) | null = null
  private removeListener: (() => void) | null = null

  constructor() {
    // The native plugin pushes printerDisconnect events through Capacitor's event bus.
    try {
      void nativePlugin()
        .addListener('printerDisconnect', ({ deviceId }) => this.disconnectCb?.(deviceId))
        .then((handle) => {
          this.removeListener = handle.remove
        })
        .catch(() => {
          // Bridge not ready yet — events will reconnect on next scan.
        })
    } catch {
      // Not on a native platform — nothing to listen to.
    }
  }

  async scan(): Promise<PrinterDevice[]> {
    const res = await nativePlugin().scan()
    return res.devices
  }

  async connect(device: PrinterDevice): Promise<void> {
    await nativePlugin().connect({ deviceId: device.id, protocol: device.protocol })
    this.current = device
  }

  async disconnect(): Promise<void> {
    await nativePlugin().disconnect()
    this.current = null
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.current) throw new Error('Printer is not connected.')
    // Base64 keeps the bridge simple; the plugin decodes to raw bytes.
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    await nativePlugin().print({
      deviceId: this.current.id,
      protocol: this.current.protocol,
      data: btoa(bin),
    })
  }

  onDisconnect(cb: (deviceId: string) => void): () => void {
    this.disconnectCb = cb
    return () => {
      this.disconnectCb = null
      this.removeListener?.()
      this.removeListener = null
    }
  }
}

export function createTransport(platformKind: 'native' | 'web'): PrinterTransport {
  return platformKind === 'native' ? new CapacitorPrinterTransport() : new WebBleTransport()
}
