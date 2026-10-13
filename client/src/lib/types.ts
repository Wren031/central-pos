export type PosTypeId =
  | 'bbq'
  | 'retail'
  | 'grocery'
  | 'restaurant'
  | 'cafe'
  | 'pharmacy'
  | 'general'

export type PlanId = 'trial' | 'weekly' | 'monthly' | 'yearly'

export interface NotificationPrefs {
  expiration: boolean
  reminders: boolean
  marketing: boolean
}

export interface User {
  id: string
  fullName: string
  address: string
  contactNumber: string
  businessName: string
  email: string
  passwordHash: string
  notificationPrefs: NotificationPrefs
  createdAt: string
}

export interface Store {
  id: string
  userId: string
  name: string
  posType: PosTypeId
  createdAt: string
  onboarded: boolean
}

export interface Subscription {
  id: string
  userId: string
  plan: PlanId
  startedAt: string
  expiresAt: string
  pricePaid: number
  active: boolean
}

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected'

/**
 * A manually-submitted GCash QR payment proof. Submitting it NEVER activates
 * or extends the subscription locally — only an administrator approving the
 * request (mirrored from the Supabase backend) changes the subscription.
 */
export interface PaymentRequest {
  id: string
  userId: string
  plan: Exclude<PlanId, 'trial'>
  amount: number
  /** Customer-entered GCash transaction reference number. */
  referenceNo: string
  notes: string
  /** Compressed data URL of the uploaded receipt screenshot, if any. */
  proofImage: string | null
  status: PaymentRequestStatus
  rejectionReason: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface Product {
  id: string
  storeId: string
  name: string
  sku: string
  category: string
  price: number
  stock: number
  emoji: string
  image?: string
  active: boolean
  createdAt: string
}

export interface OrderItem {
  productId: string
  name: string
  price: number
  qty: number
}

export interface Order {
  id: string
  storeId: string
  userId: string
  receiptNo: string
  items: OrderItem[]
  subtotal: number
  discount: number
  total: number
  paymentStatus: 'paid' | 'unpaid'
  customerId?: string | null
  customerName?: string | null
  /** Cash handed over at checkout — null on unpaid / legacy orders. */
  cashTendered?: number | null
  /** Cash returned to the customer — null on unpaid / legacy orders. */
  change?: number | null
  createdAt: string
}

export interface Transaction {
  id: string
  userId: string
  type: 'subscription' | 'order'
  reference: string
  description: string
  amount: number
  status: 'success'
  createdAt: string
}

export interface AppNotification {
  id: string
  userId: string
  kind:
    | 'trial_ending'
    | 'expiring'
    | 'expired'
    | 'renewed'
    | 'welcome'
    | 'payment_submitted'
    | 'payment_approved'
    | 'payment_rejected'
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface Session {
  userId: string
  loggedInAt: string
}

/* ---------- offline-first models ---------- */

export interface Category {
  id: string
  storeId: string
  name: string
  createdAt: string
}

export interface Customer {
  id: string
  storeId: string
  name: string
  phone?: string
  email?: string
  createdAt: string
}

export type StockMovementType = 'initial' | 'sale' | 'restock' | 'adjust' | 'damage'

export interface StockMovement {
  id: string
  storeId: string
  productId: string
  productName: string
  type: StockMovementType
  qtyDelta: number
  stockAfter: number
  reason?: string
  orderId?: string
  createdAt: string
}

export interface OrderItemRecord {
  id: string
  orderId: string
  storeId: string
  productId: string
  name: string
  price: number
  qty: number
}

export type SyncEntity =
  | 'user'
  | 'store'
  | 'product'
  | 'category'
  | 'customer'
  | 'order'
  | 'stockMovement'
  | 'subscription'
  | 'notification'
  | 'printerSettings'
  | 'paymentRequest'

export type SyncOperationStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface SyncOperation {
  id: string
  idempotencyKey: string
  entity: SyncEntity
  entityId: string
  storeId?: string | null
  action: 'create' | 'update' | 'delete'
  status: SyncOperationStatus
  attempts: number
  lastError?: string | null
  payload?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  syncedAt?: string | null
}

export interface SyncConflict {
  id: string
  entity: SyncEntity
  entityId: string
  resolution: 'local-wins' | 'server-wins'
  detectedAt: string
}

export interface SessionRow extends Session {
  id: string
}

export interface PosConfigRecord {
  id: PosTypeId
  name: string
  tagline: string
  description: string
  features: string[]
  categories: string[]
  seedProducts: { name: string; category: string; price: number; emoji: string; stock: number }[]
  updatedAt: string
}

export interface SyncMetaRow {
  key: string
  value: unknown
}

export type PrinterProtocol = 'ble' | 'spp'

export type ReceiptHeaderStyle = 'full' | 'compact'

/**
 * Printed body text size. Named presets map to the printer's real character
 * steps; the px entries set an exact on-screen preview size that the printer
 * snaps to its nearest step.
 */
export type ReceiptFontSize =
  | 'small'
  | 'medium'
  | 'large'
  | '6px'
  | '8px'
  | '9px'
  | '10px'
  | '11px'
  | '12px'

/** Nominal text height in px per size — drives the on-screen receipt preview. */
export const RECEIPT_FONT_PX: Record<ReceiptFontSize, number> = {
  small: 9,
  medium: 11,
  large: 13,
  '6px': 6,
  '8px': 8,
  '9px': 9,
  '10px': 10,
  '11px': 11,
  '12px': 12,
}

/** Printer scale step: 1 = native, 2 = double-width / double-size, 3 = double both. */
export type ReceiptFontPrintStep = 1 | 2 | 3

/**
 * Maps a font size to the nearest step the printer can actually print. A
 * thermal printer cannot render arbitrary px sizes, so the range collapses:
 * ≤10 px native · 11–12 px double width · ≥13 px double width + height.
 */
export function receiptFontStep(size: ReceiptFontSize): ReceiptFontPrintStep {
  const px = RECEIPT_FONT_PX[size]
  if (px >= 13) return 3
  if (px >= 11) return 2
  return 1
}

/** Customizable receipt layout, applied by the ESC/POS encoder. */
export interface ReceiptLayout {
  /** Print the store address under the store name. */
  showAddress: boolean
  /** Print the VAT registration TIN line. */
  showTin: boolean
  /** Print the customer name line. */
  showCustomer: boolean
  /** Show "qty x unit price" detail next to each item. */
  showUnitPrice: boolean
  /** Show subtotal + discount rows above TOTAL (off = only TOTAL). */
  showBreakdown: boolean
  /** Header style — full uses a large double-size store name. */
  headerStyle: ReceiptHeaderStyle
  /** Body font size. Medium prints double-width, large double-width + double-height. */
  fontSize: ReceiptFontSize
  /** Thank-you / footer message printed at the bottom. */
  footerText: string
}

export const DEFAULT_RECEIPT_LAYOUT: ReceiptLayout = {
  showAddress: true,
  showTin: true,
  showCustomer: true,
  showUnitPrice: true,
  showBreakdown: true,
  headerStyle: 'full',
  fontSize: 'small',
  footerText: 'Salamat po! Please come again.',
}

export interface PrinterSettings {
  storeId: string
  deviceId: string | null
  deviceName: string | null
  protocol: PrinterProtocol | null
  autoPrint: boolean
  paperWidth: 58 | 80
  layout: ReceiptLayout
  updatedAt: string
}

export interface Database {
  users: User[]
  stores: Store[]
  subscriptions: Subscription[]
  products: Product[]
  orders: Order[]
  transactions: Transaction[]
  notifications: AppNotification[]
  paymentRequests: PaymentRequest[]
  session: Session | null
}

export type SubStatus = 'trial' | 'active' | 'expiring' | 'expired'

export interface SubState {
  status: SubStatus
  daysLeft: number
  hoursLeft: number
  expiresAt: string | null
  plan: PlanId | null
  canSell: boolean
}
