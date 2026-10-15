/*
 * Account-deletion test — verifies the client can no longer "resurrect" a
 * deleted account via the Supabase heal fallback.
 *
 * The POS client authenticates locally (IndexedDB), so we seed accounts directly
 * and stub the Supabase endpoints the delete flow touches:
 *   - POST /auth/v1/token   (re-auth ownership proof)
 *   - POST /rest/v1/rpc/delete_my_account
 *   - POST /auth/v1/logout
 *   - POST /auth/v1/signup  (for the re-registration case)
 * No production data is touched.
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/delete-account-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'delete-test@example.com'
const PASSWORD = 'Password1'
// Legacy demo hash the app still accepts (see auth-hash.ts legacyEncode).
const LEGACY_HASH = Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64')
const WORKSPACE_SELECTOR = 'nav[aria-label="Main"]'

const results = []
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

function tokenResponse(email) {
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Delete Tester' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }
}

function accountRecords(withSession) {
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 30 * 86400000).toISOString()
  const userId = 'usr_delete_test'
  const storeId = 'str_delete_test'
  return {
    user: {
      id: userId,
      fullName: 'Delete Tester',
      address: '1 Test Street, Quezon City',
      contactNumber: '09171234567',
      businessName: 'Delete Test Store',
      email: EMAIL,
      passwordHash: LEGACY_HASH,
      notificationPrefs: { expiration: true, reminders: true, marketing: false },
      createdAt: now,
      accountStatus: 'active',
      accountStatusCheckedAt: now,
    },
    withSession,
    session: { id: 'current', userId, loggedInAt: now },
    store: {
      id: storeId,
      userId,
      name: 'Delete Test Store',
      posType: 'bbq',
      createdAt: now,
      onboarded: true,
    },
    sub: {
      id: 'sub_delete_test',
      userId,
      plan: 'trial',
      startedAt: now,
      expiresAt: future,
      pricePaid: 0,
      active: true,
    },
    category: { id: 'cat_delete_test', storeId, name: 'BBQ', createdAt: now },
    product: {
      id: 'prd_delete_test',
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

async function seed(page, withSession) {
  const data = accountRecords(withSession)
  await page.evaluate(async (payload) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('central-pos')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const stores = ['users', 'sessions', 'stores', 'subscriptions', 'categories', 'products']
    const tx = db.transaction(stores, 'readwrite')
    const put = (name, rows) => {
      const s = tx.objectStore(name)
      for (const row of rows) s.put(row)
    }
    put('users', [payload.user])
    if (payload.withSession) put('sessions', [payload.session])
    put('stores', [payload.store])
    put('subscriptions', [payload.sub])
    put('categories', [payload.category])
    put('products', [payload.product])
    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
      tx.onabort = () => rej(tx.error)
    })
    db.close()
  }, data)
}

async function makeContext(browser, { deleteMode = 'ok' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const fulfillJson = (route, status, body) =>
    route.fulfill({ status, headers: CORS, body: JSON.stringify(body) })

  await context.route('**/rest/v1/rpc/client_account_status', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : fulfillJson(route, 200, { found: true, status: 'active' })
  )
  await context.route('**/auth/v1/token**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : fulfillJson(route, 200, tokenResponse(EMAIL))
  )
  await context.route('**/auth/v1/logout**', (route) =>
    route.fulfill({ status: 204, headers: CORS })
  )
  await context.route('**/auth/v1/signup**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = JSON.parse(route.request().postData() ?? '{}')
    const email = body.email ?? EMAIL
    return fulfillJson(route, 200, {
      user: {
        id: '22222222-2222-2222-2222-222222222222',
        aud: 'authenticated',
        role: 'authenticated',
        email,
        email_confirmed_at: null,
        identities: [{}],
        app_metadata: {},
        user_metadata: body.data ?? {},
        created_at: new Date().toISOString(),
      },
      session: null,
    })
  })
  await context.route('**/rest/v1/rpc/delete_my_account', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (deleteMode === 'fail') return fulfillJson(route, 500, { message: 'simulated delete failure' })
    return route.fulfill({ status: 200, headers: CORS, body: '' })
  })

  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  return { context, page }
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
async function workspaceVisible(page) {
  return page.locator(WORKSPACE_SELECTOR).first().isVisible().catch(() => false)
}

/** Open the delete dialog and attempt deletion. */
async function attemptDelete(page, { password = PASSWORD, storeName = 'Delete Test Store' } = {}) {
  await page.click('button:has-text("Delete account")')
  await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 })
  await page.fill('input[aria-label="Confirm store name"]', storeName)
  await page.fill('input[aria-label="Password"]', password)
  await page.click('button:has-text("Permanently delete")')
}

const browser = await chromium.launch()

/* --------------------------------------------------------------- *
 * T1 — wrong password → refused, account intact
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, true)
    await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Delete account', { timeout: 20000 })

    await attemptDelete(page, { password: 'WrongPassword1' })
    await page.waitForSelector('text=Incorrect password.', { timeout: 10000 })
    assert(true, 'T1 wrong password: deletion refused')

    await page.keyboard.press('Escape')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(await workspaceVisible(page), 'T1 wrong password: account still usable')
    assert(pageErrors.length === 0, 'T1 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 wrong password refused', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T2 — offline → deletion blocked, account intact
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, true)
    await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Delete account', { timeout: 20000 })

    await context.setOffline(true)
    await attemptDelete(page)
    await page.waitForSelector('text=Connect to the internet to delete your account', {
      timeout: 10000,
    })
    assert(true, 'T2 offline: deletion blocked with reconnect message')

    await page.keyboard.press('Escape')
    await context.setOffline(false)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(await workspaceVisible(page), 'T2 offline: account still usable')
    assert(pageErrors.length === 0, 'T2 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 offline deletion blocked', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T3 — successful delete → session cleared, NO resurrection on re-login
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, true)
    await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Delete account', { timeout: 20000 })

    await attemptDelete(page)
    await page.waitForSelector('text=Sign in to continue to your POS workspace', { timeout: 20000 })
    assert(true, 'T3 delete: signed out to login page')
    assert(!(await workspaceVisible(page)), 'T3 delete: workspace no longer reachable')

    const tombstoned = await page.evaluate(
      () => localStorage.getItem('cpos:deleted-accounts') ?? ''
    )
    assert(tombstoned.includes(EMAIL), 'T3 delete: account tombstoned locally')

    // The critical regression: logging in with the SAME credentials must fail —
    // the heal fallback must not recreate the deleted account.
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector('text=Sign in failed', { timeout: 20000 })
    assert(true, 'T3 re-login after delete: blocked (no resurrection)')
    assert(!(await workspaceVisible(page)), 'T3 re-login after delete: workspace not reachable')
    assert(pageErrors.length === 0, 'T3 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T3 delete is permanent', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T4 — a failed server delete must NOT wipe local data (no half-delete)
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser, { deleteMode: 'fail' })
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await waitForLogin(page)
    await seed(page, true)
    await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Delete account', { timeout: 20000 })

    await attemptDelete(page)
    await page.waitForSelector('text=simulated delete failure', { timeout: 10000 })
    assert(true, 'T4 server failure: surfaced to the user')

    await page.keyboard.press('Escape')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 20000 })
    assert(await workspaceVisible(page), 'T4 server failure: account NOT half-deleted')
    assert(pageErrors.length === 0, 'T4 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T4 failed server delete keeps account', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T5 — explicit re-registration lifts the tombstone (no permanent lockout)
 * --------------------------------------------------------------- */
{
  const NEW_EMAIL = `re-signup-${Date.now()}@example.com`
  const { context, page } = await makeContext(browser)
  try {
    await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[name="fullName"]', { timeout: 20000 })
    await page.evaluate((email) => {
      localStorage.setItem('cpos:deleted-accounts', JSON.stringify([email]))
    }, NEW_EMAIL)

    await page.fill('input[name="fullName"]', 'Re Signup')
    await page.fill('textarea', '22 New Street, Quezon City, Metro Manila')
    await page.fill('input[placeholder="09171234567"]', '09171234567')
    await page.fill("input[placeholder=\"Clara's Carinderia\"]", 'Re Signup Store')
    await page.fill('input[type="email"]', NEW_EMAIL)
    await page.fill('input[autocomplete="new-password"] >> nth=0', 'Password1')
    await page.fill('input[autocomplete="new-password"] >> nth=1', 'Password1')
    await page.click('button:has-text("Send confirmation link")')
    await page.waitForSelector('text=Confirm your email', { timeout: 20000 })
    assert(true, 'T5 re-registration: reaches email-confirmation step')

    const remaining = await page.evaluate(() => localStorage.getItem('cpos:deleted-accounts') ?? '')
    assert(!remaining.includes(NEW_EMAIL), 'T5 re-registration: tombstone cleared')
    assert(pageErrors.length === 0, 'T5 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T5 re-registration lifts tombstone', String(err))
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
