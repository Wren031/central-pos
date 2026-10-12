import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import type { Category, PosType, PosTypeCategory } from '@/lib/types'
import { ConfirmModal, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

interface PendingDelete {
  category: Category
  mode: 'unlink' | 'purge'
}

export function PosTypeCategoriesPage() {
  const { posTypeId } = useParams<{ posTypeId: string }>()
  const navigate = useNavigate()

  const [busy, setBusy] = React.useState(false)
  const [renaming, setRenaming] = React.useState<{ id: string; value: string } | null>(null)
  const [pending, setPending] = React.useState<PendingDelete | null>(null)
  const [newName, setNewName] = React.useState('')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const posType = useAsync(async () => {
    if (!posTypeId) return null
    const { data, error } = await supabase
      .from('pos_types')
      .select('*')
      .eq('id', posTypeId)
      .maybeSingle()
    if (error) throw new Error(errorMessage(error))
    return data as PosType | null
  }, [posTypeId])

  const assigned = useAsync(async () => {
    if (!posTypeId) return []
    const { data, error } = await supabase
      .from('pos_type_categories')
      .select('*, category:categories(*)')
      .eq('pos_type_id', posTypeId)
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as PosTypeCategory[]
  }, [posTypeId])

  const catalog = useAsync(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order')
      .order('name')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as Category[]
  }, [])

  const assignedIds = React.useMemo(
    () => new Set((assigned.data ?? []).map((a) => a.category_id)),
    [assigned.data],
  )
  const unassigned = React.useMemo(
    () => (catalog.data ?? []).filter((c) => !assignedIds.has(c.id)),
    [catalog.data, assignedIds],
  )

  async function run(fn: () => Promise<void>, successMsg?: string) {
    setBusy(true)
    try {
      await fn()
      if (successMsg) toast.success(successMsg)
      assigned.reload()
      catalog.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function addNewCategory() {
    const name = newName.trim()
    if (!name || !posTypeId) return
    await run(async () => {
      const base = slugify(name) || 'category'
      const { data: existing } = await supabase
        .from('categories')
        .select('slug')
        .like('slug', `${base}%`)
      const taken = new Set((existing ?? []).map((r) => r.slug))
      let slug = base
      let i = 2
      while (taken.has(slug)) slug = `${base}_${i++}`

      const { data: cat, error } = await supabase
        .from('categories')
        .insert({ name, slug, sort_order: (catalog.data?.length ?? 0) + 1 })
        .select()
        .single()
      if (error) throw new Error(errorMessage(error))

      const created = cat as Category
      const nextOrder = (assigned.data?.length ?? 0) + 1
      const { error: linkErr } = await supabase
        .from('pos_type_categories')
        .insert({ pos_type_id: posTypeId, category_id: created.id, sort_order: nextOrder })
      if (linkErr) throw new Error(errorMessage(linkErr))
      setNewName('')
    }, `Category "${name}" added.`)
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assignSelected() {
    if (!posTypeId || selected.size === 0) return
    const ids = [...selected]
    await run(async () => {
      let order = (assigned.data?.length ?? 0) + 1
      const rows = ids.map((categoryId) => ({
        pos_type_id: posTypeId,
        category_id: categoryId,
        sort_order: order++,
      }))
      const { error } = await supabase.from('pos_type_categories').upsert(rows, {
        onConflict: 'pos_type_id,category_id',
        ignoreDuplicates: true,
      })
      if (error) throw new Error(errorMessage(error))
      setSelected(new Set())
    }, `${ids.length} categor${ids.length === 1 ? 'y' : 'ies'} assigned.`)
  }

  async function saveRename(id: string) {
    if (!renaming) return
    const name = renaming.value.trim()
    if (!name) return
    await run(async () => {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id)
      if (error) throw new Error(errorMessage(error))
      setRenaming(null)
    }, 'Category renamed.')
  }

  async function toggleActive(cat: Category, active: boolean) {
    await run(async () => {
      const { error } = await supabase.from('categories').update({ active }).eq('id', cat.id)
      if (error) throw new Error(errorMessage(error))
    }, `${cat.name} ${active ? 'activated' : 'deactivated'}.`)
  }

  async function move(row: PosTypeCategory, direction: -1 | 1) {
    const rows = assigned.data ?? []
    const idx = rows.findIndex((r) => r.category_id === row.category_id)
    const swap = rows[idx + direction]
    if (idx < 0 || !swap || !posTypeId) return
    await run(async () => {
      const { error: e1 } = await supabase
        .from('pos_type_categories')
        .update({ sort_order: swap.sort_order })
        .eq('pos_type_id', posTypeId)
        .eq('category_id', row.category_id)
      if (e1) throw new Error(errorMessage(e1))
      const { error: e2 } = await supabase
        .from('pos_type_categories')
        .update({ sort_order: row.sort_order })
        .eq('pos_type_id', posTypeId)
        .eq('category_id', swap.category_id)
      if (e2) throw new Error(errorMessage(e2))
    })
  }

  async function confirmPending() {
    if (!pending || !posTypeId) return
    const { category, mode } = pending
    const ptName = posType.data?.name ?? 'this POS type'
    await run(async () => {
      if (mode === 'unlink') {
        const { error } = await supabase
          .from('pos_type_categories')
          .delete()
          .eq('pos_type_id', posTypeId)
          .eq('category_id', category.id)
        if (error) throw new Error(errorMessage(error))
      } else {
        const { error } = await supabase.rpc('admin_delete_category', {
          target_category: category.id,
        })
        if (error) throw new Error(errorMessage(error))
      }
      setPending(null)
    }, mode === 'unlink' ? `Removed ${category.name} from ${ptName}.` : `Deleted ${category.name}.`)
  }

  if (posType.loading || assigned.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-96 rounded-2xl lg:col-span-3" />
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (posType.error) {
    return <ErrorState message={posType.error} onRetry={posType.reload} />
  }

  if (!posType.data || !posTypeId) {
    return (
      <ErrorState
        message="POS type not found. It may have been deleted."
        onRetry={() => navigate('/pos-types')}
      />
    )
  }

  const pt = posType.data

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            to="/pos-types"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to POS types
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {pt.name} — Categories
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage the product categories available in this POS workspace. Changes sync to
            devices the next time they go online.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {(assigned.data ?? []).length} assigned
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Assigned categories — main column */}
        <section className="lg:col-span-3">
          <div className="rounded-2xl border border-border/70 bg-card shadow-xs">
            <header className="border-b border-border/70 px-5 py-4">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Assigned categories
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drag order with the arrows. Toggle off to hide without removing.
              </p>
            </header>
            <div className="p-4 sm:p-5">
              {assigned.error ? (
                <ErrorState message={assigned.error} onRetry={assigned.reload} />
              ) : (assigned.data ?? []).length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Tags className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">No categories yet</p>
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                      Add a new category on the right, or assign existing ones from the catalog.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {(assigned.data ?? []).map((row, idx, arr) => {
                    const cat = row.category
                    if (!cat) return null
                    const isRenaming = renaming?.id === cat.id
                    return (
                      <li
                        key={cat.id}
                        className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:border-primary/30"
                      >
                        <span className="w-7 shrink-0 text-center font-mono text-[11px] text-muted-foreground/70">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                autoFocus
                                className="h-9 text-sm"
                                value={renaming.value}
                                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void saveRename(cat.id)
                                  if (e.key === 'Escape') setRenaming(null)
                                }}
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-9 shrink-0 text-emerald-600"
                                disabled={busy}
                                onClick={() => void saveRename(cat.id)}
                                title="Save name"
                              >
                                <Check className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-9 shrink-0"
                                disabled={busy}
                                onClick={() => setRenaming(null)}
                                title="Cancel"
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span
                                className={`text-sm font-medium ${cat.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}
                              >
                                {cat.name}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground/60">
                                {cat.slug}
                              </span>
                            </div>
                          )}
                        </div>
                        {!isRenaming && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Switch
                              size="sm"
                              checked={cat.active}
                              disabled={busy}
                              onCheckedChange={(v) => void toggleActive(cat, v)}
                              title={cat.active ? 'Deactivate' : 'Activate'}
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9"
                              disabled={busy || idx === 0}
                              onClick={() => void move(row, -1)}
                              title="Move up"
                            >
                              <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9"
                              disabled={busy || idx === arr.length - 1}
                              onClick={() => void move(row, 1)}
                              title="Move down"
                            >
                              <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9"
                              disabled={busy}
                              onClick={() => setRenaming({ id: cat.id, value: cat.name })}
                              title="Rename"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9 text-muted-foreground hover:text-foreground"
                              disabled={busy}
                              onClick={() => setPending({ category: cat, mode: 'unlink' })}
                              title={`Remove from ${pt.name}`}
                            >
                              <X className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-9 text-destructive hover:text-destructive"
                              disabled={busy}
                              onClick={() => setPending({ category: cat, mode: 'purge' })}
                              title="Delete category everywhere"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Sidebar — add + multi-select assign */}
        <aside className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">New category</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Creates a catalog category and assigns it here.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                className="h-9 flex-1"
                placeholder="e.g. Value Meals"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addNewCategory()
                }}
                disabled={busy}
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={busy || !newName.trim()}
                onClick={() => void addNewCategory()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Assign from catalog
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pick existing categories to add.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy || selected.size === 0}
                onClick={() => void assignSelected()}
              >
                <Tags className="size-3.5" />
                Assign ({selected.size})
              </Button>
            </header>
            <div className="p-4 sm:p-5">
              {catalog.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded-lg" />
                  ))}
                </div>
              ) : catalog.error ? (
                <ErrorState message={catalog.error} onRetry={catalog.reload} />
              ) : unassigned.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Every catalog category is already assigned.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {unassigned.map((cat) => {
                    const isSelected = selected.has(cat.id)
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        disabled={busy}
                        onClick={() => toggleSelected(cat.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/40'
                        }`}
                      >
                        {isSelected && <Check className="size-3" />}
                        {cat.name}
                        {!cat.active && <span className="text-[10px] opacity-70">(inactive)</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={pending !== null}
        title={pending?.mode === 'purge' ? 'Delete category?' : 'Remove category?'}
        message={
          pending
            ? pending.mode === 'purge'
              ? `"${pending.category.name}" will be removed from every POS type that uses it. This cannot be undone.`
              : `Remove "${pending.category.name}" from ${pt.name}? The category stays in the catalog and can be reassigned later.`
            : ''
        }
        confirmLabel={pending?.mode === 'purge' ? 'Delete' : 'Remove'}
        danger
        busy={busy}
        onConfirm={() => void confirmPending()}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
