import * as React from 'react'
import { toast } from 'sonner'
import { useAuth } from './auth-context'
import {
  getGcashQrConfig,
  getNotifications,
  getPaymentRequests,
  getAllPlanRecords,
  getPlanRecords,
  getSubState,
  getSubscription,
  getTransactions,
  hydratePlanCatalog,
  markNotificationsRead,
  subscribeDb,
} from '@/lib/repos'
import {
  getPlanCatalogError,
  refreshPlanCatalog,
} from '@/services/plan-catalog-service'
import { refreshPaymentStatuses } from '@/services/subscription-payment-service'
import { subscribeOnline } from '@/offline/connectivity'
import type {
  AppNotification,
  GcashQrConfig,
  PaymentRequest,
  PlanRecord,
  SubState,
  Subscription,
  Transaction,
} from '@/lib/types'

interface SubscriptionValue {
  sub: Subscription | null
  state: SubState
  notifications: AppNotification[]
  unreadCount: number
  transactions: Transaction[]
  paymentRequests: PaymentRequest[]
  /** Active purchase plans from the admin-managed catalogue. */
  plans: PlanRecord[]
  /** ALL plans including the trial (used by the signup duration step). */
  allPlans: PlanRecord[]
  plansLoading: boolean
  plansError: string | null
  /** The ACTIVE GCash QR (url null when none/unset). */
  gcashQr: GcashQrConfig
  refresh: () => void
  /** Re-check payment status + catalogue against Supabase (online-only). */
  refreshRemote: () => Promise<void>
  markAllRead: () => Promise<void>
}

const SubscriptionContext = React.createContext<SubscriptionValue | null>(null)

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [sub, setSub] = React.useState<Subscription | null>(null)
  const [state, setState] = React.useState<SubState>({
    status: 'expired',
    daysLeft: 0,
    hoursLeft: 0,
    expiresAt: null,
    plan: null,
    canSell: false,
  })
  const [notifications, setNotifications] = React.useState<AppNotification[]>([])
  const [transactions, setTransactions] = React.useState<Transaction[]>([])
  const [paymentRequests, setPaymentRequests] = React.useState<PaymentRequest[]>([])
  const [plans, setPlans] = React.useState<PlanRecord[]>([])
  const [allPlans, setAllPlans] = React.useState<PlanRecord[]>([])
  const [gcashQr, setGcashQr] = React.useState<GcashQrConfig>({
    url: null,
    active: false,
    fetchedAt: null,
    error: null,
  })
  const [plansLoading, setPlansLoading] = React.useState(true)
  const [plansError, setPlansError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    setPlans(getPlanRecords())
    setAllPlans(getAllPlanRecords())
    setGcashQr(getGcashQrConfig())
    if (!user) {
      setSub(null)
      setState({
        status: 'expired',
        daysLeft: 0,
        hoursLeft: 0,
        expiresAt: null,
        plan: null,
        canSell: false,
      })
      setNotifications([])
      setTransactions([])
      setPaymentRequests([])
      return
    }
    const s = getSubscription(user.id)
    setSub(s)
    setState(getSubState(user.id))
    setNotifications(getNotifications(user.id))
    setTransactions(getTransactions(user.id))
    setPaymentRequests(getPaymentRequests(user.id))
  }, [user])

  const refreshRemote = React.useCallback(async () => {
    const ok = await refreshPlanCatalog()
    setPlansError(ok ? null : getPlanCatalogError())
    setPlansLoading(false)
    if (user) {
      // Mirror any admin decision (approve/reject) into local state.
      const result = await refreshPaymentStatuses(user.id, user.email)
      if (result.approved > 0) {
        toast.success('Payment approved — subscription activated.')
      }
    }
    refresh()
  }, [user, refresh])

  React.useEffect(() => {
    refresh()
    const off = subscribeDb(refresh)
    const onClock = () => refresh()
    window.addEventListener('cpos:clock-changed', onClock)

    // Hydrate the cached catalogue immediately, then refresh from the network.
    void (async () => {
      await hydratePlanCatalog()
      refresh()
      await refreshRemote()
    })()

    const offOnline = subscribeOnline(() => void refreshRemote())
    return () => {
      off()
      offOnline()
      window.removeEventListener('cpos:clock-changed', onClock)
    }
  }, [refresh, refreshRemote])

  const markAllRead = React.useCallback(async () => {
    if (!user) return
    await markNotificationsRead(user.id)
    refresh()
  }, [user, refresh])

  const unreadCount = notifications.filter((n) => !n.read).length

  const value = React.useMemo(
    () => ({
      sub,
      state,
      notifications,
      unreadCount,
      transactions,
      paymentRequests,
      plans,
      allPlans,
      plansLoading,
      plansError,
      gcashQr,
      refresh,
      refreshRemote,
      markAllRead,
    }),
    [
      sub,
      state,
      notifications,
      unreadCount,
      transactions,
      paymentRequests,
      plans,
      allPlans,
      plansLoading,
      plansError,
      gcashQr,
      refresh,
      refreshRemote,
      markAllRead,
    ]
  )

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscription(): SubscriptionValue {
  const ctx = React.useContext(SubscriptionContext)
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider')
  return ctx
}
