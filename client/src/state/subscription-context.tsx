import * as React from 'react'
import { useAuth } from './auth-context'
import {
  getNotifications,
  getSubState,
  getSubscription,
  getTransactions,
  markNotificationsRead,
  purchasePlan,
  subscribeDb,
} from '@/lib/repos'
import type { AppNotification, PlanId, SubState, Subscription, Transaction } from '@/lib/types'

interface SubscriptionValue {
  sub: Subscription | null
  state: SubState
  notifications: AppNotification[]
  unreadCount: number
  transactions: Transaction[]
  refresh: () => void
  purchase: (plan: Exclude<PlanId, 'trial'>) => Promise<Subscription>
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

  const refresh = React.useCallback(() => {
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
      return
    }
    const s = getSubscription(user.id)
    setSub(s)
    setState(getSubState(user.id))
    setNotifications(getNotifications(user.id))
    setTransactions(getTransactions(user.id))
  }, [user])

  React.useEffect(() => {
    refresh()
    const off = subscribeDb(refresh)
    const onClock = () => refresh()
    window.addEventListener('cpos:clock-changed', onClock)
    return () => {
      off()
      window.removeEventListener('cpos:clock-changed', onClock)
    }
  }, [refresh])

  const purchase = React.useCallback(
    async (plan: Exclude<PlanId, 'trial'>) => {
      if (!user) throw new Error('Not signed in.')
      const s = await purchasePlan(user.id, plan)
      refresh()
      return s
    },
    [user, refresh]
  )

  const markAllRead = React.useCallback(async () => {
    if (!user) return
    await markNotificationsRead(user.id)
    refresh()
  }, [user, refresh])

  const unreadCount = notifications.filter((n) => !n.read).length

  const value = React.useMemo(
    () => ({ sub, state, notifications, unreadCount, transactions, refresh, purchase, markAllRead }),
    [sub, state, notifications, unreadCount, transactions, refresh, purchase, markAllRead]
  )

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscription(): SubscriptionValue {
  const ctx = React.useContext(SubscriptionContext)
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider')
  return ctx
}
