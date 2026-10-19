/*
 * Existing-account recovery + backup merge test.
 *
 * Covers the reported bug:
 *   - An account that already exists in Supabase, signed in on a device with an
 *     EMPTY local database, must be recognized as existing ("This account
 *     already exists."), must keep its assigned POS type, and must NOT be sent
 *     through onboarding to re-pick a workspace.
 *   - The /restore screen can recreate the workspace from the cloud config.
 *   - Export/restore merges: it never clears existing rows or duplicates them.
 *
 * Stubs Supabase auth + the new RPCs, seeds IndexedDB directly.
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/existing-account-test.mjs
 */
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'existing@example.com'
const PASSWORD = 'Password1'
const POS_TYPE = 'bbq'

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

function json(r, body) {
  return r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: CORS })
    : r.fulfill({ status: 200, headers: CORS, body: JSON.stringify(body) })
}

async function makeContext(browser, { cloudStore }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })

  // Auth: password grant + logout.
  await context.route('**/auth/v1/token**', (r) =>
    json(r, {
      access_token: 'stub-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'stub-refresh-token',
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        aud: 'authenticated',
        role: 'authenticated',
        email: EMAIL,
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {
          full_name: 'Existing Owner',
          business_name: 'Existing BBQ House',
          contact_number: '09170000000',
          address: '1 Existing St',
        },
      },
    })
  )
  await context.route('**/auth/v1/logout**', (r) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill({ status: 204, headers: CORS })
      : r.fulfill({ status: 204, headers: CORS })
  )
  await context.route('**/auth/v1/user**', (r) => json(r, {}))

  await context.route('**/rest/v1/rpc/client_account_status', (r) =>
    json(r, { found: true, status: 'active' })
  )
  await context.route('**/rest/v1/rpc/client_store_config', (r) =>
    json(r, {
      found: Boolean(cloudStore),
      store: cloudStore,
      subscription: null,
    })
  )
  await context.route('**/rest/v1/rpc/client_save_store_config', (r) =>
    json(r, { ok: true, store: cloudStore })
  )

  await context.route('**/rest/v1/pos_types**', (r) =>
    json(r, [
      { id: POS_TYPE, name: 'BBQ POS', tagline: 't', description: 'd', icon: 'flame', category: 'food', active: true, barcode_enabled: false, sort_order: 1 },
      { id: 'cafe', name: 'Cafe POS', tagline: 'c', description: 'd', icon: 'coffee', category: 'food', active: true, barcode_enabled: false, sort_order: 2 },
    ])
  )
  await context.route('**/rest/v1/pos_type_categories**', (r) => json(r, []))
  await context.route('**/rest/v1/subscription_plans**', (r) => json(r, []))
  await context.route('**/rest/v1/rpc/public_gcash_qr**', (r) => json(r, { url: null, active: false }))

  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  return { context, page }
}

async function seed(page, { withStore, withProduct }) {
  const now = new Date().toISOString()
  await page.evaluate(
    async (data) => {
      const now = new Date().toISOString()
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('central-pos')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const stores = ['users', 'sessions', 'stores', 'subscriptions', 'categories', 'products']
      const tx = db.transaction(stores, 'readwrite')
      tx.objectStore('users').put(data.user)
      tx.objectStore('sessions').put({ id: 'current', userId: data.user.id, loggedInAt: new Date().toISOString() })
      if (data.store) tx.objectStore('stores').put(data.store)
      tx.objectStore('subscriptions').put(data.sub)
      tx.objectStore('categories').put({ id: 'cat1', storeId: data.store?.id ?? 'x', name: 'BBQ', createdAt: now })
      if (data.product) tx.objectStore('products').put(data.product)
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
    },
    {
      user: {
        id: 'usr_existing', fullName: 'Existing Owner', address: '1 Existing St',
        contactNumber: '09170000000', businessName: 'Existing BBQ House', email: EMAIL,
        passwordHash: Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64'),
        notificationPrefs: { expiration: true, reminders: true, marketing: false }, createdAt: now,
      },
      store: withStore
        ? { id: 'str_existing', userId: 'usr_existing', name: 'Existing BBQ House', posType: POS_TYPE, createdAt: now, onboarded: true }
        : null,
      sub: { id: 'sub_existing', userId: 'usr_existing', plan: 'trial', startedAt: now, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), pricePaid: 0, active: true },
      product: withProduct
        ? { id: 'prd_backup', storeId: 'str_existing', name: 'Backup Ribs', sku: 'BBQ-1', category: 'BBQ', price: 250, stock: 10, unit: 'pc', emoji: '🍖', active: true, createdAt: now }
        : null,
    }
  )
}

async function gotoLogin(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 20000 })
}

async function readProducts(page) {
  return page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('central-pos')
        r.onsuccess = () => {
          const db = r.result
          const tx = db.transaction(['products', 'stores'], 'readonly')
          const products = tx.objectStore('products').getAll()
          const stores = tx.objectStore('stores').getAll()
          tx.oncomplete = () => {
            res({ products: products.result.map((p) => p.id), stores: stores.result.map((s) => ({ id: s.id, posType: s.posType, onboarded: s.onboarded })) })
            db.close()
          }
          tx.onerror = () => res(null)
        }
        r.onerror = () => res(null)
      })
  )
}

const browser = await chromium.launch()

/* --------------------------------------------------------------- *
 * T1 — Existing account on a device with NO local data
 * --------------------------------------------------------------- */
{
  const cloudStore = { id: 'remote-store', name: 'Existing BBQ House', pos_type: POS_TYPE, onboarded: true, status: 'active' }
  const { context, page } = await makeContext(browser, { cloudStore })
  try {
    await gotoLogin(page)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button:has-text("Sign in")')

    // Must land on the restore screen — never onboarding.
    try {
      await page.waitForSelector('h1:has-text("This account already exists")', { timeout: 25000 })
    } catch (e) {
      console.log('  [debug] url after login:', page.url())
      console.log('  [debug] body:', (await page.locator('body').innerText()).slice(0, 400).replace(/\n/g, ' | '))
      const dbg = await page.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('central-pos')
          r.onsuccess = () => res(r.result)
          r.onerror = () => res(null)
        })
        if (!db) return null
        const tx = db.transaction(['users', 'sessions', 'stores'], 'readonly')
        const users = tx.objectStore('users').getAll()
        const sessions = tx.objectStore('sessions').getAll()
        const stores = tx.objectStore('stores').getAll()
        await new Promise((res) => { tx.oncomplete = res; tx.onerror = res })
        db.close()
        return {
          users: users.result?.map((u) => u.email),
          sessions: sessions.result,
          stores: stores.result?.map((s) => ({ posType: s.posType, onboarded: s.onboarded })),
          restoreCtx: sessionStorage.getItem('cpos:restore-context'),
        }
      })
      console.log('  [debug] db:', JSON.stringify(dbg))
      throw e
    }
    assert(true, 'T1 existing account is recognized on a new device')
    assert(!page.url().includes('/onboarding'), 'T1 does not route to onboarding')
    assert((await page.locator('text=BBQ POS').count()) > 0, 'T1 assigned POS type is shown')

    // Recover the workspace from the cloud config.
    await page.click('button:has-text("Recover workspace")')
    await page.waitForURL((u) => !u.pathname.startsWith('/restore'), { timeout: 25000 })
    await page.waitForSelector('text=Good', { timeout: 25000 })

    const data = await readProducts(page)
    assert(data?.stores?.length === 1, `T1 exactly one store created (got ${data?.stores?.length})`)
    assert(data?.stores?.[0]?.posType === POS_TYPE, `T1 POS type preserved (got ${data?.stores?.[0]?.posType})`)
    assert(data?.stores?.[0]?.onboarded === true, 'T1 store marked onboarded')
    assert(pageErrors.length === 0, 'T1 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 existing-account recovery', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T2 — Backup export then merge-restore does not clear or duplicate
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser, { cloudStore: null })
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await seed(page, { withStore: true, withProduct: true })

    await page.goto(BASE + '/pos/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Data & sync', { timeout: 25000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('button:has-text("Export backup")'),
    ])
    const path = await download.path()
    const backup = JSON.parse(await readFile(path, 'utf8'))
    assert(backup?.app === 'central-pos' && backup?.version === 2, 'T2 backup has app + version 2')
    assert(Array.isArray(backup?.data?.products) && backup.data.products.length === 1, 'T2 backup contains the product')
    assert(!('passwordHash' in (backup?.data?.users?.[0] ?? {})), 'T2 backup has no users/password data')

    // Add a NEW local product that is not in the backup.
    await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('central-pos')
      r.onsuccess = () => {
        const db = r.result
        const tx = db.transaction(['products'], 'readwrite')
        tx.objectStore('products').put({
          id: 'prd_local', storeId: 'str_existing', name: 'Local Only', sku: 'BBQ-2', category: 'BBQ',
          price: 99, stock: 5, unit: 'pc', emoji: '🍗', active: true, createdAt: new Date().toISOString(),
        })
        tx.oncomplete = () => { db.close(); res(true) }
        tx.onerror = () => res(false)
      }
      r.onerror = () => res(false)
    }))

    // Restore the same backup via the file input.
    await page.setInputFiles('input[aria-label="Choose a backup file"]', {
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })
    await page.waitForSelector('text=Restore this backup?', { timeout: 15000 })
    await page
      .locator('[data-slot="alert-dialog-content"] button:has-text("Restore backup")')
      .click()
    await page.waitForTimeout(1200)

    const after = await readProducts(page)
    assert(after?.products?.includes('prd_local'), 'T2 import did not delete the existing local product')
    assert(after?.products?.includes('prd_backup'), 'T2 import restored the backup product')
    assert(after?.products?.length === 2, `T2 import did not duplicate rows (got ${after?.products?.length})`)
    assert(pageErrors.length === 0, 'T2 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 backup merge', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T3 — Returning user: local identity exists but NO store
 * --------------------------------------------------------------- */
{
  const cloudStore = { id: 'remote-store', name: 'Existing BBQ House', pos_type: POS_TYPE, onboarded: true, status: 'active' }
  const { context, page } = await makeContext(browser, { cloudStore })
  try {
    await gotoLogin(page)
    // Local sign-IN works (identity present) but there is no workspace row.
    await seed(page, { withStore: false, withProduct: false })

    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button:has-text("Sign in")')

    await page.waitForSelector('h1:has-text("This account already exists")', { timeout: 25000 })
    assert(true, 'T3 local identity without a store still reaches the restore screen')
    assert(!page.url().includes('/onboarding'), 'T3 does not force onboarding again')
    assert(pageErrors.length === 0, 'T3 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T3 returning user without workspace', String(err))
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
