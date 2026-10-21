'use strict'

/**
 * UniPOS desktop shell (Electron main process).
 *
 * The renderer is the existing Vite/React POS app, unmodified:
 *   - development: loaded from the Vite dev server (http://localhost:5173)
 *   - production: served from dist/ over a privileged `app://` scheme
 *
 * Why a custom scheme instead of loadFile()?
 *   The app uses BrowserRouter and absolute asset paths. `file://` would break
 *   deep routes/reloads, and Chromium treats it as an opaque origin, which
 *   makes IndexedDB, getUserMedia and Web Bluetooth unreliable. A standard,
 *   secure `app://` origin behaves like a normal https site: BrowserRouter,
 *   Dexie, the camera and Web Bluetooth all keep working with no source edits.
 */

const { app, BrowserWindow, dialog, protocol, session, shell } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const APP_SCHEME = 'app'
const APP_HOST = 'central-pos'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

/** Only `electron . --dev` opts into the dev server; a plain `electron .` runs the built dist. */
const isDev = process.argv.includes('--dev')

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

/** The built renderer lives in the app root (inside app.asar when packaged). */
function distDir() {
  return app.isPackaged ? path.join(app.getAppPath(), 'dist') : path.join(__dirname, '..', 'dist')
}

/** Origin check used by navigation, permissions and external-link guards. */
function isTrustedOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (isDev && url.origin === new URL(DEV_SERVER_URL).origin) return true
    return url.protocol === `${APP_SCHEME}:` && url.hostname === APP_HOST
  } catch {
    return false
  }
}

function openExternal(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      void shell.openExternal(url.toString())
    }
  } catch {
    /* ignore malformed URLs */
  }
}

/** Register the scheme before app-ready so Chromium treats it as standard/secure. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Serve dist/ files for app://central-pos/<path>.
 * Unknown extension-less paths fall back to index.html so BrowserRouter deep
 * links (and reloads) resolve; missing assets return a real 404 instead of
 * being mistaken for an SPA route.
 */
async function handleAppRequest(request) {
  let url
  try {
    url = new URL(request.url)
  } catch {
    return notFound()
  }

  if (url.hostname !== APP_HOST) return notFound()

  const root = path.resolve(distDir())
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html'

  const resolved = path.resolve(root, `.${pathname}`)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return new Response('Forbidden', { status: 403 })
  }

  let filePath = resolved
  let data
  try {
    data = await fsp.readFile(filePath)
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
      // SPA fallback only for routes, never for a missing asset.
      if (path.extname(pathname)) return notFound()
      filePath = path.join(root, 'index.html')
      try {
        data = await fsp.readFile(filePath)
      } catch {
        return notFound()
      }
    } else {
      return new Response('Internal error', { status: 500 })
    }
  }

  const ext = path.extname(filePath).toLowerCase()
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  }
  if (ext === '.html') headers['Content-Security-Policy'] = CSP

  return new Response(data, { status: 200, headers })
}

/** Window used by dialogs and the single-instance focus handler. */
let mainWindow = null

/** Cancel any in-flight Bluetooth selection when its window goes away. */
let bluetoothCallback = null
let bluetoothTimer = null
let bluetoothDevices = new Map()

function resetBluetoothSelection(cancel = false) {
  if (bluetoothTimer) {
    clearTimeout(bluetoothTimer)
    bluetoothTimer = null
  }
  const callback = bluetoothCallback
  bluetoothCallback = null
  bluetoothDevices = new Map()
  if (cancel && callback) {
    try {
      callback('')
    } catch {
      /* request already gone */
    }
  }
}

/**
 * Web Bluetooth in Electron has no built-in chooser: without this event the
 * request is auto-cancelled. Chromium reports devices progressively, so collect
 * them briefly, then let the user pick one in a native dialog.
 */
function attachBluetoothHandlers(win) {
  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()

    for (const device of deviceList) {
      if (device.deviceId) {
        bluetoothDevices.set(device.deviceId, device.deviceName || 'Unnamed Bluetooth device')
      }
    }

    // Keep the original callback for this request; later events only add devices.
    if (bluetoothCallback) return
    bluetoothCallback = callback
    bluetoothTimer = setTimeout(() => {
      void finishBluetoothSelection(win)
    }, 4000)
    if (typeof bluetoothTimer.unref === 'function') bluetoothTimer.unref()
  })
}

async function finishBluetoothSelection(win) {
  if (!bluetoothCallback) return

  if (bluetoothTimer) {
    clearTimeout(bluetoothTimer)
    bluetoothTimer = null
  }

  const callback = bluetoothCallback
  bluetoothCallback = null
  const devices = [...bluetoothDevices.entries()]
  bluetoothDevices = new Map()

  if (devices.length === 0) {
    callback('')
    return
  }

  // One nearby printer is the normal POS case: skip an unnecessary extra click.
  if (devices.length === 1) {
    callback(devices[0][0])
    return
  }

  const target = win && !win.isDestroyed() ? win : null
  const buttons = [...devices.map(([, name], index) => `${index + 1}. ${name}`), 'Cancel']
  const options = {
    type: 'question',
    title: 'Select a Bluetooth printer',
    message: 'Choose the printer to connect to:',
    detail: 'Only Bluetooth LE (BLE) printers are listed.',
    buttons,
    cancelId: devices.length,
    defaultId: 0,
    noLink: true,
  }

  try {
    const result = target
      ? await dialog.showMessageBox(target, options)
      : await dialog.showMessageBox(options)
    const choice = result.response
    callback(choice >= 0 && choice < devices.length ? devices[choice][0] : '')
  } catch {
    callback('')
  }
}

/** Confirm/deny OS pairing prompts. PIN entry is intentionally not attempted. */
function configureBluetoothPairing(ses) {
  try {
    ses.setBluetoothPairingHandler((details, callback) => {
      const win = BrowserWindow.getFocusedWindow() || mainWindow
      if (!win || win.isDestroyed()) {
        callback({ confirmed: false })
        return
      }

      if (details.pairingKind === 'providePin') {
        void dialog
          .showMessageBox(win, {
            type: 'info',
            title: 'Bluetooth pairing',
            message: 'This printer requires a PIN that must be typed.',
            detail:
              'Pair it once in Windows Settings > Bluetooth & devices, then press Scan again in UniPOS.',
            buttons: ['OK'],
            noLink: true,
          })
          .then(() => callback({ confirmed: false }))
        return
      }

      const detail =
        details.pairingKind === 'confirmPin' && details.pin
          ? `Confirm this PIN on the printer: ${details.pin}`
          : 'Confirm the pairing request on the printer, then choose Pair.'

      void dialog
        .showMessageBox(win, {
          type: 'question',
          title: 'Bluetooth pairing',
          message: 'Pair this printer?',
          detail,
          buttons: ['Pair', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        })
        .then(({ response }) => callback({ confirmed: response === 0 }))
    })
  } catch {
    // Older platforms may not expose a pairing handler; Just Works still works.
  }
}

/**
 * Permission policy: the POS needs the camera for barcode scanning and may use
 * fullscreen/clipboard. Everything else (geolocation, notifications, MIDI, …)
 * is denied. Only the trusted app/dev origin is allowed to ask.
 */
function configurePermissions(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = (details && details.requestingUrl) || (webContents && webContents.getURL()) || ''
    if (!isTrustedOrigin(requestingUrl)) {
      callback(false)
      return
    }

    if (permission === 'media') {
      const types = (details && details.mediaTypes) || []
      // Video only: the scanner never needs the microphone.
      callback(types.length === 0 || types.includes('video'))
      return
    }

    if (permission === 'fullscreen' || permission === 'clipboard-sanitized-write') {
      callback(true)
      return
    }

    callback(false)
  })

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    if (!isTrustedOrigin(requestingOrigin)) return false
    if (permission === 'media') {
      const type = details && details.mediaType
      return type !== 'audio'
    }
    return permission === 'fullscreen' || permission === 'clipboard-sanitized-write'
  })

  configureBluetoothPairing(ses)
}

/** Native save dialog for JSON/CSV exports instead of dropping files silently. */
function configureDownloads(ses) {
  ses.on('will-download', (_event, item) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const suggested = item.getFilename() || 'download'
    const defaultPath = path.join(app.getPath('downloads'), suggested)

    let savePath
    try {
      const options = {
        title: 'Save file',
        defaultPath,
        buttonLabel: 'Save',
      }
      savePath = win && !win.isDestroyed()
        ? dialog.showSaveDialogSync(win, options)
        : dialog.showSaveDialogSync(options)
    } catch {
      savePath = undefined
    }

    if (!savePath) {
      item.cancel()
      return
    }
    item.setSavePath(savePath)
  })
}

function attachNavigationGuards(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedOrigin(url)) return
    event.preventDefault()
    openExternal(url)
  })

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0c0a09',
    autoHideMenuBar: true,
    title: 'UniPOS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  const win = mainWindow

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    resetBluetoothSelection(true)
    if (mainWindow === win) mainWindow = null
  })

  attachNavigationGuards(win)
  attachBluetoothHandlers(win)

  win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    // -3 is an aborted load (e.g. a reload), not a real failure.
    if (!isMainFrame || code === -3) return
    dialog.showErrorBox(
      'UniPOS could not open',
      isDev
        ? `The Vite dev server at ${DEV_SERVER_URL} is not responding.\n\nStart it with "npm run dev" and try again.\n\n${description} (${code})`
        : `The packaged application could not be loaded.\n\n${description} (${code})`
    )
  })

  if (isDev) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    const indexFile = path.join(distDir(), 'index.html')
    if (!fs.existsSync(indexFile)) {
      dialog.showErrorBox(
        'UniPOS build missing',
        'The production bundle was not found in dist/.\n\nRun "npm run build:electron" before starting Electron.'
      )
      return
    }
    void win.loadURL(`${APP_ORIGIN}/index.html`)
  }
}

app.setName('UniPOS')
if (process.platform === 'win32') app.setAppUserModelId('com.centralpos.app')

// Camera on Linux/Wayland is more reliable through PipeWire.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(() => {
    configurePermissions(session.defaultSession)
    configureDownloads(session.defaultSession)

    protocol.handle(APP_SCHEME, handleAppRequest)
    createWindow()  

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    resetBluetoothSelection(true)
    if (process.platform !== 'darwin') app.quit()
  })
}
