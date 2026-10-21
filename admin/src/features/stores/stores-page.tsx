import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Phone, Power, PowerOff, RotateCw, Store as StoreIcon } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { formatDate, initials } from '@/lib/format'
import { posTypeIcon } from '@/lib/constants'
import type { PosType, Store } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { SearchInput } from '@/components/common/search-input'
import { FilterSelect } from '@/components/common/filter-select'
import { Pagination } from '@/components/common/pagination'
import { ConfirmModal } from '@/components/common/states'
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  TableWrap,
} from '@/components/common/states'
import { PosTypeBadge } from '@/components/common/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type StoreRow = Store & {
  posType: Pick<PosType, 'id' | 'name' | 'icon'> | null
}

const PAGE_SIZE = 20

export function StoresPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = React.useState('')
  const search = useDebounced(searchInput)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [posTypeFilter, setPosTypeFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [confirmTarget, setConfirmTarget] = React.useState<StoreRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Reset to page 1 whenever search/filters change (adjust-during-render pattern).
  const [prevFilters, setPrevFilters] = React.useState({ search, statusFilter, posTypeFilter })
  if (
    prevFilters.search !== search ||
    prevFilters.statusFilter !== statusFilter ||
    prevFilters.posTypeFilter !== posTypeFilter
  ) {
    setPrevFilters({ search, statusFilter, posTypeFilter })
    setPage(1)
  }

  const stores = useAsync(async () => {
    let query = supabase
      .from('stores')
      .select('*, owner:profiles(id, full_name, email, contact_number, status), posType:pos_types(id, name, icon)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (posTypeFilter !== 'all') query = query.eq('pos_type', posTypeFilter)
    if (search) {
      const term = sanitizeSearch(search)
      query = query.or(
        `name.ilike.%${term}%,email.ilike.%${term}%,address.ilike.%${term}%`
      )
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(errorMessage(error))
    return { rows: (data ?? []) as StoreRow[], total: count ?? 0 }
  }, [search, statusFilter, posTypeFilter, page])

  const posTypes = useAsync(async () => {
    const { data, error } = await supabase.from('pos_types').select('*').order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as PosType[]
  }, [])

  async function toggleStatus(store: StoreRow) {
    const next = store.status === 'active' ? 'suspended' : 'active'
    setBusy(true)
    try {
      const { error } = await supabase
        .from('stores')
        .update({ status: next })
        .eq('id', store.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`Store "${store.name}" is now ${next}.`)
      setConfirmTarget(null)
      stores.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const rows = stores.data?.rows ?? []
  const total = stores.data?.total ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stores"
        description="Registered stores, their owners, POS types, and account status."
        actions={
          <Button variant="outline" size="sm" onClick={stores.reload}>
            <RotateCw className="size-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search store, email, or address…"
          className="w-full sm:w-64"
        />
        <FilterSelect
          label="POS type"
          value={posTypeFilter}
          onChange={setPosTypeFilter}
          className="w-full sm:w-44"
          options={[
            { value: 'all', label: 'All POS types' },
            ...(posTypes.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-full sm:w-40"
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </div>

      <Card bodyClassName="p-0">
        {stores.loading ? (
          <LoadingRows rows={8} cols={6} />
        ) : stores.error ? (
          <div className="p-4">
            <ErrorState message={stores.error} onRetry={stores.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={StoreIcon}
              title="No stores found"
              description="Stores appear here after owners complete onboarding in the POS app."
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="hidden sm:table-cell">POS type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((store) => {
                  const Icon = posTypeIcon(store.posType?.icon ?? store.pos_type)
                  return (
                    <TableRow key={store.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                            <Icon className="size-4" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{store.name}</p>
                            {store.address && (
                              <p className="truncate text-xs text-muted-foreground">{store.address}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarFallback className="bg-accent/10 text-[10px] font-semibold text-accent">
                              {initials(store.owner?.full_name, 'O')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm">{store.owner?.full_name ?? '—'}</p>
                            <p className="truncate text-xs text-muted-foreground">{store.owner?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        <p className="flex items-center gap-1">
                          <Phone className="size-3 text-muted-foreground" />
                          {store.phone ?? store.owner?.contact_number ?? '—'}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                          <MapPin className="size-3" />
                          {store.address ?? '—'}
                        </p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PosTypeBadge name={store.posType?.name ?? store.pos_type} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                            store.status === 'active'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-red-500/30 bg-red-500/10 text-red-300'
                          }`}
                        >
                          {store.status}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {formatDate(store.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/stores/${store.id}`)}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={
                              store.status === 'active'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200'
                            }
                            onClick={() => setConfirmTarget(store)}
                          >
                            {store.status === 'active' ? (
                              <>
                                <PowerOff className="size-3" />
                                Suspend
                              </>
                            ) : (
                              <>
                                <Power className="size-3" />
                                Activate
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

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

