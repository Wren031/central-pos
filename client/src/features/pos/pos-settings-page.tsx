import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  CalendarDays,
  CreditCard,
  Grid2X2,
  Pencil,
  ShoppingCart,
  Store,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { formatDate } from '@/lib/format'
import { getPosType } from '@/lib/pos-types'
import { planDisplayName } from '@/lib/plan-display'
import { useAuth } from '@/state/auth-context'
import { useSubscription } from '@/state/subscription-context'
import { DataSyncCard } from './data-sync-card'
import { PrinterCard } from './printer-card'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium">{value}</span>
    </div>
  )
}

export function PosSettingsPage() {
  const { user, store } = useAuth()
  const { sub, state } = useSubscription()

  if (!user) return null
  const posDef = store ? getPosType(store.posType) : null

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title="POS settings"
        description="Manage your store identity, workspace, and hardware"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/subscription">
                <CreditCard className="size-3.5" /> Manage subscription
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/profile">
                <Pencil className="size-3.5" /> Edit profile
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CreditCard}
          label="Subscription"
          value={planDisplayName(sub)}
          hint={state.canSell ? `${state.daysLeft} days remaining` : 'Access expired'}
        />
        <StatCard
          icon={CalendarDays}
          label="Access expires"
          value={state.expiresAt ? formatDate(state.expiresAt) : '—'}
        />
        <StatCard
          icon={ShoppingCart}
          label="Selling"
          value={state.canSell ? 'Enabled' : 'Locked'}
          hint={state.canSell ? 'Orders and checkout available' : 'Renew to resume selling'}
        />
        <StatCard
          icon={Grid2X2}
          label="POS type"
          value={posDef?.name ?? 'Not set'}
          hint={posDef?.tagline}
          accent={posDef?.theme.accent}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center gap-3 pb-4">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: posDef?.theme.accent ?? 'var(--primary)' }}
            >
              {posDef ? (
                <posDef.icon className="size-6" aria-hidden />
              ) : (
                <Store className="size-6" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-lg">
                {store?.name ?? user.businessName}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <BadgeCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                Verified store · {user.fullName}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border bg-muted/30 px-3">
              <DetailRow label="Owner" value={user.fullName} />
              <DetailRow label="Address" value={user.address} />
              <DetailRow label="Contact" value={user.contactNumber} />
              <DetailRow label="Email" value={user.email} />
            </div>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/profile">
                <User className="size-3.5" /> Edit in profile
              </Link>
            </Button>
          </CardContent>
        </Card>

        <PrinterCard />
      </div>

      <DataSyncCard />
    </div>
  )
}
