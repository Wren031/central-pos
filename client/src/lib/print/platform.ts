/**
 * Platform & capability detection for Bluetooth printing.
 *
 * Reality check (why this exists):
 * - Browsers expose NO API for Classic Bluetooth SPP/RFCOMM. It is impossible
 *   from web code on any platform. SPP printers require a native bridge.
 * - Web Bluetooth (`navigator.bluetooth`) exists in Chrome/Edge on Windows 10+,
 *   Android, Linux and macOS — but only for BLE GATT devices, never SPP.
 * - iOS Safari does not implement Web Bluetooth at all.
 *
 * So the service picks, in order:
 *   1. Capacitor native bridge (Android app) — supports BOTH SPP and BLE.
 *   2. Web Bluetooth (browser, Chrome/Edge desktop or Android) — BLE only.
 *   3. Unsupported — surfaced honestly in the UI, never faked.
 */

import { Capacitor } from '@capacitor/core'
import type { PrinterProtocol } from '@/lib/types'

export type { PrinterProtocol }

export type PrintPlatform =
  | { kind: 'native'; driver: 'capacitor'; protocols: PrinterProtocol[] }
  | { kind: 'web'; driver: 'web-bluetooth'; protocols: PrinterProtocol[] }
  | { kind: 'none'; driver: null; protocols: [] }

export interface PlatformInfo {
  platform: PrintPlatform
  /** Human-readable explanation shown in the UI. */
  notice: string
  canScan: boolean
  canPrint: boolean
}

/**
 * Native bridge is reachable only on a native platform AND when the native
 * layer reports PrinterPlugin among its registered plugins. We must go through
 * Capacitor's API — `window.Capacitor.Plugins.PrinterPlugin` is only populated
 * after a JS `registerPlugin()` call, so it is NOT a reliable check.
 */
function hasCapacitorBridge(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PrinterPlugin')
  } catch {
    return false
  }
}

function hasWebBluetooth(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as unknown as { bluetooth?: { requestDevice?: unknown } }
  return typeof nav.bluetooth?.requestDevice === 'function'
}

export function detectPrintPlatform(): PlatformInfo {
  if (hasCapacitorBridge()) {
    return {
      platform: { kind: 'native', driver: 'capacitor', protocols: ['ble', 'spp'] },
      notice: 'Android app — full support for Classic Bluetooth (SPP) and BLE thermal printers.',
      canScan: true,
      canPrint: true,
    }
  }

  if (hasWebBluetooth()) {
    return {
      platform: { kind: 'web', driver: 'web-bluetooth', protocols: ['ble'] },
      notice:
        'Web Bluetooth is available in this browser — BLE (Bluetooth LE) printers only. ' +
        'Classic Bluetooth (SPP) printers are not accessible from browsers; use the Android app for those.',
      canScan: true,
      canPrint: true,
    }
  }

  return {
    platform: { kind: 'none', driver: null, protocols: [] },
    notice:
      'Bluetooth printing is not available in this browser or platform. ' +
      'Use Chrome on Windows 10+, Android, macOS or Linux for BLE printers, ' +
      'or the Android app for any ESC/POS thermal printer.',
    canScan: false,
    canPrint: false,
  }
}
