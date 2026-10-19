/* Offline-first test: IndexedDB persistence, offline sales, sync queue drain. */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const EMAIL = `offline-${Date.now()}@test.ph`
const errors = []
const results = []

function ok(name) {
  results.push(`PASS ${name}`)
  console.log(`PASS ${name}`)
}
function fail(name, extra = '') {
  results.push(`FAIL ${name} ${extra}`)
  console.log(`FAIL ${name} ${extra}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})

async function syncPillText() {
  return (
    (await page
      .locator('header button[aria-label*="Sync status"], header button[aria-label*="offline"]')
      .first()
      .textContent()
      .catch(() => '')) ?? ''
  )
}

try {
  // 1. Register a fresh account (no demo account exists)
  await page.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await page.fill('input[name="fullName"]', 'Offline Tester')
  await page.fill('textarea', '12 Test Street, Quezon City, Metro Manila')
  await page.fill('input[placeholder="09171234567"]', '09171234567')
  await page.fill('input[placeholder="Clara\'s Carinderia"]', 'Offline Test Store')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[autocomplete="new-password"] >> nth=0', 'Password1')
  await page.fill('input[autocomplete="new-password"] >> nth=1', 'Password1')
  await page.click('button:has-text("Create account")')
  await page.waitForSelector('text=Choose your POS', { timeout: 15000 })
  ok('registration (no demo account)')

  // 2. Onboard with BBQ POS (empty catalog)
  await page.click('text=BBQ POS')
  await page.click('button:has-text("Generate my POS workspace")')
  await page.waitForSelector('text=Good', { timeout: 20000 })
  ok('onboarding → dashboard')

  // 3. Add one product to sell
  await page.goto(BASE + '/pos/inventory', { waitUntil: 'networkidle' })
  await page.click('button:has-text("Add") >> nth=0')
  await page.waitForSelector('text=Add product', { timeout: 5000 })
  await page.fill('input[placeholder="Chicken Inasal"]', 'Pork BBQ Stick')
  await page.fill('input[inputmode="decimal"]', '25')
  await page.fill('input[inputmode="numeric"]', '50')
  await page.click('button:has-text("Add to catalog")')
  await page.waitForSelector('text=Product added', { timeout: 10000 })
  ok('product added to empty catalog')

  // 4. Let the service worker activate (needed for offline reload)
  await page.goto(BASE + '/pos/catalog', { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready
    }
  })
  ok('service worker active')

  // 5. Go offline — app must still allow selling
  await context.setOffline(true)
  await page.waitForTimeout(300)
  const pill = await syncPillText()
  if (pill.toLowerCase().includes('offline')) ok('sync pill shows Offline')
  else fail('sync pill offline indicator', `got: "${pill}"`)

  // 6. Offline reload — the SW shell must serve the app
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('button[aria-label^="Add "]', { timeout: 15000 })
  ok('offline reload serves app + data from IndexedDB')

  // 7. Offline checkout
  await page.click('button[aria-label^="Add "] >> nth=0')
  await page.click('button:has-text("Charge")')
  await page.waitForSelector('text=Checkout', { timeout: 5000 })
  await page.fill('#cash', '500')
  await page.click('button:has-text("Complete sale")')
  await page.waitForSelector('text=Receipt preview', { timeout: 15000 })
  ok('checkout works while offline')
  await page.keyboard.press('Escape')

  // 8. Back online — pending ops should sync and drain
  await context.setOffline(false)
  await page.waitForTimeout(5000)
  const pillAfter = await syncPillText()
  if (!pillAfter.toLowerCase().includes('offline') && !/\d+ failed/.test(pillAfter)) {
    ok('sync drains after coming back online')
  } else {
    fail('sync drain after online', `pill: "${pillAfter}"`)
  }

  // 9. Persist across reload (online) — the offline sale survives
  await page.goto(BASE + '/pos/orders', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=RCP-', { timeout: 10000 })
  ok('order persisted in IndexedDB')

  // 10. Adjust-stock flow (inventory history + atomic stock change)
  await page.goto(BASE + '/pos/inventory', { waitUntil: 'networkidle' })
  await page.waitForSelector('button[aria-label^="Adjust stock for"]', { timeout: 10000 })
  await page.click('button[aria-label^="Adjust stock for"] >> nth=0')
  await page.waitForSelector('text=Adjust stock', { timeout: 5000 })
  await page.fill('#adj-qty', '5')
  await page.click('button:has-text("Apply adjustment")')
  await page.waitForSelector('text=stock is now', { timeout: 10000 })
  ok('adjust stock writes movement + updates count')

  // 11. Settings data & sync card
  await page.goto(BASE + '/pos/settings', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Data & sync', { timeout: 10000 })
  ok('settings shows Data & sync card')
} catch (err) {
  fail('unexpected error', err instanceof Error ? err.message : String(err))
}

console.log('\n--- Console/page errors ---')
if (errors.length === 0) console.log('(none)')
else errors.slice(0, 10).forEach((e) => console.log(e))

const passed = results.filter((r) => r.startsWith('PASS')).length
const total = results.length
console.log(`\n${passed}/${total} checks passed`)
await browser.close()
process.exit(passed === total && errors.length === 0 ? 0 : 1)
