/*
 * Product image test (Inventory + Catalog).
 *
 * Guards the regression where adding a product image was wiped as soon as any
 * background cache emit (`cpos:data-changed`) re-rendered the parent — because
 * the dialog's reset effect depended on a freshly-created `categories` array.
 *
 * Stubs Supabase REST endpoints and seeds IndexedDB directly.
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/product-image-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'product-img@example.com'
const PASSWORD = 'Password1'
const LEGACY_HASH = Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64')

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
}
// 2x2 valid PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
)

const results = []
const pageErrors = []
function ok(n) { results.push(`PASS ${n}`); console.log(`PASS ${n}`) }
function fail(n, e = '') { results.push(`FAIL ${n} ${e}`); console.log(`FAIL ${n} ${e}`) }
function assert(c, n, e = '') { c ? ok(n) : fail(n, e) }

async function makeContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const json = (r, body) => r.fulfill({ status: 200, headers: CORS, body: JSON.stringify(body) })
  await context.route('**/rest/v1/rpc/client_account_status', (r) =>
    r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : json(r, { found: true, status: 'active' })
  )
  await context.route('**/rest/v1/pos_types**', (r) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill({ status: 204, headers: CORS })
      : json(r, [{ id: 'bbq', name: 'BBQ POS', tagline: 't', description: 'd', icon: 'flame', category: 'food', active: true, sort_order: 1 }])
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
  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  return { context, page }
}

async function seed(page, { withProduct }) {
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
      if (data.product) tx.objectStore('products').put(data.product)
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
    },
    {
      user: {
        id: 'usr_pi', fullName: 'Image Tester', address: '1 St', contactNumber: '09171234567',
        businessName: 'Image Store', email: EMAIL, passwordHash: LEGACY_HASH,
        notificationPrefs: { expiration: true, reminders: true, marketing: false }, createdAt: now,
      },
      store: { id: 'str_pi', userId: 'usr_pi', name: 'Image Store', posType: 'bbq', createdAt: now, onboarded: true },
      sub: { id: 'sub_pi', userId: 'usr_pi', plan: 'trial', startedAt: now, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), pricePaid: 0, active: true },
      product: withProduct
        ? { id: 'prd1', storeId: 'str_pi', name: 'Test BBQ Stick', sku: 'BBQ-1', category: 'BBQ', price: 25, stock: 100, unit: 'pc', emoji: '📦', active: true, createdAt: now }
        : null,
    }
  )
}

async function boot(page, withProduct) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 20000 })
  await seed(page, { withProduct })
}

async function readProducts(page) {
  return page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('central-pos')
        r.onsuccess = () => {
          const db = r.result
          const tx = db.transaction(['products'], 'readonly')
          const all = tx.objectStore('products').getAll()
          all.onsuccess = () => {
            res(all.result.map((p) => ({ name: p.name, hasImage: Boolean(p.image), prefix: (p.image ?? '').slice(0, 20) })))
            db.close()
          }
        }
        r.onerror = () => res(null)
      })
  )
}

const browser = await chromium.launch()

/* --------------------------------------------------------------- *
 * T1 — Inventory: image survives a background re-render, then saves
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await boot(page, false)
    await page.goto(BASE + '/pos/inventory', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button:has-text("Add")', { timeout: 20000 })
    await page.click('button:has-text("Add")')
    await page.waitForSelector('text=Add product', { timeout: 10000 })

    await page.locator('input[type="file"]').first().setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG })
    await page.waitForTimeout(800)
    const before = await page.locator('img').first().getAttribute('src')
    assert((before ?? '').startsWith('data:image/jpeg'), 'T1 image attaches on add-product')

    // A background emit re-renders the parent — the image (and typed fields)
    // must NOT be wiped.
    await page.fill('input[placeholder="Chicken Inasal"]', 'Pork BBQ Stick')
    await page.evaluate(() => window.dispatchEvent(new Event('cpos:data-changed')))
    await page.waitForTimeout(400)
    const after = await page.locator('img').first().getAttribute('src')
    const nameVal = await page.locator('input[placeholder="Chicken Inasal"]').inputValue()
    assert((after ?? '').startsWith('data:image/jpeg'), 'T1 image survives a background re-render')
    assert(nameVal === 'Pork BBQ Stick', 'T1 typed fields survive a background re-render')

    await page.fill('input[inputmode="decimal"]', '25')
    await page.fill('input[inputmode="numeric"]', '50')
    await page.click('button:has-text("Add to catalog")')
    await page.waitForTimeout(900)
    const products = await readProducts(page)
    assert(products?.[0]?.hasImage === true, 'T1 saved product keeps its image', JSON.stringify(products))
    assert(pageErrors.length === 0, 'T1 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 inventory image', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T2 — Catalog (Sell): no product/image update affordance
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await boot(page, true)
    await page.goto(BASE + '/pos/catalog', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=Test BBQ Stick', { timeout: 20000 })

    const imageButtons = await page
      .locator('button[aria-label^="Add image to"], button[aria-label^="Change image for"]')
      .count()
    assert(imageButtons === 0, 'T2 catalog: no product-image edit control')

    // The card is only "add to cart" — no edit affordance at all.
    const editButtons = await page.locator('button[aria-label^="Edit "], button[aria-label^="Change image"]').count()
    assert(editButtons === 0, 'T2 catalog: no product-update control')
    assert(pageErrors.length === 0, 'T2 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 catalog has no update affordance', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T3 — Bad file: clear error, no infinite "Processing image…"
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await boot(page, false)
    await page.goto(BASE + '/pos/inventory', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button:has-text("Add")', { timeout: 20000 })
    await page.click('button:has-text("Add")')
    await page.waitForSelector('text=Add product', { timeout: 10000 })

    // A file claiming to be a PNG but with garbage content → decode fails.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not really a png'),
    })
    await page.waitForTimeout(1200)
    const body = await page.locator('body').innerText()
    assert(/not supported|could not be processed|could not read/i.test(body), 'T3 unsupported image shows a clear error')
    assert(!body.includes('Processing image…'), 'T3 no permanent "Processing image…" hang')

    // A non-image file is rejected up front.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    await page.waitForTimeout(600)
    const body2 = await page.locator('body').innerText()
    assert(/image file/i.test(body2), 'T3 non-image file is rejected with a clear message')
    assert(pageErrors.length === 0, 'T3 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T3 bad image handling', String(err))
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
