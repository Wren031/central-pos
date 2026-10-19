import { peso } from '@/lib/format'
import { DEMO_ITEMS, DEMO_TOTALS } from '../site'

export type CheckoutStepId = 'select' | 'scan' | 'cart' | 'checkout' | 'receipt'

export interface CheckoutStep {
  id: CheckoutStepId
  /** Short label for the step chips. */
  label: string
  /** One-line explanation, surfaced under the demo and to screen readers. */
  caption: string
  /** How long the step holds before auto-advancing, in ms. */
  duration: number
}

const itemCount = DEMO_ITEMS.reduce((sum, item) => sum + item.qty, 0)

/**
 * The receipt step's wording spells out what is printed, because the receipt
 * card is only shown on wider screens — on a phone the 3D paper is too small
 * to read, so the caption carries the content instead.
 */
const RECEIPT_CAPTION =
  `The thermal printer feeds out an itemized receipt — UniPOS Demo Store, ` +
  `${itemCount} items including ${DEMO_ITEMS[0].name}, total ${peso(DEMO_TOTALS.subtotal)}.`

/**
 * The five phases of the POS checkout workflow shown in the hero.
 * Order matters — the demo, the 3D scene, and the on-screen UI all index into it.
 */
export const CHECKOUT_STEPS: CheckoutStep[] = [
  {
    id: 'select',
    label: 'Select product',
    caption: 'The cashier taps a product tile on the POS screen to start the sale.',
    duration: 3000,
  },
  {
    id: 'scan',
    label: 'Scan barcode',
    caption: 'A handheld scanner sweeps the product barcode and the item is confirmed.',
    duration: 3400,
  },
  {
    id: 'cart',
    label: 'Add to cart',
    caption: 'The product, quantity and price drop into the cart and the total updates.',
    duration: 3000,
  },
  {
    id: 'checkout',
    label: 'Complete checkout',
    caption: 'The cashier charges the customer and the payment succeeds.',
    duration: 3200,
  },
  {
    id: 'receipt',
    label: 'Print receipt',
    caption: RECEIPT_CAPTION,
    duration: 4200,
  },
]

export const CHECKOUT_DURATIONS: readonly number[] = CHECKOUT_STEPS.map((step) => step.duration)
