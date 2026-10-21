/* Row types mirroring supabase/01_schema.sql. */

export type ProfileRole = 'admin' | 'customer'
export type ProfileStatus = 'active' | 'suspended'

export interface NotificationPrefs {
  expiration: boolean
  reminders: boolean
  marketing: boolean
}

export interface Profile {
  id: string
  email: string
  full_name: string
  business_name: string | null
  contact_number: string | null
  address: string | null
  role: ProfileRole
  status: ProfileStatus
  notification_prefs: NotificationPrefs
  created_at: string
  updated_at: string
}

export interface PosType {
  id: string
  name: string
  tagline: string | null
  description: string | null
  icon: string | null
  category: string | null
  active: boolean
  /** Admin-controlled: whether the client POS offers barcode scanning. */
  barcode_enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  slug: string
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PosTypeCategory {
  pos_type_id: string
  category_id: string
  sort_order: number
  created_at: string
  category?: Category | null
}

export interface SubscriptionPlan {
  id: string
  name: string
  description: string | null
  duration_days: number
  price: number
  currency: string
  is_trial: boolean
  active: boolean
  features: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export type StoreStatus = 'active' | 'suspended'

export interface Store {
  id: string
  owner_id: string
  name: string
  pos_type: string
  email: string | null
  phone: string | null
  address: string | null
  status: StoreStatus
  onboarded: boolean
  created_at: string
  updated_at: string
  owner?: Pick<Profile, 'id' | 'full_name' | 'email' | 'contact_number' | 'status'> | null
  posType?: Pick<PosType, 'id' | 'name' | 'icon'> | null
}

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled'

export interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: SubscriptionStatus
  started_at: string
  expires_at: string
  price_paid: number
  created_at: string
  updated_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name' | 'status'> | null
  plan?: Pick<SubscriptionPlan, 'id' | 'name' | 'duration_days' | 'price' | 'is_trial'> | null
}

/** GCash is the only payment method: manual QR transfers verified by an admin. */
export type PaymentMethod = 'gcash_qr'
export type PaymentStatus = 'succeeded' | 'pending' | 'failed' | 'refunded'

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected'

/**
 * A manually-submitted GCash QR payment awaiting admin verification.
 * Submitting proof NEVER activates a subscription — only
 * admin_approve_payment_request() does (see supabase/07_payment_requests.sql).
 */
export interface PaymentRequest {
  id: string
  user_id: string | null
  client_user_id: string | null
  submitter_name: string | null
  submitter_email: string | null
  business_name: string | null
  plan_id: string | null
  amount: number
  currency: string
  method: PaymentMethod
  reference_no: string
  notes: string | null
  proof_path: string | null
  proof_url: string | null
  status: PaymentRequestStatus
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'email' | 'business_name'> | null
  plan?: Pick<SubscriptionPlan, 'id' | 'name' | 'duration_days' | 'price'> | null
}

export interface Payment {
  id: string
  user_id: string
  subscription_id: string | null
  plan_id: string | null
  /** The verified GCash request this ledger row came from (holds the receipt). */
  payment_request_id: string | null
  reference: string
  method: PaymentMethod
  amount: number
  currency: string
  status: PaymentStatus
  paid_at: string
  notes: string | null
  created_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  plan?: Pick<SubscriptionPlan, 'id' | 'name'> | null
  payment_request?: Pick<
    PaymentRequest,
    'id' | 'reference_no' | 'proof_path' | 'proof_url' | 'notes' | 'created_at'
  > | null
}

export interface ActivityLog {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  summary: string
  metadata: Record<string, unknown>
  created_at: string
  actor?: Pick<Profile, 'full_name' | 'email'> | null
}

export interface SystemSetting {
  key: string
  value: unknown
  description: string | null
  updated_by: string | null
  updated_at: string
}

export type ReleasePlatform = 'android' | 'windows'
export type ReleaseStatus = 'draft' | 'published'

export interface PosRelease {
  id: string
  platform: ReleasePlatform
  version: string
  /** External http(s) URL of the installer — the only download source. */
  download_url: string
  file_size_bytes: number | null
  release_notes: string | null
  status: ReleaseStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PosSale {
  id: string
  idempotency_key: string
  store_id: string
  user_id: string
  receipt_no: string
  total: number
  sold_at: string
  payload: Record<string, unknown>
  synced_at: string
  created_at: string
}

/* ---------- admin_dashboard_stats() ---------- */

export interface DashboardTotals {
  customers: number
  admins: number
  suspended_users: number
  stores: number
  active_subscriptions: number
  trials: number
  expiring_soon: number
  expired: number
  revenue: number
  revenue_30d: number
  payments: number
  sales_synced: number
}

export interface MonthPoint {
  month: string
  revenue: number
}

export interface SignupPoint {
  month: string
  count: number
}

export interface PlanStat {
  plan_id: string
  name: string
  sort_order: number
  subscribers: number
  revenue: number
}

export interface StatusStat {
  status: SubscriptionStatus
  count: number
}

export interface ExpiringSoonItem {
  user_id: string
  full_name: string
  email: string
  plan_id: string
  expires_at: string
  days_left: number
}

export interface DashboardStats {
  totals: DashboardTotals
  revenue_by_month: MonthPoint[]
  signups_by_month: SignupPoint[]
  plans: PlanStat[]
  statuses: StatusStat[]
  expiring_soon_list: ExpiringSoonItem[]
}

/* ---------- verify_subscription() ---------- */

export interface SubscriptionVerification {
  user_id: string
  has_subscription: boolean
  subscription_id?: string
  status: 'none' | 'trial' | 'active' | 'expired'
  plan_id: string | null
  started_at?: string
  expires_at: string | null
  days_left: number
  can_sell: boolean
}
