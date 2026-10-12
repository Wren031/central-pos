import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CreditCard,
  MapPin,
  Phone,
  Power,
  PowerOff,
  RotateCw,
  Store as StoreIcon,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { daysUntil, formatDate, formatDateTime, initials } from '@/lib/format'
import type { Profile, Subscription } from '@/lib/types'
import { Breadcrumb, DetailEmpty, DetailField, DetailSection, MonoId } from '@/components/common/detail'
import { ConfirmModal, EmptyState, ErrorState } from '@/components/common/states'
import { PlanBadge, ProfileStatusBadge } from '@/components/common/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type UserDetailRow = Profile & {
  store: { id: string; name: string; pos_type: string; status: string }[] | null
  subscription: Pick<Subscription, 'plan_id' | 'status' | 'expires_at'> | null
}

function UserDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-36" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-44 rounded-2xl" />
    </div>
  )
}

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const [confirmTarget, setConfirmTarget] = React.useState<UserDetailRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  const user = useAsync(async () => {
    if (!userId) throw new Error('Missing user id.')
    const { data, error } = await supabase
      .from('profiles')
      .select(
        `*,
         store:stores(id, name, pos_type, status),
         subscription:subscriptions(plan_id, status, expires_at)`
      )
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error(errorMessage(error))
    return (data as unknown as UserDetailRow | null) ?? null
  }, [userId])

  async function toggleStatus(target: UserDetailRow) {
    const next = target.status === 'active' ? 'suspended' : 'active'
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        target_user: target.id,
        new_status: next,
      })
      if (error) throw new Error(errorMessage(error))
      toast.success(`Account "${target.full_name || target.email}" is now ${next}.`)
      setConfirmTarget(null)
      user.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (user.loading) return <UserDetailSkeleton />

  if (user.error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link to="/users">
            <ArrowLeft className="size-4" />
            Back to users
          </Link>
        </Button>
        <ErrorState message={user.error} onRetry={user.reload} />
      </div>
    )
  }

  const detail = user.data
  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link to="/users">
            <ArrowLeft className="size-4" />
            Back to users
          </Link>
        </Button>
        <EmptyState
          icon={UserRound}
          title="User not found"
          description="This account may have been removed."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/users">Back to users</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const store = detail.store?.[0] ?? null
  const sub =
    Array.isArray(detail.subscription) ? (detail.subscription[0] ?? null) : detail.subscription
  const days = sub?.expires_at ? daysUntil(sub.expires_at) : null

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <Breadcrumb parent="Users" parentTo="/users" current={detail.full_name || detail.email} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-14 rounded-2xl ring-4 ring-primary/10">
              <AvatarFallback className="rounded-2xl bg-primary/10 text-base font-semibold text-primary">
                {initials(detail.full_name, 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {detail.full_name || 'Unnamed account'}
                </h1>
                <ProfileStatusBadge status={detail.status} />
              </div>
              <p className="truncate text-sm text-muted-foreground">{detail.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={user.reload}>
              <RotateCw className="size-3.5" />
              Refresh
            </Button>
            <Button
              variant={detail.status === 'active' ? 'destructive' : 'default'}
              size="sm"
              onClick={() => setConfirmTarget(detail)}
            >
              {detail.status === 'active' ? (
                <>
                  <PowerOff className="size-3.5" />
                  Suspend
                </>
              ) : (
                <>
                  <Power className="size-3.5" />
                  Activate
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Account */}
      <DetailSection
        icon={UserRound}
        title="Account"
        description="Personal and business information on file."
        tone="neutral"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Business name" value={detail.business_name} />
          <DetailField
            label="Contact number"
            value={
              detail.contact_number ? (
                <a
                  href={`tel:${detail.contact_number}`}
                  className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {detail.contact_number}
                </a>
              ) : (
                ''
              )
            }
          />
          <DetailField
            label="Address"
            value={
              detail.address ? (
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {detail.address}
                </span>
              ) : (
                ''
              )
            }
            className="sm:col-span-2"
          />
          <DetailField
            label="Joined"
            value={`${formatDate(detail.created_at)} · ${formatDateTime(detail.created_at)}`}
            className="sm:col-span-2"
          />
          <DetailField label="Role" value={<span className="capitalize">{detail.role}</span>} />
          <DetailField label="User ID" value={<MonoId value={detail.id} label="User ID" />} />
        </div>
      </DetailSection>

      {/* Store */}
      <DetailSection
        icon={StoreIcon}
        title="Store"
        description="POS store registered to this account."
        tone="neutral"
        actions={
          store && (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/stores/${store.id}`}>
                View store
                <ArrowLeft className="size-3.5 rotate-180" aria-hidden />
              </Link>
            </Button>
          )
        }
      >
        {store ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Store name" value={store.name} />
            <DetailField label="POS type" value={store.pos_type} />
            <DetailField
              label="Store status"
              value={<span className="capitalize">{store.status}</span>}
            />
            <DetailField label="Store ID" value={<MonoId value={store.id} label="Store ID" />} />
          </div>
        ) : (
          <DetailEmpty>
            No store registered yet. Stores appear after owners complete onboarding in the POS app.
          </DetailEmpty>
        )}
      </DetailSection>

      {/* Subscription */}
      <DetailSection
        icon={CreditCard}
        title="Subscription"
        description="Current plan and billing period."
        tone="neutral"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/subscriptions">Manage</Link>
          </Button>
        }
      >
        {sub ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Plan" value={<PlanBadge planId={sub.plan_id} />} />
            <DetailField
              label="Status"
              value={<span className="capitalize">{sub.status}</span>}
            />
            <DetailField label="Expires" value={formatDate(sub.expires_at)} />
            <DetailField
              label="Days left"
              value={
                days === null ? '—' : days < 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'}`
              }
            />
          </div>
        ) : (
          <DetailEmpty>
            No subscription on record. Assign a plan from the Subscriptions page.
          </DetailEmpty>
        )}
      </DetailSection>

      <ConfirmModal
        open={confirmTarget !== null}
        title={confirmTarget?.status === 'active' ? 'Suspend account?' : 'Activate account?'}
        danger={confirmTarget?.status === 'active'}
        busy={busy}
        confirmLabel={confirmTarget?.status === 'active' ? 'Suspend' : 'Activate'}
        message={
          confirmTarget?.status === 'active' ? (
            <>
              Suspend <strong>{confirmTarget?.full_name || confirmTarget?.email}</strong>? The POS
              app will lose access until reactivated.
            </>
          ) : (
            <>
              Restore access for <strong>{confirmTarget?.full_name || confirmTarget?.email}</strong>?
            </>
          )
        }
        onConfirm={() => confirmTarget && void toggleStatus(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  )
}
