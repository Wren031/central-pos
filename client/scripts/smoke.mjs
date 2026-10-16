/* Smoke test: full user flow against the production build. */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})

try {
  // 1. Login page loads
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Sign in to your account', { timeout: 10000 })
  ok('login page renders')

  // 2. Register a new user
  await page.click('text=Register free for 30 days')
  await page.waitForSelector('text=Create your account')
  await page.fill('input[name="fullName"]', 'Ana Reyes')
  await page.fill('textarea', '78 Sampaguita Street, Brgy. Bagong Silangan, Quezon City, Metro Manila')
  await page.fill('input[placeholder="09171234567"]', '09171234567')
  await page.fill('input[placeholder="Clara\'s Carinderia"]', "Ana's Eatery")
  await page.fill('input[type="email"]', 'ana@test.ph')
  await page.fill('input[autocomplete="new-password"] >> nth=0', 'Password1')
  await page.fill('input[autocomplete="new-password"] >> nth=1', 'Password1')
  await page.click('button:has-text("Create account")')
  await page.waitForSelector('text=Choose your POS', { timeout: 15000 })
  ok('registration → onboarding')

  // 3. Choose Cafe POS and generate
  await page.click('text=Cafe POS')
  await page.click('button:has-text("Generate my POS workspace")')
  await page.waitForSelector('text=Good', { timeout: 20000 })
  ok('onboarding → dashboard')

  // 4. Dashboard shows trial status
  const dashHtml = await page.content()
  if (dashHtml.includes('Free trial') || dashHtml.includes('trial')) ok('dashboard shows trial')
  else fail('dashboard trial badge')

  // 5. Catalog starts EMPTY for new registrations
  await page.goto(BASE + '/pos/catalog', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=No products found', { timeout: 10000 })
  ok('new registration starts with empty catalog')

  // 6. Add a product via inventory
  await page.goto(BASE + '/pos/inventory', { waitUntil: 'networkidle' })
  await page.click('button:has-text("Add") >> nth=0')
  await page.waitForSelector('text=Add product', { timeout: 5000 })
  await page.fill('input[placeholder="Chicken Inasal"]', 'Spanish Latte')
  await page.fill('input[inputmode="decimal"]', '120')
  await page.fill('input[inputmode="numeric"]', '20')
  await page.click('button:has-text("Add to catalog")')
  await page.waitForSelector('text=Product added', { timeout: 10000 })
  ok('inventory add product')

  // 7. Catalog: add product to cart
  await page.goto(BASE + '/pos/catalog', { waitUntil: 'networkidle' })
  await page.waitForSelector('button[aria-label^="Add "]', { timeout: 10000 })
  const firstProduct = page.locator('button[aria-label^="Add "]').first()
  const productName = (await firstProduct.getAttribute('aria-label')).replace('Add ', '').replace(' to cart', '')
  await firstProduct.click()
  await firstProduct.click()
  ok(`catalog add to cart (${productName})`)

  // 7. Checkout
  await page.click('button:has-text("Charge")')
  await page.waitForSelector('text=Checkout')
  await page.fill('#cash', '500')
  await page.click('button:has-text("Complete sale")')
  await page.waitForSelector('text=Order RCP-', { timeout: 10000 })
  ok('checkout creates the order')
  // No receipt preview pop-up after a sale — the receipt only prints to the
  // Bluetooth printer, and the checkout dialog closes back to the catalog.
  if (await page.isVisible('[data-receipt]')) fail('no receipt preview after checkout')
  else ok('no receipt preview after checkout')

  // 8. Orders page shows the order
  await page.goto(BASE + '/pos/orders', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=RCP-', { timeout: 10000 })
  ok('orders list shows receipt')

  // 9. Subscription page
  await page.goto(BASE + '/subscription', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Weekly')
  await page.waitForSelector('text=Monthly')
  await page.waitForSelector('text=Yearly')
  ok('subscription plans render')

  // 10. Buy weekly plan
  await page.click('button:has-text("Choose Weekly")')
  await page.waitForSelector('text=Confirm Weekly plan')
  await page.click('button:has-text("Continue to payment")')
  await page.fill('#card-number', '4242424242424242')
  await page.fill('#card-exp', '1228')
  await page.fill('#card-cvc', '123')
  await page.click('button:has-text("Pay")')
  await page.waitForSelector('text=Payment successful', { timeout: 15000 })
  ok('subscription checkout success')
  await page.keyboard.press('Escape')

  // 11. Advance clock 60 days via mock-clock offset → expired (trial 30d + weekly 7d ≈ 37d)
  await page.evaluate(() =>
    localStorage.setItem('cpos:v1:clock-offset-ms', String(60 * 24 * 60 * 60 * 1000))
  )
  await page.reload({ waitUntil: 'networkidle' })
  ok('clock advanced 60 days')

  // 12. Catalog should show locked banner
  await page.goto(BASE + '/pos/catalog', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Selling is locked', { timeout: 10000 })
  ok('expired subscription locks selling')

  // 13. Renew from subscription page
  await page.goto(BASE + '/subscription', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Renew with Monthly', { timeout: 10000 })
  await page.click('button:has-text("Renew with Monthly")')
  await page.waitForSelector('text=Confirm Monthly plan')
  await page.click('button:has-text("Continue to payment")')
  await page.fill('#card-number', '4242424242424242')
  await page.fill('#card-exp', '1228')
  await page.fill('#card-cvc', '123')
  await page.click('button:has-text("Pay")')
  await page.waitForSelector('text=Payment successful', { timeout: 15000 })
  ok('renewal after expiry')

  // 14. Profile page
  await page.goto(BASE + '/profile', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Personal & store information')
  ok('profile page')

  // 14b. POS settings → printer card renders with real capability notice
  await page.goto(BASE + '/pos/settings', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Receipt printer', { timeout: 10000 })
  await page.waitForSelector('text=Paper width')
  await page.waitForSelector('text=Receipt layout')
  await page.waitForSelector('text=Footer message')
  await page.waitForSelector('text=Subtotal breakdown')
  const settingsHtml = await page.content()
  if (
    settingsHtml.includes('Web Bluetooth is available in this browser') ||
    settingsHtml.includes('Bluetooth printing is not available in this browser') ||
    settingsHtml.includes('Android app — full support')
  )
    ok('printer card shows honest platform notice')
  else fail('printer platform notice missing')

  // 15. Logout then login again with the registered account
  await page.goto(BASE + '/profile', { waitUntil: 'networkidle' })
  await page.click('button:has-text("Log out")')
  await page.waitForSelector('text=Sign in to your account', { timeout: 10000 })
  await page.fill('input[type="email"]', 'ana@test.ph')
  await page.fill('input[autocomplete="current-password"]', 'Password1')
  await page.click('button:has-text("Sign in")')
  await page.waitForSelector('text=Good', { timeout: 15000 })
  ok('re-login after logout')

  // 16. Mobile viewport check
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  const hasBottomNav = await page.locator('nav[aria-label="Bottom navigation"]').isVisible()
  if (hasBottomNav) ok('mobile bottom nav visible')
  else fail('mobile bottom nav')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (!overflow) ok('no horizontal overflow on mobile')
  else fail('horizontal overflow on mobile')
} catch (err) {
  fail('workflow', err.message)
} finally {
  await browser.close()
  console.log('\n--- Console/page errors ---')
  console.log(errors.length ? errors.join('\n') : '(none)')
  const failed = results.filter((r) => r.startsWith('FAIL'))
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length || errors.length ? 1 : 0)
}
