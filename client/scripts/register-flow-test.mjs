/*
 * Registration + onboarding flow test.
 *
 * New workflow: Register (account details) → Email verification → Select POS
 * type → Choose your plan duration → Workspace.
 *
 * Stubs the Supabase REST/Auth endpoints (POS catalogue, plan catalogue, signup,
 * account status) so the flow runs deterministically without touching data.
 *
 * Run against a preview build:
 *   npm run build && npm run preview      # port 4173
 *   BASE_URL=http://localhost:4173 node scripts/register-flow-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = `wizard-${Date.now()}@example.com`
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
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
}

const POS_TYPES = [
  {
    id: 'bbq',
    name: 'BBQ POS',
    tagline: 'Grill & skewer counters',
    description: 'Built for barbecue and grilling.',
    icon: 'flame',
    category: 'food',
    active: true,
    sort_order: 1,
  },
  {
    id: 'grocery',
    name: 'Grocery POS',
    tagline: 'Sari-sari & mini-marts',
    description: 'Built for grocery retail.',
    icon: 'shopping-basket',
    category: 'retail',
    active: true,
    sort_order: 2,
  },
]

const PLANS = [
  {
    id: 'trial',
    name: 'Free Trial',
    description: 'Full access, no card required.',
    duration_days: 30,
    price: 0,
    currency: 'PHP',
    is_trial: true,
    active: true,
    features: [],
    sort_order: 0,
  },
  {
    id: 'monthly',
    name: 'Monthly',
    description: 'Most popular for small stores.',
    duration_days: 30,
    price: 299,
    currency: 'PHP',
    is_trial: false,
    active: true,
    features: ['Unlimited orders'],
    sort_order: 2,
  },
]

async function makeContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const json = (route, body, status = 200) =>
    route.fulfill({ status, headers: CORS, body: JSON.stringify(body) })

  await context.route('**/rest/v1/pos_types**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : json(route, POS_TYPES)
  )
  await context.route('**/rest/v1/pos_type_categories**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : json(route, [])
  )
  await context.route('**/rest/v1/subscription_plans**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : json(route, PLANS)
  )
  await context.route('**/rest/v1/rpc/public_gcash_qr**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : json(route, { url: null, active: false })
  )
  await context.route('**/rest/v1/rpc/client_account_status', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : json(route, { found: true, status: 'active' })
  )
  await context.route('**/auth/v1/signup**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = JSON.parse(route.request().postData() ?? '{}')
    return json(route, {
      user: {
        id: '33333333-3333-3333-3333-333333333333',
        aud: 'authenticated',
        role: 'authenticated',
        email: body.email ?? EMAIL,
        email_confirmed_at: null,
        identities: [{}],
        app_metadata: {},
        user_metadata: body.data ?? {},
        created_at: new Date().toISOString(),
      },
      session: null,
    })
  })

  const page = await context.newPage()
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  return { context, page }
}

async function isVisible(page, text) {
  return page
    .locator(`text=${text}`)
    .first()
    .isVisible()
    .catch(() => false)
}

/** Seed a confirmed account with NO store (i.e. mid-onboarding). */
async function seedConfirmedAccount(page, email) {
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 30 * 86400000).toISOString()
  const userId = 'usr_onboarding_test'
  await page.evaluate(
    async (data) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('central-pos')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const tx = db.transaction(['users', 'sessions', 'subscriptions'], 'readwrite')
      tx.objectStore('users').put(data.user)
      tx.objectStore('sessions').put(data.session)
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
        fullName: 'Onboarding Tester',
        address: '9 Wizard Lane, Quezon City, Metro Manila',
        contactNumber: '09171234567',
        businessName: 'Onboarding Store',
        email,
        passwordHash: LEGACY_HASH,
        notificationPrefs: { expiration: true, reminders: true, marketing: false },
        createdAt: now,
        accountStatus: 'active',
        accountStatusCheckedAt: now,
      },
      session: { id: 'current', userId, loggedInAt: now },
      sub: {
        id: 'sub_onboarding_test',
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

const browser = await chromium.launch()

/* --------------------------------------------------------------- *
 * A — Register: details → email verification (NO POS/plan before verify)
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[name="fullName"]', { timeout: 20000 })

    await page.fill('input[name="fullName"]', 'Wizard Tester')
    await page.fill('textarea', '9 Wizard Lane, Quezon City, Metro Manila')
    await page.fill('input[placeholder="09171234567"]', '09171234567')
    await page.fill("input[placeholder=\"Clara's Carinderia\"]", 'Wizard Store')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[autocomplete="new-password"] >> nth=0', 'Password1')
    await page.fill('input[autocomplete="new-password"] >> nth=1', 'Password1')
    await page.click('button:has-text("Send confirmation link")')

    await page.waitForSelector('text=Confirm your email', { timeout: 20000 })
    assert(true, 'A: details → email verification step')
    assert(
      !(await isVisible(page, 'Choose your POS workspace')),
      'A: no POS step before email verification'
    )
    assert(
      !(await isVisible(page, 'Choose your plan duration')),
      'A: no duration step before email verification'
    )
    assert(pageErrors.length === 0, 'A: no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('A register → verify order', String(err))
  } finally {
    await context.close()
  }
}

/* --------------------------------------------------------------- *
 * B — After verification: POS type → plan duration → workspace
 * --------------------------------------------------------------- */
{
  const { context, page } = await makeContext(browser)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await seedConfirmedAccount(page, EMAIL)

    await page.goto(BASE + '/onboarding', { waitUntil: 'domcontentloaded' })

    // Step 1 — POS type (after verification).
    await page.waitForSelector('text=Choose your POS workspace', { timeout: 20000 })
    assert(true, 'B: POS type step shows after verification')
    assert(await isVisible(page, 'BBQ POS'), 'B: POS catalog loaded')
    const continueDisabled = await page.locator('button:has-text("Continue")').isDisabled()
    assert(continueDisabled, 'B: Continue disabled until a POS type is selected')

    await page.click('text=BBQ POS')
    await page.waitForTimeout(150)
    await page.click('button:has-text("Continue")')

    // Step 2 — plan duration.
    await page.waitForSelector('text=Choose your plan duration', { timeout: 20000 })
    assert(true, 'B: plan duration step follows the POS type step')
    const trialChecked = await page
      .locator('[role="radio"][aria-checked="true"]')
      .first()
      .innerText()
      .catch(() => '')
    assert(trialChecked.includes('Free Trial'), 'B: Free Trial preselected by default')

    // Back navigation still works.
    await page.click('button:has-text("Back")')
    await page.waitForSelector('text=Choose your POS workspace', { timeout: 10000 })
    assert(true, 'B: Back returns to the POS type step')
    await page.click('text=BBQ POS')
    await page.waitForTimeout(150)
    await page.click('button:has-text("Continue")')
    await page.waitForSelector('text=Choose your plan duration', { timeout: 10000 })

    // Choose Monthly, then finish.
    await page.click('text=Monthly')
    await page.waitForTimeout(150)
    await page.click('button:has-text("Create my workspace")')

    // → Workspace.
    await page.waitForSelector(WORKSPACE_SELECTOR, { timeout: 25000 })
    assert(true, 'B: lands in the workspace after choosing a duration')

    // The store must be provisioned with the chosen POS type and the
    // subscription set to the chosen plan + duration.
    const state = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('central-pos')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction(['stores', 'subscriptions'], 'readonly')
            const stores = tx.objectStore('stores').getAll()
            const subs = tx.objectStore('subscriptions').getAll()
            tx.oncomplete = () => {
              resolve({ stores: stores.result, subs: subs.result })
              db.close()
            }
            tx.onerror = () => resolve(null)
          }
          req.onerror = () => resolve(null)
        })
    )
    const store = state?.stores?.[0]
    const sub = state?.subs?.[0]
    assert(store?.posType === 'bbq', `B: store provisioned with chosen POS type (got ${store?.posType})`)
    assert(store?.onboarded === true, 'B: store marked onboarded')
    assert(sub?.plan === 'monthly', `B: subscription set to chosen plan (got ${sub?.plan})`)
    assert(sub?.durationDays === 30, `B: subscription duration applied (got ${sub?.durationDays})`)
    assert(pageErrors.length === 0, 'B: no page errors', pageErrors.join(' | '))
  } catch (err) {
    fail('B onboarding POS → duration → workspace', String(err))
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
