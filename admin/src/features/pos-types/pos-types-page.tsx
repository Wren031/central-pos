import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Pencil, Plus, Power, RotateCw, ScanBarcode, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { POS_TYPE_ICON_NAMES, posTypeIcon } from '@/lib/constants'
import type { PosType } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { Modal } from '@/components/common/modal'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface PosTypeForm {
  id: string
  name: string
  tagline: string
  description: string
  icon: string
  sort_order: number
  active: boolean
  barcode_enabled: boolean
}

const EMPTY_FORM: PosTypeForm = {
  id: '',
  name: '',
  tagline: '',
  description: '',
  icon: 'Store',
  sort_order: 0,
  active: true,
  barcode_enabled: false,
}

export function PosTypesPage() {
  const navigate = useNavigate()
  const [editing, setEditing] = React.useState<{ mode: 'create' | 'edit'; form: PosTypeForm } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const posTypes = useAsync(async () => {
    const { data, error } = await supabase.from('pos_types').select('*').order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as PosType[]
  }, [])

  const [categoryCounts, setCategoryCounts] = React.useState<Record<string, number>>({})

  const loadCounts = React.useCallback(async () => {
    const { data, error } = await supabase.from('pos_type_categories').select('pos_type_id')
    if (error || !data) return
    const counts: Record<string, number> = {}
    for (const row of data as { pos_type_id: string }[]) {
      counts[row.pos_type_id] = (counts[row.pos_type_id] ?? 0) + 1
    }
    setCategoryCounts(counts)
  }, [])

  React.useEffect(() => {
    void loadCounts()
  }, [loadCounts])

  function openCreate() {
    setEditing({ mode: 'create', form: { ...EMPTY_FORM, sort_order: (posTypes.data?.length ?? 0) } })
  }

  function openEdit(t: PosType) {
    setEditing({
      mode: 'edit',
      form: {
        id: t.id,
        name: t.name,
        tagline: t.tagline ?? '',
        description: t.description ?? '',
        icon: t.icon ?? 'Store',
        sort_order: t.sort_order,
        active: t.active,
        barcode_enabled: t.barcode_enabled ?? false,
      },
    })
  }

  async function toggleActive(t: PosType) {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('pos_types')
        .update({ active: !t.active })
        .eq('id', t.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`${t.name} ${t.active ? 'deactivated' : 'activated'}.`)
      posTypes.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveForm() {
    if (!editing) return
    const { form, mode } = editing
    if (!form.id.trim() || !form.name.trim()) {
      toast.error('ID and name are required.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        id: form.id.trim().toLowerCase().replace(/\s+/g, '_'),
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        description: form.description.trim() || null,
        icon: form.icon,
        sort_order: form.sort_order,
        active: form.active,
        barcode_enabled: form.barcode_enabled,
      }
      const { error } =
        mode === 'create'
          ? await supabase.from('pos_types').insert(payload)
          : await supabase.from('pos_types').update(payload).eq('id', form.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(mode === 'create' ? 'POS type created.' : 'POS type updated.')
      setEditing(null)
      posTypes.reload()
      if (mode === 'create') {
        // Jump straight into assigning categories for the new type.
        navigate(`/pos-types/${payload.id}/categories`)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="POS Types"
        description="Business types stores can choose during onboarding (BBQ, retail, grocery…)."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={posTypes.reload}>
              <RotateCw className="size-4" />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              New POS type
            </Button>
          </>
        }
      />

      {posTypes.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : posTypes.error ? (
        <ErrorState message={posTypes.error} onRetry={posTypes.reload} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(posTypes.data ?? []).map((t) => {
            const Icon = posTypeIcon(t.icon)
            return (
              <div
                key={t.id}
                className={`rounded-xl border border-border bg-card p-5 shadow-xs ${
                  t.active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h2 className="font-semibold leading-tight text-foreground">{t.name}</h2>
                      <p className="text-xs text-muted-foreground">{t.tagline ?? t.id}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${
                        t.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-zinc-200 bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {t.active ? 'active' : 'inactive'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium leading-none text-sky-700">
                      <Tags className="size-3" aria-hidden />
                      {categoryCounts[t.id] ?? 0} categor{categoryCounts[t.id] === 1 ? 'y' : 'ies'}
                    </span>
                    {t.barcode_enabled && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium leading-none text-violet-700">
                        <ScanBarcode className="size-3" aria-hidden />
                        Barcode
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 min-h-[3rem] text-sm text-muted-foreground">
                  {t.description ?? 'No description yet.'}
                </p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground/70">
                    {t.id} · #{t.sort_order}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => void toggleActive(t)}
                      disabled={busy}
                      title={t.active ? 'Deactivate' : 'Activate'}
                    >
                      <Power className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/pos-types/${t.id}/categories`)}
                    >
                      <Tags className="size-3.5" />
                      Categories
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'create' ? 'New POS type' : 'Edit POS type'}
        size="lg"
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>ID (slug)</Label>
                <Input
                  type="text"
                  className="font-mono"
                  placeholder="bakery"
                  value={editing.form.id}
                  disabled={editing.mode === 'edit'}
                  onChange={(e) =>
                    setEditing({ ...editing, form: { ...editing.form, id: e.target.value } })
                  }
                />
                <p className="text-[11px] text-muted-foreground/70">
                  Lowercase letters, numbers, underscores. Cannot change after creation.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  type="text"
                  placeholder="Bakery POS"
                  value={editing.form.name}
                  onChange={(e) =>
                    setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tagline</Label>
                <Input
                  type="text"
                  placeholder="Panaderias & cake shops"
                  value={editing.form.tagline}
                  onChange={(e) =>
                    setEditing({ ...editing, form: { ...editing.form, tagline: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Select
                  value={editing.form.icon}
                  onValueChange={(v) =>
                    setEditing({ ...editing, form: { ...editing.form, icon: v } })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POS_TYPE_ICON_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                placeholder="What kind of business is this POS built for?"
                value={editing.form.description}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={editing.form.sort_order}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, sort_order: Number(e.target.value) || 0 },
                    })
                  }
                />
              </div>
              <label className="mt-6 flex cursor-pointer items-center gap-3 sm:mt-8">
                <Switch
                  size="sm"
                  checked={editing.form.active}
                  onCheckedChange={(checked) =>
                    setEditing({ ...editing, form: { ...editing.form, active: checked } })
                  }
                />
                <span className="text-sm font-medium">Active (available to new stores)</span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3.5">
              <div className="flex items-start gap-3">
                <ScanBarcode className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-sm font-medium">Barcode scanner</p>
                  <p className="text-[11px] text-muted-foreground">
                    Lets this POS type scan product barcodes with a camera or USB scanner. Off = all
                    barcode features stay hidden in the client POS.
                  </p>
                </div>
              </div>
              <Switch
                size="sm"
                checked={editing.form.barcode_enabled}
                onCheckedChange={(checked) =>
                  setEditing({ ...editing, form: { ...editing.form, barcode_enabled: checked } })
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void saveForm()} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {editing.mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
