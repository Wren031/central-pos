import Dexie, { type EntityTable } from 'dexie'
import type {
  AppNotification,
  Category,
  Customer,
  Order,
  OrderItemRecord,
  PaymentRequest,
  PendingRegistration,
  PlanRecord,
  PosConfigRecord,
  PosTypeId,
  PosTypeRecord,
  PosCategoryRecord,
  PrinterSettings,
  Product,
  SessionRow,
  StockMovement,
  Store,
  Subscription,
  SyncMetaRow,
  SyncOperation,
  Transaction,
  User,
} from '@/lib/types'

export class CposDatabase extends Dexie {
  users!: EntityTable<User, 'id'>
  sessions!: EntityTable<SessionRow, 'id'>
  stores!: EntityTable<Store, 'id'>
  posConfigs!: EntityTable<PosConfigRecord, 'id'>
  posCatalog!: EntityTable<PosTypeRecord, 'id'>
  posCatalogCategories!: EntityTable<PosCategoryRecord, 'id'>
  planCatalog!: EntityTable<PlanRecord, 'id'>
  categories!: EntityTable<Category, 'id'>
  products!: EntityTable<Product, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  customers!: EntityTable<Customer, 'id'>
  orders!: EntityTable<Order, 'id'>
  orderItems!: EntityTable<OrderItemRecord, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  subscriptions!: EntityTable<Subscription, 'id'>
  notifications!: EntityTable<AppNotification, 'id'>
  paymentRequests!: EntityTable<PaymentRequest, 'id'>
  pendingRegistrations!: EntityTable<PendingRegistration, 'email'>
  syncQueue!: EntityTable<SyncOperation, 'id'>
  syncMeta!: EntityTable<SyncMetaRow, 'key'>
  printerSettings!: EntityTable<PrinterSettings, 'storeId'>

  constructor() {
    super('central-pos')
    this.version(1).stores({
      users: 'id, email, createdAt',
      sessions: 'id, userId',
      stores: 'id, userId, name, createdAt',
      posConfigs: 'id',
      categories: 'id, storeId, [storeId+name]',
      products: 'id, storeId, sku, category, [storeId+category], active, createdAt',
      stockMovements: 'id, storeId, productId, [storeId+productId], type, createdAt',
      customers: 'id, storeId, name, createdAt',
      orders: 'id, storeId, userId, receiptNo, paymentStatus, customerId, createdAt',
      orderItems: 'id, orderId, storeId, productId',
      transactions: 'id, userId, type, reference, createdAt',
      subscriptions: 'id, userId, active',
      notifications: 'id, userId, kind, read, createdAt',
      syncQueue: 'id, idempotencyKey, entity, entityId, storeId, status, createdAt',
      syncMeta: 'key',
      printerSettings: 'storeId',
    })
    this.version(2).stores({
      paymentRequests: 'id, userId, status, createdAt',
    })
    this.version(3).stores({
      pendingRegistrations: 'email',
    })
    this.version(4).stores({
      posCatalog: 'id, active, sortOrder',
      posCatalogCategories: 'id, posTypeId, categoryId',
    })
    this.version(5).stores({
      planCatalog: 'id, active, sortOrder',
    })
  }
}

export const db = new CposDatabase()

export type PosConfigId = PosTypeId
