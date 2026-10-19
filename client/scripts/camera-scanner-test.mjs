/*
 * Camera barcode scanner test.
 *
 * Guards the camera-preview regressions:
 *   * The dialog did not appear / the camera never opened (silent failure).
 *   * The `<video>` never received a live stream (no preview).
 *   * The camera kept running after the dialog closed or the view unmounted.
 *   * An unusable camera context produced a cryptic TypeError.
 *
 * Uses Chromium's FAKE media device, so no real hardware is required:
 *   --use-fake-device-for-media-stream  → a synthetic camera that always works
 *   --use-fake-ui-for-media-stream      → auto-accepts the permission prompt
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/camera-scanner-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'camera-scanner@example.com'
const PASSWORD = 'Password1'
const LEGACY_HASH = Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64')

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
}

const results = []
const pageErrors = []
function ok(n) { results.push(`PASS ${n}`); console.log(`PASS ${n}`) }
function fail(n, e = '') { results.push(`FAIL ${n} ${e}`); console.log(`FAIL ${n} ${e}`) }
function assert(c, n, e = '') { c ? ok(n) : fail(n, e) }

async function makeContext(browser, { stubMediaDevices } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const json = (r, body) => r.fulfill({ status: 200, headers: CORS, body: JSON.stringify(body) })
  await context.route('**/rest/v1/rpc/client_account_status', (r) =>
    r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : json(r, { found: true, status: 'active' })
  )
  // POS type has barcode scanning ENABLED by the admin.
  await context.route('**/rest/v1/pos_types**', (r) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill({ status: 204, headers: CORS })
      : json(r, [{ id: 'bbq', name: 'BBQ POS', tagline: 't', description: 'd', icon: 'flame', category: 'food', active: true, barcode_enabled: true, sort_order: 1 }])
  )
  await context.route('**/rest/v1/pos_type_categories**', (r) =>
    r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : json(r, [])
  )
  await context.route('**/rest/v1/subscription_plans**', (r) =>
    r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : json(r, [])
  )
  await context.route('**/rest/v1/rpc/public_gcash_qr**', (r) =>
    r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : json(r, { url: null, active: false })
  )

  // Record any stream opened so we can assert it is stopped on teardown.
  await context.addInitScript(() => {
    const md = navigator.mediaDevices
    if (!md || typeof md.getUserMedia !== 'function') return
    const original = md.getUserMedia.bind(md)
    md.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      window.__lastStream = stream
      return stream
    }
  })

  if (stubMediaDevices) {
    // Simulate a context with no mediaDevices API at all.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    })
  }

  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  return { context, page }
}

async function seed(page) {
  const now = new Date().toISOString()
  await page.evaluate(
    async (data) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('central-pos')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = db.transaction(['users', 'sessions', 'stores', 'subscriptions', 'categories', 'products'], 'readwrite')
      tx.objectStore('users').put(data.user)
      tx.objectStore('sessions').put({ id: 'current', userId: data.user.id, loggedInAt: new Date().toISOString() })
      tx.objectStore('stores').put(data.store)
      tx.objectStore('subscriptions').put(data.sub)
      tx.objectStore('categories').put({ id: 'cat1', storeId: data.store.id, name: 'BBQ', createdAt: new Date().toISOString() })
      tx.objectStore('products').put(data.product)
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
    },
    {
      user: {
        id: 'usr_cam', fullName: 'Camera Tester', address: '1 St', contactNumber: '09171234567',
        businessName: 'Camera Store', email: EMAIL, passwordHash: LEGACY_HASH,
        notificationPrefs: { expiration: true, reminders: true, marketing: false }, createdAt: now,
      },
      store: { id: 'str_cam', userId: 'usr_cam', name: 'Camera Store', posType: 'bbq', createdAt: now, onboarded: true },
      sub: { id: 'sub_cam', userId: 'usr_cam', plan: 'trial', startedAt: now, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), pricePaid: 0, active: true },
      product: { id: 'prd_cam', storeId: 'str_cam', name: 'Test BBQ Stick', sku: 'BBQ-1', barcode: '4801234567890', category: 'BBQ', price: 25, stock: 100, unit: 'pc', emoji: '📦', active: true, createdAt: now },
    }
  )
}

async function boot(page, path) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 20000 })
  await seed(page)
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
}

/** Live-preview probe for the dialog's <video>. */
async function videoState(page) {
  return page.evaluate(() => {
    const v = document.querySelector('video')
    if (!v) return null
    return {
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      paused: v.paused,
      hasStream: Boolean(v.srcObject),
      autoplay: v.autoplay,
      muted: v.muted,
      playsInline: v.playsInline,
    }
  })
}

async function streamEnded(page) {
  return page.evaluate(() => {
    const s = window.__lastStream
    if (!s) return true
    return s.getTracks().every((t) => t.readyState === 'ended')
  })
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})

/* --------------------------------------------------------------- *
 * T1 — Camera dialog opens with a LIVE preview and stops on close
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  await context.grantPermissions(['camera'], { origin: BASE })
  try {
    await boot(page, '/pos/scanner')
    await page.waitForSelector('text=Barcode scanner', { timeout: 20000 })
    await page.click('button:has-text("Test camera")')
    await page.waitForSelector('video', { timeout: 15000 })

    // Wait for a real, playing frame.
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return !!v && v.videoWidth > 0 && v.readyState >= 2 && !v.paused
      },
      { timeout: 15000 }
    )
    const s = await videoState(page)
    assert(s && s.videoWidth > 0, 'T1 video has a real frame (videoWidth > 0)', JSON.stringify(s))
    assert(s && s.readyState >= 2, 'T1 video readyState >= 2', JSON.stringify(s))
    assert(s && s.paused === false, 'T1 video is playing (not paused)', JSON.stringify(s))
    assert(s && s.hasStream === true, 'T1 video.srcObject is attached', JSON.stringify(s))
    assert(s && s.autoplay === true && s.muted === true && s.playsInline === true, 'T1 video uses autoPlay+muted+playsInline', JSON.stringify(s))

    // Close the dialog → stream must stop and the element unbind.
    await page.click('button:has-text("Done")')
    await page.waitForTimeout(600)
    const gone = (await videoState(page)) === null
    assert(gone, 'T1 video element unmounts on close')
    assert(await streamEnded(page), 'T1 camera stream is stopped after close')
    assert(pageErrors.length === 0, 'T1 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 camera preview opens and stops', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T2 — Stream stops when the view unmounts WHILE the camera is open
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  await context.grantPermissions(['camera'], { origin: BASE })
  try {
    await boot(page, '/pos/scanner')
    await page.waitForSelector('button:has-text("Test camera")', { timeout: 20000 })
    await page.click('button:has-text("Test camera")')
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return !!v && v.videoWidth > 0
      },
      { timeout: 15000 }
    )

    // Navigate away with the dialog still open.
    await page.goto(BASE + '/pos', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    assert(await streamEnded(page), 'T2 camera stream stops when the view unmounts')
    assert(pageErrors.length === 0, 'T2 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 unmount stops the stream', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T3 — Unusable camera context: clear message, no cryptic TypeError
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser, { stubMediaDevices: true })
  try {
    await boot(page, '/pos/scanner')
    await page.waitForSelector('text=Barcode scanner', { timeout: 20000 })
    // The camera is not pre-blocked: the option stays selectable, and the dialog
    // attempts getUserMedia, failing gracefully with a plain message.
    const cameraDisabled = await page.locator('button:has-text("Camera scanner")').isDisabled()
    assert(cameraDisabled === false, 'T3 camera option is not pre-disabled')

    await page.click('button:has-text("Test camera")')
    await page.waitForSelector('video', { timeout: 15000 })
    await page.waitForSelector('text=/Camera access is not available/i', { timeout: 15000 })
    assert(true, 'T3 dialog reports the camera error gracefully')
    assert(pageErrors.length === 0, 'T3 no page errors (no raw TypeError leak)', pageErrors.join(' | '))
  } catch (err) {
    fail('T3 unusable camera handled clearly', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T4 — Sell screen: Scan button appears only when barcode is enabled
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  await context.grantPermissions(['camera'], { origin: BASE })
  try {
    await boot(page, '/pos/catalog')
    await page.waitForSelector('text=Test BBQ Stick', { timeout: 20000 })
    const scanButtons = await page.locator('button[aria-label="Scan a barcode with the camera"]').count()
    assert(scanButtons === 1, 'T4 Sell screen shows the Scan button when barcode is enabled')

    await page.click('button[aria-label="Scan a barcode with the camera"]')
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return !!v && v.videoWidth > 0
      },
      { timeout: 15000 }
    )
    assert(true, 'T4 Scan button opens a live camera dialog')
    assert(pageErrors.length === 0, 'T4 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T4 Sell screen camera scan', String(err))
  } finally {
    await context.close()
  }
}

await browser.close()

const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) {
  console.log('FAILURES:')
  failed.forEach((f) => console.log('  ' + f))
  process.exit(1)
}
