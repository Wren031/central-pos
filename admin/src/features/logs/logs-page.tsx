import * as React from 'react'
import { ChevronDown, History, RotateCw, Shield, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAsync, useDebounced } from '@/hooks/use-async'
import { errorMessage, sanitizeSearch } from '@/lib/errors'
import { formatDateTime, relativeFromNow } from '@/lib/format'
import { ENTITY_LABELS, LOG_ACTION_GROUPS } from '@/lib/constants'
import type { ActivityLog } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { SearchInput } from '@/components/common/search-input'
import { FilterSelect } from '@/components/common/filter-select'
import { Pagination } from '@/components/common/pagination'
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
} from '@/components/common/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const PAGE_SIZE = 25

const TONE: Record<string, string> = {
  'user.suspend': 'border-red-500/30 bg-red-500/10 text-red-300',
  'user.activate': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'user.status_changed': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'user.role_changed': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'admin.promote': 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  'subscription.extend': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  'subscription.change_plan': 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  'subscription.cancel': 'border-white/10 bg-white/5 text-muted-foreground',
  'subscription.create': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'payment.record': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'payment.recorded': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'payment.status_changed': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'store.status_changed': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'store.create': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'system.setup': 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  'system.seed': 'border-white/10 bg-white/5 text-muted-foreground',
}

export function LogsPage() {
  const [searchInput, setSearchInput] = React.useState('')
  const search = useDebounced(searchInput)
  const [actionFilter, setActionFilter] = React.useState('all')
  const [entityFilter, setEntityFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)

  // Reset to page 1 whenever search/filters change (adjust-during-render pattern).
  const [prevFilters, setPrevFilters] = React.useState({ search, actionFilter, entityFilter })
  if (
    prevFilters.search !== search ||
    prevFilters.actionFilter !== actionFilter ||
    prevFilters.entityFilter !== entityFilter
  ) {
    setPrevFilters({ search, actionFilter, entityFilter })
    setPage(1)
  }

  const logs = useAsync(async () => {
    let query = supabase
      .from('activity_logs')
      .select('*, actor:profiles(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (actionFilter !== 'all') query = query.eq('action', actionFilter)
    if (entityFilter !== 'all') query = query.eq('entity', entityFilter)
    if (search) {
      const term = sanitizeSearch(search)
      query = query.or(`summary.ilike.%${term}%,action.ilike.%${term}%`)
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(errorMessage(error))
    return { rows: (data ?? []) as ActivityLog[], total: count ?? 0 }
  }, [search, actionFilter, entityFilter, page])

  const rows = logs.data?.rows ?? []
  const total = logs.data?.total ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity Logs"
        description="Append-only audit trail of administrative actions."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={logs.reload}>
            <RotateCw className="size-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search summary or action…"
          className="w-full sm:max-w-xs"
        />
        <FilterSelect
          label="Action"
          value={actionFilter}
          onChange={setActionFilter}
          className="w-full sm:w-56"
          options={[
            { value: 'all', label: 'All actions' },
            ...LOG_ACTION_GROUPS.flatMap((g) =>
              g.actions.map((a) => ({ value: a, label: `${g.label}: ${a}` }))
            ),
          ]}
        />
        <FilterSelect
          label="Entity"
          value={entityFilter}
          onChange={setEntityFilter}
          className="w-full sm:w-44"
          options={[
            { value: 'all', label: 'All entities' },
            ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>

      <Card bodyClassName="p-0">
        {logs.loading ? (
          <LoadingRows rows={10} cols={3} />
        ) : logs.error ? (
          <div className="p-4">
            <ErrorState message={logs.error} onRetry={logs.reload} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={History}
              title="No log entries found"
              description="Actions like suspending users or extending subscriptions appear here."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((log) => (
              <li key={log.id} className="px-4 py-3 hover:bg-muted/40">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                      TONE[log.action] ?? 'border-white/10 bg-white/5 text-muted-foreground'
                    }`}
                  >
                    {log.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{log.summary}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {log.actor ? (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="size-3" />
                          {log.actor.full_name || log.actor.email}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Shield className="size-3" />
                          System
                        </span>
                      )}
                      <span>· {ENTITY_LABELS[log.entity] ?? log.entity}</span>
                      <span>· {relativeFromNow(log.created_at)}</span>
                      <span className="hidden sm:inline">({formatDateTime(log.created_at)})</span>
                    </p>
                  </div>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="View metadata"
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-80 max-w-md p-2">
                        <pre className="overflow-x-auto text-[11px] leading-relaxed">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  )
}
