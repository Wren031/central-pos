/*
 * Account-status / login-security test.
 *
 * Verifies the Supabase-backed account-status enforcement end to end WITHOUT
 * touching any real Supabase data:
 *   - the client authenticates locally (IndexedDB), so we seed accounts directly
 *     into the same IndexedDB the app uses, and
 *   - only the `client_account_status` RPC is stubbed via network interception.
 *
 * Scenarios: active / suspended / inactive-unverified accounts, offline login,
 * offline POS access, page refresh, session restoration, direct-URL bypass and
 * "suspended while offline → blocked on reconnect".
 *
 * Run against a production preview build:
 *   npm run build && npm run preview   # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/account-status-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'status-test@example.com'
const PASSWORD = 'Password1'
// Legacy demo hash the app still accepts once (see auth-hash.ts legacyEncode).
const LEGACY_HASH = Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64')
const SUSPENDED_MESSAGE =
  'Your account has been suspended. Please contact the administrator for assistance.'
// Rendered only by AppShell — the login/landing marketing copy also contains the
// words "POS workspace", so that text is not a safe indicator of the workspace.
const WORKSPACE_SELECTOR = 'nav[aria-label="Main"]'

const results = []
// Uncaught page errors only — background Supabase calls may legitimately log
// console errors (network/RLS) and must not fail the suite. They are surfaced
// informationally at the end.
const pageErrors = []
const consoleErrors = []

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

/** Build the local account records the app reads from IndexedDB. */
function accountRecords({ accountStatus, withSession }) {
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 30 * 86400000).toISOString()
  const userId = 'usr_status_test'
  const storeId = 'str_status_test'
  const user = {
    id: userId,
    fullName: 'Status Tester',
    address: '1 Test Street, Quezon City',
    contactNumber: '09171234567',
    businessName: 'Status Test Store',
    email: EMAIL,
    passwordHash: LEGACY_HASH,
    notificationPrefs: { expiration: true, reminders: true, marketing: false },
    createdAt: now,
  }
  if (accountStatus) {
    user.accountStatus = accountStatus
    user.accountStatusCheckedAt = now
  }
  return {
    user,
    withSession,
    session: { id: 'current', userId, loggedInAt: now },
    store: {
      id: storeId,
      userId,
      name: 'Status Test Store',
      posType: 'bbq',
      createdAt: now,
      onboarded: true,
    },
    sub: {
      id: 'sub_status_test',
      userId,
      plan: 'trial',
      startedAt: now,
      expiresAt: future,
      pricePaid: 0,
      active: true,
    },
    category: { id: 'cat_status_test', storeId, name: 'BBQ', createdAt: now },
    product: {
      id: 'prd_status_test',
      storeId,
      name: 'Test BBQ Stick',
      sku: 'BBQ-001',
      category: 'BBQ',
      price: 25,
      stock: 100,
      unit: 'pc',
      emoji: '🍢',
      active: true,
      createdAt: now,
    },
  }
}

/** Create/seed the app's IndexedDB with one account. */
async function seed(page, opts) {
  const payload = accountRecords(opts)
  await page.evaluate(async (data) => {
    const openDb = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('central-pos')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    const db = await openDb()
    const stores = [
      'users',
      'sessions',
      'stores',
      'subscriptions',
      'notifications',
      'categories',
      'products',
    ]
    const tx = db.transaction(stores, 'readwrite')
    const put = (name, rows) => {
      const s = tx.objectStore(name)
      for (const row of rows) s.put(row)
    }
    put('users', [data.user])
    if (data.withSession) put('sessions', [data.session])
    put('stores', [data.store])
    put('subscriptions', [data.sub])
    put('categories', [data.category])
    put('products', [data.product])
    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
      tx.onabort = () => rej(tx.error)
    })
    db.close()
  }, payload)
}

async function waitForLogin(page) {
  await page.waitForSelector('input[type="email"]', { timeout: 20000 })
}

async function isVisible(page, text) {
  return page
    .locator(`text=${text}`)
    .first()
    .isVisible()
    .catch(() => false)
}

/** True when the POS workspace (not login, not suspended) is on screen. */
async function workspaceVisible(page) {
  return page
    .locator(WORKSPACE_SELECTOR)
    .first()
    .isVisible()
    .catch(() => false)
}

function makeContext(browser, getStatus) {
  return browser.newContext({ viewport: { width: 1280, height: 800 } }).then(async (context) => {
    await context.route('**/rest/v1/rpc/client_account_status', async (route) => {
      const method = route.request().method()
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const mode = getStatus()
      if (mode === 'error') {
        return route.fulfill({
          status: 500,
          headers: CORS,
          body: JSON.stringify({ message: 'simulated backend failure' }),
        })
      }
      const body =
        mode === 'active'
          ? { found: true, status: 'active' }
          : mode === 'suspended'
            ? { found: true, status: 'suspended' }
            : { found: false, status: null } // not_found / unverified
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(body) })
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    return { context, page }
  })
}

const browser = await chromium.launch()

/* ------------------------------------------------------------------ *
 * T1 — login while ONLINE, account active → access granted
 * ------------------------------------------------------------------ */
{
  let status = 'active'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: false })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(await workspaceVisible(page), 'T1 active account: online login grants access')
    assert(!(await isVisible(page, 'Unverified')), 'T1 active account: not flagged unverified')
    assert(pageErrors.length === 0, 'T1 no runtime errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 active account: online login grants access', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T2 — login while ONLINE, account suspended → blocked + message
 * ------------------------------------------------------------------ */
{
  let status = 'suspended'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: false })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T2 suspended account: login blocked with exact message')
    assert(await isVisible(page, 'Account suspended'), 'T2 suspended account: suspension alert shown')
    assert(!(await workspaceVisible(page)), 'T2 suspended account: workspace not reachable')

    // The failed login must not have left a usable session behind.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    assert(!(await workspaceVisible(page)), 'T2 suspended account: no session persists after reload')
    assert(pageErrors.length === 0, 'T2 no runtime errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 suspended account: login blocked with exact message', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T3 — cached suspension + OFFLINE → blocked on refresh + direct URL
 * ------------------------------------------------------------------ */
{
  let status = 'suspended'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true, accountStatus: 'suspended' })

    // Direct navigation to a protected route while online (server agrees: suspended).
    await page.goto(BASE + '/pos', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T3 cached suspension: direct /pos navigation blocked')

    // Go offline — a suspended account must NOT regain access by disconnecting.
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready
    })
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T3 cached suspension: still blocked while offline after refresh')
    assert(!(await workspaceVisible(page)), 'T3 cached suspension: workspace never shown')
    assert(pageErrors.length === 0, 'T3 no runtime errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T3 cached suspension: blocked offline after refresh', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T4 — suspended while OFFLINE → blocked as soon as we RECONNECT
 * ------------------------------------------------------------------ */
{
  let status = 'active'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true, accountStatus: 'active' })
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(true, 'T4 verified active account: workspace available')

    // Disconnect: access stays (offline-first, cached active).
    await context.setOffline(true)
    await page.waitForTimeout(300)
    assert(await workspaceVisible(page), 'T4 offline: verified active account keeps offline access')

    // Admin suspends the account while the device is offline.
    status = 'suspended'

    // Reconnect → the status check must retrieve the new state and block.
    await context.setOffline(false)
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T4 reconnect: newly-suspended account is blocked on reconnection')
    assert(!(await workspaceVisible(page)), 'T4 reconnect: workspace revoked after suspension')

    // The block must survive a reload (the session was invalidated and the block
    // is remembered), so it cannot be escaped by refreshing.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T4 reconnect: block persists across a reload')
    assert(!(await workspaceVisible(page)), 'T4 reconnect: workspace still revoked after reload')
    assert(pageErrors.length === 0, 'T4 no runtime errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T4 suspend-offline-then-reconnect blocks access', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T5 — previously-verified active account: offline POS still works
 * ------------------------------------------------------------------ */
{
  const { context, page } = await makeContext(browser, () => 'active')
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true, accountStatus: 'active' })

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready
    })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })

    await context.setOffline(true)
    await page.goto(BASE + '/pos/catalog', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Test BBQ Stick', { timeout: 20000 })
    assert(true, 'T5 verified active account: offline reload serves POS catalog')
    assert(!(await isVisible(page, SUSPENDED_MESSAGE)), 'T5 offline: not incorrectly blocked')
    assert(pageErrors.length === 0, 'T5 no runtime errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T5 offline POS access preserved', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T6 — backend error during verification: no spinner, no logout, allowed
 * ------------------------------------------------------------------ */
{
  let status = 'error'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true, accountStatus: 'active' })
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(true, 'T6 on status-check failure: no infinite loading, workspace shown')
    assert(!(await isVisible(page, 'Preparing your workspace')), 'T6 not stuck on loading screen')
    // Cached active is preserved, so no unverified flag and no logout loop.
    await page.waitForTimeout(1500)
    assert(await workspaceVisible(page), 'T6 on status-check failure: session preserved (no logout loop)')
    assert(pageErrors.length === 0, 'T6 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T6 backend failure handled gracefully', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T7 — never-verified account, OFFLINE → allowed + flagged Unverified
 * ------------------------------------------------------------------ */
{
  const { context, page } = await makeContext(browser, () => 'active')
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true }) // no accountStatus → never verified
    // Wait for the service worker so the offline navigation is served from cache.
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready
    })
    await context.setOffline(true)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(true, 'T7 unverified offline account: access allowed')
    assert(await isVisible(page, 'Unverified'), 'T7 unverified offline account: flagged "Unverified"')
    assert(!(await isVisible(page, SUSPENDED_MESSAGE)), 'T7 unverified account: not treated as suspended')
    assert(pageErrors.length === 0, 'T7 no runtime errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T7 unverified offline account handled', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T8 — missing account record (not_found) → unverified, allowed, no crash
 * ------------------------------------------------------------------ */
{
  let status = 'not_found'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true }) // no cached status
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(true, 'T8 missing server record: app remains usable (no crash)')
    assert(await isVisible(page, 'Unverified'), 'T8 missing server record: flagged "Unverified"')
    assert(pageErrors.length === 0, 'T8 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T8 missing account record handled safely', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T9 — suspension HARD SIGNS OUT: session invalidated, re-login blocked
 * ------------------------------------------------------------------ */
{
  const status = 'suspended'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, { withSession: true, accountStatus: 'active' })
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    // Boot verifies the (already-suspended) account and forces a sign-out.
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T9 suspension detected on session restore: blocked')

    // Acknowledge the block → back to sign-in.
    await page.click('button:has-text("Back to sign in")')
    await waitForLogin(page)
    assert(true, 'T9 acknowledge: returns to sign-in')

    // The local session was invalidated, so a protected URL no longer resolves
    // to the workspace — it redirects to sign-in.
    await page.goto(BASE + '/pos', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    assert(!(await workspaceVisible(page)), 'T9 session invalidated: /pos redirects to sign-in')

    // Re-login while still suspended is blocked with the exact message.
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector(`text=${SUSPENDED_MESSAGE}`, { timeout: 20000 })
    assert(true, 'T9 re-login while suspended: blocked with message')
    assert(!(await workspaceVisible(page)), 'T9 re-login while suspended: workspace not reachable')
    assert(pageErrors.length === 0, 'T9 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T9 hard sign-out invalidates session', String(err))
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ *
 * T10 — reactivation clears a persisted block (self-healing)
 * ------------------------------------------------------------------ */
{
  const status = 'active'
  const { context, page } = await makeContext(browser, () => status)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    // Simulate a device that was blocked earlier (persistent marker), now the
    // admin has reactivated the account.
    await page.evaluate(() =>
      localStorage.setItem('cpos:account-suspended', 'status-test@example.com')
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    assert(true, 'T10 reactivated account: persisted block self-heals to sign-in')
    assert(!(await isVisible(page, SUSPENDED_MESSAGE)), 'T10 reactivated account: block cleared')
    assert(pageErrors.length === 0, 'T10 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T10 reactivation self-heals', String(err))
  } finally {
    await context.close()
  }
}

console.log('\n--- Uncaught page errors ---')
if (pageErrors.length === 0) console.log('(none)')
else pageErrors.slice(0, 10).forEach((e) => console.log(e))

console.log('\n--- Console errors (informational) ---')
if (consoleErrors.length === 0) console.log('(none)')
else consoleErrors.slice(0, 5).forEach((e) => console.log(e))

const passed = results.filter((r) => r.startsWith('PASS')).length
const total = results.length
console.log(`\n${passed}/${total} checks passed`)
await browser.close()
process.exit(passed === total && pageErrors.length === 0 ? 0 : 1)
