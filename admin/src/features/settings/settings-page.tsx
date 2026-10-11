import * as React from 'react'
import { CreditCard, Loader2, Pencil, Plus, Save, SlidersHorizontal, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { formatDate, peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SubscriptionPlan, SystemSetting } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { PageHeader } from '@/components/common/page-header'
import { Modal } from '@/components/common/modal'
import { Card, ErrorState, LoadingRows, TableWrap } from '@/components/common/states'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type TabId = 'general' | 'plans' | 'profile'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'System', icon: SlidersHorizontal },
  { id: 'plans', label: 'Subscription plans', icon: CreditCard },
  { id: 'profile', label: 'Admin profile', icon: UserCog },
]

export function SettingsPage() {
  const [tab, setTab] = React.useState<TabId>('general')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="System configuration, subscription plans, and your admin profile."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="gap-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              <t.icon className="size-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* System settings                                                     */
/* ------------------------------------------------------------------ */

function renderInput(value: unknown, onChange: (v: unknown) => void): React.ReactNode {
  if (typeof value === 'boolean') {
    return (
      <label className="flex cursor-pointer items-center gap-3">
        <Switch
          size="sm"
          checked={value}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <span className="text-sm">{value ? 'Enabled' : 'Disabled'}</span>
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <Input
        type="number"
        className="w-40"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    )
  }
  return (
    <Input
      type="text"
      className="w-full max-w-sm"
      value={typeof value === 'string' ? value : JSON.stringify(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function GeneralTab() {
  const [draft, setDraft] = React.useState<Record<string, unknown>>({})
  const [busyKey, setBusyKey] = React.useState<string | null>(null)

  const settings = useAsync(async () => {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .order('key')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as SystemSetting[]
  }, [])

  function setValue(key: string, v: unknown) {
    setDraft((d) => ({ ...d, [key]: v }))
  }

  async function save(setting: SystemSetting) {
    const raw = draft[setting.key]
    setBusyKey(setting.key)
    try {
      // Strings are stored as-is (JSON strings in PostgREST terms). If the
      // original value was structured (object/array) and the user edited the
      // JSON text, parse it back before saving.
      let value = raw
      if (typeof raw === 'string' && typeof setting.value === 'object' && setting.value !== null) {
        value = JSON.parse(raw)
      }
      const { error } = await supabase
        .from('system_settings')
        .update({ value })
        .eq('key', setting.key)
      if (error) throw new Error(errorMessage(error))
      toast.success(`Saved "${setting.key}".`)
      setDraft((d) => {
        const next = { ...d }
        delete next[setting.key]
        return next
      })
      settings.reload()
    } catch (err) {
      toast.error(
        err instanceof SyntaxError
          ? 'Value must be valid JSON for structured settings.'
          : errorMessage(err)
      )
    } finally {
      setBusyKey(null)
    }
  }

  if (settings.loading) return <LoadingRows rows={6} cols={2} />
  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />

  return (
    <Card
      title="System configuration"
      description="Key settings used by the platform and (future) POS clients."
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-border">
        {(settings.data ?? []).map((s) => {
          const current = draft[s.key] !== undefined ? draft[s.key] : s.value
          const dirty = draft[s.key] !== undefined
          return (
            <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.key}</p>
                {s.description && (
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  Updated {formatDate(s.updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {renderInput(current, (v) => setValue(s.key, v))}
                <Button
                  type="button"
                  variant={dirty ? 'default' : 'ghost'}
                  size="sm"
                  disabled={!dirty || busyKey === s.key}
                  onClick={() => void save(s)}
                >
                  {busyKey === s.key ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Subscription plans                                                  */
/* ------------------------------------------------------------------ */

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

function PlansTab() {
  const [editing, setEditing] = React.useState<{ mode: 'create' | 'edit'; form: PlanForm } | null>(null)
  const [busy, setBusy] = React.useState(false)

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
    if (!form.id.trim() || !form.name.trim() || form.duration_days < 1) {
      toast.error('ID, name, and a positive duration are required.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        id: form.id.trim().toLowerCase().replace(/\s+/g, '_'),
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
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium leading-none text-zinc-600">
                        {p.is_trial ? 'trial' : 'paid'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
                          p.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-zinc-200 bg-zinc-100 text-zinc-600'
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
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Admin profile                                                       */
/* ------------------------------------------------------------------ */

function ProfileTab() {
  const { profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = React.useState(profile?.full_name ?? '')
  const [businessName, setBusinessName] = React.useState(profile?.business_name ?? '')
  const [contact, setContact] = React.useState(profile?.contact_number ?? '')
  const [address, setAddress] = React.useState(profile?.address ?? '')
  const [saving, setSaving] = React.useState(false)

  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [changingPassword, setChangingPassword] = React.useState(false)

  React.useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setBusinessName(profile.business_name ?? '')
      setContact(profile.contact_number ?? '')
      setAddress(profile.address ?? '')
    }
  }, [profile])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          business_name: businessName.trim() || null,
          contact_number: contact.trim() || null,
          address: address.trim() || null,
        })
        .eq('id', profile.id)
      if (error) throw new Error(errorMessage(error))
      await refreshProfile()
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new Error(errorMessage(error))
      toast.success('Password changed.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Profile details" description="Shown in activity logs and the sidebar.">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={profile?.email ?? ''} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Business / team name</Label>
            <Input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contact number</Label>
            <Input type="text" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-3.5" />
            Save profile
          </Button>
        </form>
      </Card>

      <Card title="Change password" description="Uses Supabase Auth — minimum 8 characters.">
        <form onSubmit={changePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={changingPassword}>
            {changingPassword && <Loader2 className="size-4 animate-spin" />}
            Change password
          </Button>
        </form>
      </Card>
    </div>
  )
}
