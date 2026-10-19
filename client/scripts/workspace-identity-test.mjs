/*
 * Workspace identity regression tests.
 *
 * Covers the reported failure modes:
 *   T1 — cloud lookup failure must NOT send an existing account to onboarding;
 *        Retry succeeds WITHOUT signing in again.
 *   T2 — repeated login does not create a second workspace.
 *   T3 — restoring a backup when the cloud has no store row uses the POS type
 *        recorded in the backup (no "sign in again after your workspace type
 *        has synced" dead-end).
 *   T4 — registering an email that already exists does not create a local
 *        identity (the old bug left a device password that no longer matched
 *        Supabase, breaking every later workspace lookup).
 *   T5 — legacy duplicate local stores are collapsed on login without losing
 *        the store that owns business data.
 *   T6 — offline login with no local workspace goes to /restore, never
 *        silently onboarding into a new workspace.
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/workspace-identity-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = 'existing@example.com'
const PASSWORD = 'Password1'
const POS_TYPE = 'bbq'
const DB_NAME = 'central-pos'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
}

const results = []
const pageErrors = []
const ok = (n) => {
  results.push(`PASS ${n}`)
  console.log(`PASS ${n}`)
}
const fail = (n, e = '') => {
  results.push(`FAIL ${n} ${e}`)
  console.log(`FAIL ${n} ${e}`)
}
const assert = (c, n, e = '') => (c ? ok(n) : fail(n, e))
const json = (r, body, status = 200) =>
  r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: CORS })
    : r.fulfill({ status, headers: CORS, body: JSON.stringify(body) })

const POS_TYPES = [
  {
    id: POS_TYPE,
    name: 'BBQ POS',
    tagline: 't',
    description: 'd',
    icon: 'flame',
    category: 'food',
    active: true,
    barcode_enabled: false,
    sort_order: 1,
  },
  {
    id: 'cafe',
    name: 'Cafe POS',
    tagline: 'c',
    description: 'd',
    icon: 'coffee',
    category: 'food',
    active: true,
    barcode_enabled: false,
    sort_order: 2,
  },
]

function authUser(email = EMAIL) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    identities: [{}],
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      full_name: 'Existing Owner',
      business_name: 'Existing BBQ House',
      contact_number: '09170000000',
      address: '1 Existing St',
    },
  }
}

async function makeContext(browser, options = {}) {
  const { cloudStore = null, failFirstCloudRead = false, signupExisting = false } = options
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  })

  await context.route('**/auth/v1/token**', (r) =>
    json(r, {
      access_token: 'stub-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'stub-refresh-token',
      user: authUser(),
    })
  )
  await context.route('**/auth/v1/logout**', (r) => r.fulfill({ status: 204, headers: CORS }))
  await context.route('**/auth/v1/user**', (r) => json(r, authUser()))
  await context.route('**/auth/v1/resend**', (r) => json(r, {}))
  await context.route('**/auth/v1/signup**', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
    return json(r, {
      user: {
        ...authUser(),
        id: '33333333-3333-3333-3333-333333333333',
        email_confirmed_at: null,
        // Supabase reports an existing email with an EMPTY identities array.
        identities: signupExisting ? [] : [{}],
      },
      session: null,
    })
  })

  await context.route('**/rest/v1/rpc/client_account_status', (r) =>
    json(r, { found: true, status: 'active' })
  )

  let cloudCalls = 0
  await context.route('**/rest/v1/rpc/client_store_config', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
    cloudCalls += 1
    if (failFirstCloudRead && cloudCalls === 1) {
      return json(r, { message: 'temporary upstream failure' }, 500)
    }
    return json(r, {
      found: Boolean(cloudStore),
      store: cloudStore,
      subscription: null,
    })
  })
  await context.route('**/rest/v1/rpc/client_save_store_config', (r) =>
    json(r, { ok: true, store: cloudStore })
  )
  await context.route('**/rest/v1/pos_types**', (r) => json(r, POS_TYPES))
  await context.route('**/rest/v1/pos_type_categories**', (r) => json(r, []))
  await context.route('**/rest/v1/subscription_plans**', (r) => json(r, []))
  await context.route('**/rest/v1/rpc/public_gcash_qr', (r) =>
    json(r, { url: null, active: false })
  )

  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  return { context, page }
}

async function seed(page, data) {
  await page.evaluate(
    async ({ dbName, user, store, stores, sub, product, session }) => {
      const now = new Date().toISOString()
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open(dbName)
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      const names = ['users', 'sessions', 'stores', 'subscriptions', 'categories', 'products']
      const tx = db.transaction(names, 'readwrite')
      if (user) tx.objectStore('users').put(user)
      if (session) tx.objectStore('sessions').put(session)
      if (store) tx.objectStore('stores').put(store)
      for (const s of stores ?? []) tx.objectStore('stores').put(s)
      if (sub) tx.objectStore('subscriptions').put(sub)
      if (store) {
        tx.objectStore('categories').put({
          id: 'cat1',
          storeId: store.id,
          name: 'BBQ',
          createdAt: now,
        })
      }
      if (product) tx.objectStore('products').put(product)
      await new Promise((res, rej) => {
        tx.oncomplete = res
        tx.onerror = () => rej(tx.error)
        tx.onabort = () => rej(tx.error)
      })
      db.close()
    },
    {
      dbName: DB_NAME,
      session: data.session ?? null,
      user: data.user ?? null,
      store: data.store ?? null,
      stores: data.stores ?? [],
      sub: data.sub ?? null,
      product: data.product ?? null,
    }
  )
}

function localAccount(overrides = {}) {
  const now = new Date().toISOString()
  return {
    id: 'usr_existing',
    fullName: 'Existing Owner',
    address: '1 Existing St',
    contactNumber: '09170000000',
    businessName: 'Existing BBQ House',
    email: EMAIL,
    passwordHash: Buffer.from(`cpos:${PASSWORD}`, 'utf8').toString('base64'),
    notificationPrefs: { expiration: true, reminders: true, marketing: false },
    createdAt: now,
    ...overrides,
  }
}

async function readDb(page) {
  return page.evaluate(
    ({ dbName }) =>
      new Promise((resolve) => {
        const req = indexedDB.open(dbName)
        req.onsuccess = () => {
          const db = req.result
          const names = ['users', 'stores', 'products', 'pendingRegistrations']
          const missing = names.filter((n) => !db.objectStoreNames.contains(n))
          const tx = db.transaction(names.filter((n) => !missing.includes(n)), 'readonly')
          const out = {}
          for (const n of names) {
            if (missing.includes(n)) {
              out[n] = []
              continue
            }
            const rq = tx.objectStore(n).getAll()
            rq.onsuccess = () => {
              out[n] = rq.result
            }
          }
          tx.oncomplete = () => {
            db.close()
            resolve(out)
          }
          tx.onerror = () => resolve(null)
        }
        req.onerror = () => resolve(null)
      }),
    { dbName: DB_NAME }
  )
}

async function login(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 20000 })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[autocomplete="current-password"]', PASSWORD)
  await page.click('button:has-text("Sign in")')
}

const browser = await chromium.launch()

/* --------------------------------------------------------------- *
 * T1 — cloud lookup fails once; retry succeeds without re-login
 * --------------------------------------------------------------- */
{
  const cloudStore = {
    id: 'remote-store',
    name: 'Existing BBQ House',
    pos_type: POS_TYPE,
    onboarded: true,
    status: 'active',
  }
  const { context, page } = await makeContext(browser, {
    cloudStore,
    failFirstCloudRead: true,
  })
  try {
    await login(page)
    await page.waitForSelector('h1:has-text("This account already exists")', { timeout: 25000 })
    assert(true, 'T1 sync failure reaches the restore screen (not onboarding)')
    assert(!page.url().includes('/onboarding'), 'T1 does not fall through to onboarding')
    assert(
      (await page.locator('text=We couldn\u2019t verify your saved workspace yet').count()) +
        (await page.locator('text=We couldn\'t verify your saved workspace yet').count()) >
        0,
      'T1 shows a meaningful verification error'
    )
    assert(
      (await page.locator('button:has-text("Continue with an empty workspace")').isDisabled()),
      'T1 blocks creating a new workspace while unknown'
    )

    await page.click('button:has-text("Retry check")')
    await page.waitForSelector('text=Assigned POS type:', { timeout: 20000 })
    assert(true, 'T1 retry recovers the saved workspace without re-login')

    await page.click('button:has-text("Recover workspace")')
    await page.waitForURL((u) => !u.pathname.startsWith('/restore'), { timeout: 25000 })
    const db = await readDb(page)
    assert(db?.stores?.length === 1, `T1 exactly one store (got ${db?.stores?.length})`)
    assert(db?.stores?.[0]?.posType === POS_TYPE, 'T1 POS type preserved')
    assert(pageErrors.length === 0, 'T1 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T1 cloud failure + retry', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T2 — repeated login does not duplicate the workspace
 * --------------------------------------------------------------- */
{
  const now = new Date().toISOString()
  const store = {
    id: 'str_existing',
    userId: 'usr_existing',
    name: 'Existing BBQ House',
    posType: POS_TYPE,
    createdAt: now,
    onboarded: true,
  }
  const { context, page } = await makeContext(browser, {
    cloudStore: {
      id: 'remote-store',
      name: 'Existing BBQ House',
      pos_type: POS_TYPE,
      onboarded: true,
      status: 'active',
    },
  })
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await seed(page, {
      user: localAccount({ id: 'usr_existing' }),
      store,
      sub: {
        id: 'sub_existing',
        userId: 'usr_existing',
        plan: 'trial',
        startedAt: now,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        pricePaid: 0,
        active: true,
      },
    })

    await login(page)
    await page.waitForSelector('nav[aria-label="Main"]', { timeout: 25000 })
    await page.click('button[aria-label="Account menu"]')
    await page.click('text=Log out')
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await login(page)
    await page.waitForSelector('nav[aria-label="Main"]', { timeout: 25000 })

    const db = await readDb(page)
    assert(db?.stores?.length === 1, `T2 repeated login keeps one store (got ${db?.stores?.length})`)
    assert(db?.stores?.[0]?.posType === POS_TYPE, 'T2 POS type unchanged after re-login')
    assert(pageErrors.length === 0, 'T2 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T2 repeated login idempotency', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T3 — backup restore without a cloud store uses the backup POS type
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser, { cloudStore: null })
  try {
    await login(page)
    await page.waitForSelector('h1:has-text("This account already exists")', { timeout: 25000 })
    assert(true, 'T3 existing account without cloud config reaches restore')

    const now = new Date().toISOString()
    const backup = {
      app: 'central-pos',
      version: 2,
      exportedAt: now,
      accountEmail: EMAIL,
      store: { name: 'Backup BBQ', posType: POS_TYPE },
      data: {
        categories: [],
        products: [
          {
            id: 'prd_backup',
            storeId: 'old-store',
            name: 'Backup Ribs',
            sku: 'BBQ-1',
            category: 'BBQ',
            price: 250,
            stock: 10,
            unit: 'pc',
            emoji: '🍖',
            active: true,
            createdAt: now,
          },
        ],
        stockMovements: [],
        customers: [],
        orders: [],
        orderItems: [],
        transactions: [],
        subscriptions: [],
      },
      settings: { printer: null, scanner: null },
    }

    await page.setInputFiles('input[aria-label="Choose a backup file"]', {
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })
    await page.waitForSelector('text=Restore this backup?', { timeout: 15000 })
    await page
      .locator('[data-slot="alert-dialog-content"] button:has-text("Restore backup")')
      .click()

    await page.waitForURL((u) => !u.pathname.startsWith('/restore'), { timeout: 25000 })
    const db = await readDb(page)
    assert(db?.stores?.length === 1, `T3 one store created from backup (got ${db?.stores?.length})`)
    assert(
      db?.stores?.[0]?.posType === POS_TYPE,
      `T3 backup POS type used (got ${db?.stores?.[0]?.posType})`
    )
    assert(db?.products?.some((p) => p.id === 'prd_backup'), 'T3 backup product restored')
    assert(pageErrors.length === 0, 'T3 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T3 backup restores without cloud config', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T4 — registering an existing email creates NO local identity
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser, { signupExisting: true })
  try {
    await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[name="fullName"]', { timeout: 20000 })
    await page.fill('input[name="fullName"]', 'Wizard Tester')
    await page.fill('textarea', '9 Wizard Lane, Quezon City, Metro Manila')
    await page.fill('input[placeholder="09171234567"]', '09171234567')
    await page.fill("input[placeholder=\"Clara's Carinderia\"]", 'Wizard Store')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="new-password"] >> nth=0', 'DifferentPass1')
    await page.fill('input[autocomplete="new-password"] >> nth=1', 'DifferentPass1')
    await page.click('button:has-text("Send confirmation link")')

    await page.waitForSelector('text=This email already has an account', { timeout: 20000 })
    assert(true, 'T4 duplicate registration is detected')
    assert(
      !(await page.locator('text=Confirm your email').count()),
      'T4 duplicate registration does not enter the verify/finalize step'
    )
    const db = await readDb(page)
    assert(db?.users?.length === 0, `T4 no local identity created (got ${db?.users?.length})`)
    assert(
      db?.pendingRegistrations?.length === 0,
      `T4 no pending registration staged (got ${db?.pendingRegistrations?.length})`
    )
    assert(pageErrors.length === 0, 'T4 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T4 duplicate registration', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T5 — legacy duplicate local stores are collapsed safely
 * --------------------------------------------------------------- */
{
  const now = new Date().toISOString()
  const goodStore = {
    id: 'str_good',
    userId: 'usr_existing',
    name: 'Real Store',
    posType: POS_TYPE,
    createdAt: new Date(Date.now() - 60000).toISOString(),
    onboarded: true,
  }
  const emptyDuplicate = {
    id: 'str_empty',
    userId: 'usr_existing',
    name: 'Duplicate Store',
    posType: 'cafe',
    createdAt: now,
    onboarded: true,
  }
  const { context, page } = await makeContext(browser, {
    cloudStore: {
      id: 'remote-store',
      name: 'Real Store',
      pos_type: POS_TYPE,
      onboarded: true,
      status: 'active',
    },
  })
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await seed(page, {
      user: localAccount({ id: 'usr_existing' }),
      stores: [goodStore, emptyDuplicate],
      sub: {
        id: 'sub_existing',
        userId: 'usr_existing',
        plan: 'trial',
        startedAt: now,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        pricePaid: 0,
        active: true,
      },
      product: {
        id: 'prd_keep',
        storeId: 'str_good',
        name: 'Keep Me',
        sku: 'BBQ-9',
        category: 'BBQ',
        price: 100,
        stock: 5,
        unit: 'pc',
        emoji: '🍖',
        active: true,
        createdAt: now,
      },
    })

    await login(page)
    await page.waitForSelector('nav[aria-label="Main"]', { timeout: 25000 })
    const db = await readDb(page)
    assert(db?.stores?.length === 1, `T5 duplicate store removed (got ${db?.stores?.length})`)
    assert(db?.stores?.[0]?.id === 'str_good', 'T5 the data-owning store is kept')
    assert(db?.stores?.[0]?.posType === POS_TYPE, 'T5 POS type not overwritten')
    assert(db?.products?.some((p) => p.id === 'prd_keep'), 'T5 business data preserved')
    assert(pageErrors.length === 0, 'T5 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T5 duplicate store normalization', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * T6 — offline login without a local workspace never onboards
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser, { cloudStore: null })
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await seed(page, { user: localAccount({ id: 'usr_existing' }) })
    await context.setOffline(true)

    // Do not navigate again while offline — fill the already-loaded form.
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="current-password"]', PASSWORD)
    await page.click('button:has-text("Sign in")')
    await page.waitForSelector('h1:has-text("This account already exists")', { timeout: 25000 })
    assert(true, 'T6 offline + empty local workspace reaches restore')
    assert(!page.url().includes('/onboarding'), 'T6 does not create a new workspace offline')
    assert(
      (await page.locator('text=offline').count()) > 0,
      'T6 explains that the workspace could not be verified offline'
    )
    const db = await readDb(page)
    assert(db?.stores?.length === 0, 'T6 no store created')
    assert(pageErrors.length === 0, 'T6 no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('T6 offline login', String(err))
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
