import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Mail,
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
import { formatDate, initials } from '@/lib/format'
import { posTypeIcon } from '@/lib/constants'
import type { PosType, Profile, Store } from '@/lib/types'
import { Breadcrumb, DetailEmpty, DetailField, DetailSection, MonoId } from '@/components/common/detail'
import { ConfirmModal, EmptyState, ErrorState } from '@/components/common/states'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type StoreDetailRow = Store & {
  owner: Pick<Profile, 'id' | 'full_name' | 'email' | 'contact_number' | 'status'> | null
  posType: Pick<PosType, 'id' | 'name' | 'icon'> | null
}

function StoreDetailSkeleton() {
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
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )
}

export function StoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>()
  const [confirmTarget, setConfirmTarget] = React.useState<StoreDetailRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  const store = useAsync(async () => {
    if (!storeId) throw new Error('Missing store id.')
    const { data, error } = await supabase
      .from('stores')
      .select(
        '*, owner:profiles(id, full_name, email, contact_number, status), posType:pos_types(id, name, icon)'
      )
      .eq('id', storeId)
      .maybeSingle()
    if (error) throw new Error(errorMessage(error))
    return (data as unknown as StoreDetailRow | null) ?? null
  }, [storeId])

  async function toggleStatus(target: StoreDetailRow) {
    const next = target.status === 'active' ? 'suspended' : 'active'
    setBusy(true)
    try {
      const { error } = await supabase.from('stores').update({ status: next }).eq('id', target.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`Store "${target.name}" is now ${next}.`)
      setConfirmTarget(null)
      store.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (store.loading) return <StoreDetailSkeleton />

  if (store.error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link to="/stores">
            <ArrowLeft className="size-4" />
            Back to stores
          </Link>
        </Button>
        <ErrorState message={store.error} onRetry={store.reload} />
      </div>
    )
  }

  const detail = store.data
  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link to="/stores">
            <ArrowLeft className="size-4" />
            Back to stores
          </Link>
        </Button>
        <EmptyState
          icon={StoreIcon}
          title="Store not found"
          description="This store may have been removed."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/stores">Back to stores</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const headerIcon = React.createElement(posTypeIcon(detail.posType?.icon ?? detail.pos_type), {
    className: 'size-7',
    'aria-hidden': true,
  })
  const phone = detail.phone ?? detail.owner?.contact_number

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <Breadcrumb parent="Stores" parentTo="/stores" current={detail.name} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 text-secondary ring-4 ring-secondary/10">
              {headerIcon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {detail.name}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                    detail.status === 'active'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {detail.status}
                </span>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {detail.posType?.name ?? detail.pos_type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={store.reload}>
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

      {/* Store profile */}
      <DetailSection
        icon={StoreIcon}
        title="Store profile"
        description="Contact and location details."
        tone="neutral"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Store name" value={detail.name} />
          <DetailField
            label="Store email"
            value={
              detail.email ? (
                <a
                  href={`mailto:${detail.email}`}
                  className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                >
                  <Mail className="size-3.5" aria-hidden />
                  {detail.email}
                </a>
              ) : (
                ''
              )
            }
          />
          <DetailField
            label="Phone"
            value={
              phone ? (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {phone}
                </a>
              ) : (
                ''
              )
            }
          />
          <DetailField label="POS type" value={detail.posType?.name ?? detail.pos_type} />
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
          <DetailField label="Created" value={formatDate(detail.created_at)} />
          <DetailField
            label="Onboarded"
            value={detail.onboarded ? 'Yes' : 'No'}
          />
          <DetailField
            label="Store ID"
            value={<MonoId value={detail.id} label="Store ID" />}
            className="sm:col-span-2"
          />
        </div>
      </DetailSection>

      {/* Owner */}
      <DetailSection
        icon={UserRound}
        title="Owner"
        description="Account that registered this store."
        tone="neutral"
        actions={
          detail.owner && (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/users/${detail.owner.id}`}>
                View account
                <ArrowLeft className="size-3.5 rotate-180" aria-hidden />
              </Link>
            </Button>
          )
        }
      >
        {detail.owner ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">
                  {initials(detail.owner.full_name, 'O')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {detail.owner.full_name || '—'}
                </p>
                <p className="truncate text-xs text-muted-foreground">{detail.owner.email}</p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                  detail.owner.status === 'active'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {detail.owner.status}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DetailField label="Contact number" value={detail.owner.contact_number} />
              <DetailField
                label="Owner ID"
                value={<MonoId value={detail.owner.id} label="Owner ID" />}
              />
            </div>
          </>
        ) : (
          <DetailEmpty>No owner record linked to this store.</DetailEmpty>
        )}
      </DetailSection>

      <ConfirmModal
        open={confirmTarget !== null}
        title={confirmTarget?.status === 'active' ? 'Suspend store?' : 'Activate store?'}
        danger={confirmTarget?.status === 'active'}
        busy={busy}
        confirmLabel={confirmTarget?.status === 'active' ? 'Suspend' : 'Activate'}
        message={
          confirmTarget?.status === 'active' ? (
            <>
              Suspend <strong>{confirmTarget?.name}</strong>? Its POS devices will lose access until
              reactivated.
            </>
          ) : (
            <>
              Restore access for <strong>{confirmTarget?.name}</strong>?
            </>
          )
        }
        onConfirm={() => confirmTarget && void toggleStatus(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  )
}
