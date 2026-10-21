import * as React from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SubscriptionPlan } from '@/lib/types'
import { PageHeader } from '@/components/common/page-header'
import { Modal } from '@/components/common/modal'
import { Card, ConfirmModal, ErrorState, LoadingRows, TableWrap } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

/** Subscription plan catalogue: duration, price, trial flag, and features. */
export function SubscriptionPlansPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Subscription Plans"
        description="The plans customers can subscribe to — duration, price, and features."
      />
      <PlansSection />
    </div>
  )
}

interface PlanForm {
  id: string
  name: string
  description: string
  duration_days: number
  price: number
  active: boolean
  is_trial: boolean
  sort_order: number
  features: string
}

function PlansSection() {
  const [editing, setEditing] = React.useState<{ mode: 'create' | 'edit'; form: PlanForm } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<SubscriptionPlan | null>(null)

  const plans = useAsync(async () => {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as SubscriptionPlan[]
  }, [])

  function openEdit(p: SubscriptionPlan) {
    setEditing({
      mode: 'edit',
      form: {
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        duration_days: p.duration_days,
        price: Number(p.price),
        active: p.active,
        is_trial: p.is_trial,
        sort_order: p.sort_order,
        features: (p.features ?? []).join('\n'),
      },
    })
  }

  function openCreate() {
    setEditing({
      mode: 'create',
      form: {
        id: '',
        name: '',
        description: '',
        duration_days: 30,
        price: 0,
        active: true,
        is_trial: false,
        sort_order: (plans.data?.length ?? 0) * 10,
        features: '',
      },
    })
  }

  async function saveForm() {
    if (!editing) return
    const { form, mode } = editing
    const slug = form.id.trim().toLowerCase().replace(/\s+/g, '_')
    if (!slug || !form.name.trim() || form.duration_days < 1) {
      toast.error('ID, name, and a positive duration are required.')
      return
    }
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(slug)) {
      toast.error('ID must start with a letter and use only lowercase letters, numbers, and underscores.')
      return
    }
    if (form.price < 0) {
      toast.error('Price cannot be negative.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        id: slug,
        name: form.name.trim(),
        description: form.description.trim() || null,
        duration_days: form.duration_days,
        price: form.price,
        active: form.active,
        is_trial: form.is_trial,
        sort_order: form.sort_order,
        features: form.features
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean),
      }
      const { error } =
        mode === 'create'
          ? await supabase.from('subscription_plans').insert(payload)
          : await supabase.from('subscription_plans').update(payload).eq('id', form.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(mode === 'create' ? 'Plan created.' : 'Plan updated.')
      setEditing(null)
      plans.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function togglePlan(p: SubscriptionPlan) {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ active: !p.active })
        .eq('id', p.id)
      if (error) throw new Error(errorMessage(error))
      toast.success(`${p.name} ${p.active ? 'deactivated' : 'activated'}.`)
      plans.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function runDelete(plan: SubscriptionPlan) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_delete_plan', { target_plan: plan.id })
      if (error) throw new Error(errorMessage(error))
      toast.success(`${plan.name} deleted.`)
      setDeleteTarget(null)
      plans.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card
        title="Subscription plans"
        description="Prices and durations used when issuing or renewing subscriptions."
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            New plan
          </Button>
        }
        bodyClassName="p-0"
      >
        {plans.loading ? (
          <LoadingRows rows={4} cols={5} />
        ) : plans.error ? (
          <div className="p-4">
            <ErrorState message={plans.error} onRetry={plans.reload} />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(plans.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground/70">{p.id}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {p.duration_days} days
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {peso(Number(p.price))}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                        {p.is_trial ? 'trial' : 'paid'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
                          p.active
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-white/10 bg-white/5 text-muted-foreground'
                        )}
                      >
                        {p.active ? 'active' : 'inactive'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void togglePlan(p)}
                          disabled={busy || p.is_trial}
                          title={p.is_trial ? 'Trial cannot be deactivated' : undefined}
                        >
                          {p.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          title="Delete plan"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'create' ? 'New plan' : 'Edit plan'}
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
                  placeholder="quarterly"
                  value={editing.form.id}
                  disabled={editing.mode === 'edit'}
                  onChange={(e) =>
                    setEditing({ ...editing, form: { ...editing.form, id: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  type="text"
                  value={editing.form.name}
                  onChange={(e) =>
                    setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.form.duration_days}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, duration_days: Number(e.target.value) || 1 },
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price (PHP)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.form.price}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, price: Number(e.target.value) || 0 },
                    })
                  }
                />
              </div>
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
              <div className="flex flex-wrap items-center gap-6 pb-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <Switch
                    size="sm"
                    checked={editing.form.active}
                    onCheckedChange={(checked) =>
                      setEditing({ ...editing, form: { ...editing.form, active: checked } })
                    }
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Switch
                    size="sm"
                    checked={editing.form.is_trial}
                    disabled={editing.mode === 'edit'}
                    onCheckedChange={(checked) =>
                      setEditing({ ...editing, form: { ...editing.form, is_trial: checked } })
                    }
                  />
                  <span className="text-sm">Trial plan</span>
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={editing.form.description}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Features (one per line)</Label>
              <Textarea
                rows={4}
                placeholder={'Full POS workspace\nPriority support'}
                value={editing.form.features}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, features: e.target.value } })
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveForm()}
                disabled={busy}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {editing.mode === 'create' ? 'Create plan' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete plan?"
        busy={busy}
        confirmLabel="Delete plan"
        message={
          <>
            Delete <strong>{deleteTarget?.name}</strong>? Plans referenced by any subscription,
            payment, or request cannot be deleted — deactivate them instead.
          </>
        }
        onConfirm={() => deleteTarget && void runDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Admin profile                                                       */
/* ------------------------------------------------------------------ */
