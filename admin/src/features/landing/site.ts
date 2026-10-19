import {
  BarChart3,
  Bluetooth,
  ClipboardList,
  Package,
  Printer,
  WifiOff,
} from 'lucide-react'

/* -------------------------------------------------------------------------- */
/* Site configuration                                                          */
/* -------------------------------------------------------------------------- */

export const SITE = {
  name: 'UniPOS',
  tagline: 'Offline-first point of sale for every kind of store',
  contactEmail: 'support@centralpos.ph',
} as const

export const COPYRIGHT_YEAR = new Date().getFullYear()

/** Base URL of the POS client app (registration + merchant login live there). */
export const POS_APP_URL = (
  (import.meta.env.VITE_POS_APP_URL as string | undefined) ?? 'http://localhost:5173'
).replace(/\/+$/, '')

export const REGISTER_URL = `${POS_APP_URL}/register`
export const LOGIN_URL = `${POS_APP_URL}/login`

export const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pos-types', label: 'POS Types' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#download', label: 'Download' },
  { href: '#faq', label: 'FAQ' },
] as const

export const CTA_BENEFITS = ['Works fully offline', 'Bluetooth receipts', 'Android & Windows'] as const

/* -------------------------------------------------------------------------- */
/* Static fallbacks (used when Supabase is unreachable / not configured)        */
/* -------------------------------------------------------------------------- */

export const FALLBACK_POS_TYPES: { id: string; name: string; tagline: string }[] = [
  { id: 'bbq', name: 'BBQ POS', tagline: 'Grills, skewers & plated meals' },
  { id: 'retail', name: 'Retail POS', tagline: 'Shops, boutiques & general goods' },
  { id: 'grocery', name: 'Grocery POS', tagline: 'Per-kilo items & essentials' },
  { id: 'restaurant', name: 'Restaurant POS', tagline: 'Dine-in, takeout & tables' },
  { id: 'cafe', name: 'Cafe POS', tagline: 'Coffee, pastries & add-ons' },
  { id: 'pharmacy', name: 'Pharmacy POS', tagline: 'Medicines & health products' },
  { id: 'general', name: 'General Merchandise', tagline: 'Flexible layout for any trade' },
]

export const FALLBACK_PLANS: {
  id: string
  name: string
  duration_days: number
  price: number
  is_trial: boolean
  description: string | null
}[] = [
  { id: 'trial', name: 'Free Trial', duration_days: 30, price: 0, is_trial: true, description: 'Full access, no card required' },
  { id: 'weekly', name: 'Weekly', duration_days: 7, price: 99, is_trial: false, description: null },
  { id: 'monthly', name: 'Monthly', duration_days: 30, price: 299, is_trial: false, description: 'Most popular' },
  { id: 'yearly', name: 'Yearly', duration_days: 365, price: 2999, is_trial: false, description: 'Best value — 2 months free' },
]

/* -------------------------------------------------------------------------- */
/* Section copy                                                                 */
/* -------------------------------------------------------------------------- */

export const FEATURES = [
  {
    icon: WifiOff,
    title: 'Offline sales processing',
    description:
      'Keep selling when the internet drops. Every sale is stored on-device and stays available — no downtime, no lost revenue.',
  },
  {
    icon: Package,
    title: 'Inventory management',
    description:
      'Track stock levels per item, get low-stock visibility, and adjust counts with a proper movement history.',
  },
  {
    icon: ClipboardList,
    title: 'Order tracking',
    description:
      'Every order and receipt is recorded with timestamps, items, and totals so you can always trace a transaction.',
  },
  {
    icon: Printer,
    title: 'Receipt printing',
    description:
      'Print clean, itemized receipts for every sale — ready for ESC/POS thermal printers and standard setups.',
  },
  {
    icon: BarChart3,
    title: 'Sales reports',
    description:
      'See revenue, best sellers, and trends with built-in reports that work offline and update as you sell.',
  },
  {
    icon: Bluetooth,
    title: 'Bluetooth printer support',
    description:
      'Pair a Bluetooth thermal printer and print receipts right from the counter — no cables, no extra software.',
  },
] as const

export type HowItWorksIllustration = 'register' | 'setup' | 'products' | 'checkout' | 'receipt'

export const HOW_IT_WORKS: {
  step: string
  title: string
  description: string
  illustration: HowItWorksIllustration
}[] = [
  {
    step: '1',
    title: 'Register your business',
    description:
      'Create your merchant account with your store name and contact details. Verify your email and your 30-day free trial starts immediately.',
    illustration: 'register',
  },
  {
    step: '2',
    title: 'Set up your POS',
    description:
      'Install UniPOS on Android or Windows, then pick the POS type that matches your trade — each layout arranges its own screens and categories.',
    illustration: 'setup',
  },
  {
    step: '3',
    title: 'Manage your products',
    description:
      'Add items, prices, and categories, or start from the categories bundled with your POS type. Stock counts stay in sync as you sell.',
    illustration: 'products',
  },
  {
    step: '4',
    title: 'Scan, sell & check out',
    description:
      'Ring up a sale by tapping a product or scanning its barcode. The cart total updates instantly, then confirm payment — online or off.',
    illustration: 'checkout',
  },
  {
    step: '5',
    title: 'Print the receipt',
    description:
      'Send an itemized receipt to a connected thermal printer — USB or Bluetooth — and keep a full record of every sale and order.',
    illustration: 'receipt',
  },
]

export const FAQS = [
  {
    q: 'Does UniPOS really work offline?',
    a: 'Yes. The POS app stores products, sales, and reports in an on-device database. You can ring up sales, print receipts, and view reports with no internet connection. Data syncs to the cloud when a connection is available.',
  },
  {
    q: 'What happens after the 30-day free trial?',
    a: 'Your trial includes full access for 30 days with no card required. When it ends, pick a weekly, monthly, or yearly plan inside the app to keep selling — your data stays on your device either way.',
  },
  {
    q: 'Which devices are supported?',
    a: 'Android phones and tablets via the APK download. A Windows build is offered here whenever a compatible installer is published. The app runs fully on-device on both platforms.',
  },
  {
    q: 'Can I print receipts?',
    a: 'Yes. UniPOS supports ESC/POS receipt printing, including Bluetooth thermal printers — pair the printer, pick it in POS settings, and print with every sale.',
  },
  {
    q: 'Can I switch POS types later?',
    a: 'Yes. You can change your store’s POS type from settings. Note that switching clears the current catalog so your product layout matches the new type.',
  },
  {
    q: 'Is my business data safe?',
    a: 'Your data lives primarily on your own device. Subscription status and store profiles sync securely through Supabase; the admin team can never access your on-device sales database.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Legal copy                                                                   */
/* -------------------------------------------------------------------------- */

export const PRIVACY_POLICY = `UniPOS collects only the information needed to run your store account: your name, business name, contact number, store address, and email address. Sales and product data are stored on your own device and are not uploaded unless a future sync feature is enabled.

We use Supabase (hosted PostgreSQL and authentication) to store account profiles, store records, and subscription status. We do not sell your data. Payment records in this system are mock entries for demonstration and are not connected to a real payment gateway.

You may request export or deletion of your account data at any time by contacting ${SITE.contactEmail}.`

export const TERMS_OF_SERVICE = `By using UniPOS you agree to use the software for lawful business purposes and to keep your account credentials secure.

Subscriptions grant access for the purchased period (weekly, monthly, or yearly) and begin after the 30-day free trial. Subscription fees are non-refundable once a period has started, except where required by law.

The software is provided “as is” without warranty of any kind. Offline data remains your responsibility — maintain backups of your device. We may update these terms; continued use after a change constitutes acceptance.

Questions: ${SITE.contactEmail}`

/* -------------------------------------------------------------------------- */
/* Landing-page demonstration data (sample only — never written anywhere)       */
/* -------------------------------------------------------------------------- */

/**
 * The hero demo renders realistic sample products so visitors can see the
 * checkout workflow. None of this touches the database, the POS client, or
 * any real transaction — it is presentation-only content.
 */
export const DEMO_ITEMS = [
  { name: 'Chicken BBQ', qty: 2, unitPrice: 45 },
  { name: 'Pork BBQ', qty: 1, unitPrice: 35 },
  { name: 'Garlic Rice', qty: 3, unitPrice: 20 },
  { name: 'Softdrinks', qty: 2, unitPrice: 25 },
] as const

export const DEMO_CATALOG = [
  { name: 'Chicken BBQ', price: 45 },
  { name: 'Pork BBQ', price: 35 },
  { name: 'Garlic Rice', price: 20 },
  { name: 'Isaw', price: 15 },
  { name: 'Grilled Bangus', price: 90 },
  { name: 'Softdrinks', price: 25 },
] as const

/** The product the demo "scans" — item 0 of the catalog. */
export const DEMO_SCANNED_PRODUCT = { name: 'Chicken BBQ', price: 45, barcode: '4801234567890' } as const

export const DEMO_STORE = {
  name: 'UniPOS Demo Store',
  address: '123 Rizal St., Quezon City',
  receiptNo: '000123',
  cashier: 'Ana',
  terminal: 'Terminal 01',
  layout: 'BBQ layout',
} as const

export const DEMO_TOTALS = {
  subtotal: DEMO_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
  cash: 250,
} as const
