'use strict'

/**
 * Sandboxed preload bridge.
 *
 * Keep this surface tiny: the renderer runs the untrusted POS bundle and must
 * never get direct access to Node, the filesystem, or ipcRenderer. Only inert
 * identifiers are exposed (the app itself does not need them; they are useful
 * for diagnostics and for future desktop-only affordances).
 */
const { contextBridge } = require('electron')

const desktopApi = Object.freeze({
  isElectron: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }),
})

try {
  contextBridge.exposeInMainWorld('desktop', desktopApi)
} catch (err) {
  // Should never happen with contextIsolation enabled, but never crash startup.
  console.error('Failed to expose desktop bridge:', err)
}
