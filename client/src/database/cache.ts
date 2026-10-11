import type {
  AppNotification,
  Category,
  Customer,
  Order,
  Product,
  Session,
  StockMovement,
  Store,
  Subscription,
  Transaction,
  User,
} from '@/lib/types'

/**
 * In-memory read model hydrated from IndexedDB at boot and after auth changes.
 * Synchronous repo getters read from here; writes persist to Dexie first,
 * then update this cache and emit `cpos:data-changed`.
 */
export interface CacheState {
  users: User[]
  session: Session | null
  stores: Store[]
  categories: Category[]
  customers: Customer[]
  products: Product[]
  orders: Order[]
  transactions: Transaction[]
  subscriptions: Subscription[]
  notifications: AppNotification[]
  stockMovements: StockMovement[]
}

export const EMPTY_CACHE: CacheState = {
  users: [],
  session: null,
  stores: [],
  categories: [],
  customers: [],
  products: [],
  orders: [],
  transactions: [],
  subscriptions: [],
  notifications: [],
  stockMovements: [],
}

let cache: CacheState = structuredClone(EMPTY_CACHE)

const listeners = new Set<() => void>()

export function getCache(): CacheState {
  return cache
}

export function replaceCache(next: CacheState): void {
  cache = next
  emit()
}

export function resetCache(): void {
  cache = structuredClone(EMPTY_CACHE)
  emit()
}

export function patchCache(patch: Partial<CacheState>): void {
  cache = { ...cache, ...patch }
  emit()
}

export function emit(): void {
  listeners.forEach((fn) => fn())
  window.dispatchEvent(new CustomEvent('cpos:data-changed'))
}

export function subscribeDb(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
