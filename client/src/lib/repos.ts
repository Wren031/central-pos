/**
 * Compatibility facade — existing features import from '@/lib/repos'.
 * The implementation lives in src/database (Dexie/IndexedDB) and
 * src/offline (sync). Re-exports keep every call site working.
 */
export { subscribeDb, getCache } from '@/database/cache'

export {
  registerUser,
  createLocalAccountFromCloud,
  login,
  logout,
  getSession,
  getCurrentUser,
  isEmailRegistered,
  markUserAccountStatus,
  stagePendingRegistration,
  getPendingRegistration,
  clearPendingRegistration,
  finalizePendingRegistration,
  updateProfile,
  changePassword,
  deleteAccount,
  getStoreByUser,
  setupStore,
  changePosType,
  restoreStoreFromCloud,
  hasLocalStore,
} from '@/database/repos/auth'

export {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getProductMovements,
  findProductByBarcode,
} from '@/database/repos/products'

export {
  getOrders,
  createOrder,
  setOrderPaymentStatus,
  InsufficientStockError,
} from '@/database/repos/orders'

export {
  getSubscription,
  computeSubState,
  getSubState,
  activatePlanFromServer,
  setInitialSubscription,
  getTransactions,
} from '@/database/repos/subscription'

export {
  getPaymentRequests,
  getPendingPaymentRequest,
  persistPaymentRequest,
  reconcileServerRequest,
  addNotification,
} from '@/database/repos/payment-requests'

export {
  getPlanRecords,
  getAllPlanRecords,
  getPlanRecord,
  isPlanCatalogEmpty,
  getGcashQrConfig,
  hydratePlanCatalog,
} from '@/database/repos/plan-catalog'

export {
  getNotifications,
  markNotificationsRead,
  syncSubscriptionNotifications,
} from '@/database/repos/notifications'

export { getCustomers, addCustomer, updateCustomer, deleteCustomer } from '@/database/repos/customers'
export { getCategories, addCategory } from '@/database/repos/categories'
export { printerService } from '@/database/repos/printer'
export type { PrinterState } from '@/database/repos/printer'
export { scannerService } from '@/database/repos/scanner'
export type { ScannerState } from '@/database/repos/scanner'

/**
 * Legacy no-op kept for import compatibility.
 * Database initialization (open → migrate → seed → hydrate) now happens
 * once at boot via DbReadyProvider / DatabaseGate.
 */
export async function ensureSeed(): Promise<void> {}
