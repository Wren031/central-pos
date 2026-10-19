import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Power, PowerOff, RotateCw, Store as StoreIcon, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { formatDate, initials, daysUntil } from '@/lib/format'
import type { PosType, Profile, Subscription } from '@/lib/types'
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
import { PlanBadge, PosTypeBadge, ProfileStatusBadge } from '@/components/common/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type UserRow = Profile & {
  store: { id: string; name: string; pos_type: string; status: string }[] | null
  subscription: Pick<Subscription, 'plan_id' | 'status' | 'expires_at'> | null
}

const PAGE_SIZE = 20

export function UsersPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = React.useState('')
  const search = useDebounced(searchInput)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [confirmTarget, setConfirmTarget] = React.useState<UserRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  const users = useAsync(async () => {
    let query = supabase
      .from('profiles')
      .select(
        `*,
         store:stores(id, name, pos_type, status),
         subscription:subscriptions(plan_id, status, expires_at)`,
        { count: 'exact' }
      )
      .eq('role', 'customer')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (search) {
      const term = sanitizeSearch(search)
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,business_name.ilike.%${term}%`)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(errorMessage(error))
    return { rows: (data ?? []) as unknown as UserRow[], total: count ?? 0 }
  }, [search, statusFilter, page])

  const posTypes = useAsync(async () => {
    const { data, error } = await supabase.from('pos_types').select('id, name').order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as Pick<PosType, 'id' | 'name'>[]
  }, [])

  // Reset to page 1 whenever search/filters change (adjust-during-render pattern).
  const [prevFilters, setPrevFilters] = React.useState({ search, statusFilter })
  if (prevFilters.search !== search || prevFilters.statusFilter !== statusFilter) {
    setPrevFilters({ search, statusFilter })
    setPage(1)
  }

  async function toggleStatus(user: UserRow) {
    const next = user.status === 'active' ? 'suspended' : 'active'
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        target_user: user.id,
        new_status: next,
        reason: next === 'suspended' ? 'Suspended from admin dashboard' : 'Reactivated from admin dashboard',
      })
      if (error) throw new Error(errorMessage(error))
      toast.success(
        next === 'suspended'
          ? `${user.full_name || user.email} suspended — their stores are suspended too.`
          : `${user.full_name || user.email} reactivated.`
      )
      setConfirmTarget(null)
      users.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const rows = users.data?.rows ?? []
  const total = users.data?.total ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Registered customer accounts and their subscription state."
        actions={
          <Button variant="outline" size="sm" onClick={users.reload}>
            <RotateCw className="size-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search name, email, or business…"
          className="w-full sm:w-64"
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
        {users.loading ? (
          <LoadingRows rows={8} cols={6} />
        ) : users.error ? (
          <div className="p-4">
            <ErrorState message={users.error} onRetry={users.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={UserRound}
              title="No users found"
              description={
                search || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Customer accounts appear here once they register in the POS app.'
              }
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell">Store</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => {
                  const store = user.store?.[0] ?? null
                  const sub = Array.isArray(user.subscription)
                    ? (user.subscription[0] ?? null)
                    : user.subscription
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {initials(user.full_name, 'U')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{user.full_name || '—'}</p>
                            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {store ? (
                          <div>
                            <p className="truncate text-sm">{store.name}</p>
                            <PosTypeBadge name={posTypes.data?.find((p) => p.id === store.pos_type)?.name ?? store.pos_type} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No store yet</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {sub ? (
                          <div>
                            <PlanBadge planId={sub.plan_id} />
                            {sub.expires_at && daysUntil(sub.expires_at) >= 0 && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {daysUntil(sub.expires_at)}d left
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ProfileStatusBadge status={user.status} />
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/users/${user.id}`)}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={
                              user.status === 'active'
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800'
                            }
                            onClick={() => setConfirmTarget(user)}
                          >
                            {user.status === 'active' ? (
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7" aria-label="More">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/users/${user.id}`)}>
                                Account details
                              </DropdownMenuItem>
                              {store && (
                                <DropdownMenuItem onClick={() => navigate(`/users/${user.id}`)}>
                                  <StoreIcon className="size-3.5" />
                                  Store info
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />

      <ConfirmModal
        open={confirmTarget !== null}
        title={confirmTarget?.status === 'active' ? 'Suspend user?' : 'Activate user?'}
        danger={confirmTarget?.status === 'active'}
        busy={busy}
        confirmLabel={confirmTarget?.status === 'active' ? 'Suspend' : 'Activate'}
        message={
          confirmTarget?.status === 'active' ? (
            <>
              <strong>{confirmTarget?.full_name || confirmTarget?.email}</strong> and their store(s)
              will be suspended immediately. They will not be able to sign in to the POS.
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

