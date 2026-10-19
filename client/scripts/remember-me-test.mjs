/*
 * "Remember me" test.
 *
 * Seeds the app's IndexedDB directly (the client authenticates locally) and
 * stubs the account-status RPC. Verifies:
 *   - checked  → the session is restored after a browser/app restart
 *   - unchecked→ the session survives a page refresh, but is discarded once the
 *     browser session ends (sessionStorage cleared) — no auto login
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/remember-me-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'remember-test@example.com'
const PASSWORD = 'Password1'
const LEGACY_HASH = Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64')
const WORKSPACE_SELECTOR = 'nav[aria-label="Main"]'

const results = []
const pageErrors = []

function ok(name) {
  results.push(`PASS ${name}`)
  console.log(`PASS ${name}`)
}
function fail(name, extra = '') {
  results.push(`FAIL ${name} ${extra}`)
  console.log(`FAIL ${name} ${extra}`)
}
function assert(cond, name, extra = '') {
  if (cond) ok(name)
  else fail(name, extra)
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
}

async function seedAccount(page) {
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 30 * 86400000).toISOString()
  const userId = 'usr_remember_test'
  const storeId = 'str_remember_test'
  await page.evaluate(
    async (data) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('central-pos')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const tx = db.transaction(['users', 'stores', 'subscriptions'], 'readwrite')
      tx.objectStore('users').put(data.user)
      tx.objectStore('stores').put(data.store)
      tx.objectStore('subscriptions').put(data.sub)
      await new Promise((res, rej) => {
        tx.oncomplete = res
        tx.onerror = () => rej(tx.error)
        tx.onabort = () => rej(tx.error)
      })
      db.close()
    },
    {
      user: {
        id: userId,
        fullName: 'Remember Tester',
        address: '1 Test Street, Quezon City',
        contactNumber: '09171234567',
        businessName: 'Remember Test Store',
        email: EMAIL,
        passwordHash: LEGACY_HASH,
        notificationPrefs: { expiration: true, reminders: true, marketing: false },
        createdAt: now,
        accountStatus: 'active',
        accountStatusCheckedAt: now,
      },
      store: {
        id: storeId,
        userId,
        name: 'Remember Test Store',
        posType: 'bbq',
        createdAt: now,
        onboarded: true,
      },
      sub: {
        id: 'sub_remember_test',
        userId,
        plan: 'trial',
        startedAt: now,
        expiresAt: future,
        pricePaid: 0,
        active: true,
      },
    }
  )
}

async function makeContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.route('**/rest/v1/rpc/client_account_status', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          status: 200,
          headers: CORS,
          body: JSON.stringify({ found: true, status: 'active' }),
        })
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  return { context, page }
}

async function login(page, { remember }) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 20000 })
  await seedAccount(page)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[autocomplete="current-password"]', PASSWORD)
  const box = page.locator('#remember-me')
  const isChecked = (await box.getAttribute('aria-checked')) === 'true'
  if (isChecked !== remember) await box.click()
  await page.click('button[type="submit"]')
  await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
}

async function workspaceVisible(page) {
  return page.locator(WORKSPACE_SELECTOR).first().isVisible().catch(() => false)
}
async function hasEphemeralMarker(page) {
  return page.evaluate(() => sessionStorage.getItem('cpos:ephemeral-session') === '1')
}

const browser = await chromium.launch()

/* --------------------------------------------------------------- *
 * T1 — "Remember me" CHECKED → session restored after a restart
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await login(page, { remember: true })
    assert(true, 'T1 checked: signed in')

    // Simulate a browser/app restart: drop sessionStorage, reload.
    await page.evaluate(() => sessionStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(await workspaceVisible(page), 'T1 checked: still signed in after restart')
    assert(
      !(await hasEphemeralMarker(page)),
      'T1 checked: no ephemeral marker written'
    )
    assert(pageErrors.length === 0, 'T1 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 remember-me checked persists', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T2 — "Remember me" UNCHECKED → refresh keeps, restart discards
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await login(page, { remember: false })
    assert(true, 'T2 unchecked: signed in')
    assert(await hasEphemeralMarker(page), 'T2 unchecked: ephemeral marker set')

    // A normal refresh must KEEP the session.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(await workspaceVisible(page), 'T2 unchecked: survives a page refresh')

    // Ending the browser session (sessionStorage cleared) must DISCARD it.
    await page.evaluate(() => sessionStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    assert(!(await workspaceVisible(page)), 'T2 unchecked: signed out after restart')
    assert(true, 'T2 unchecked: login page shown after restart')

    const sessionGone = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('central-pos')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction(['sessions'], 'readonly')
            const get = tx.objectStore('sessions').get('current')
            get.onsuccess = () => {
              resolve(get.result == null)
              db.close()
            }
            get.onerror = () => resolve(false)
          }
          req.onerror = () => resolve(false)
        })
    )
    assert(sessionGone, 'T2 unchecked: local session cleared from storage')
    assert(pageErrors.length === 0, 'T2 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 remember-me unchecked discards on restart', String(err))
  } finally {
    await context.close()
  }
}

console.log('\n--- Uncaught page errors ---')
if (pageErrors.length === 0) console.log('(none)')
else pageErrors.slice(0, 10).forEach((e) => console.log(e))

const passed = results.filter((r) => r.startsWith('PASS')).length
const total = results.length
console.log(`\n${passed}/${total} checks passed`)
await browser.close()
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1)
