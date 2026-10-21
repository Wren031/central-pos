import * as React from 'react'
import { Loader2, Save, SlidersHorizontal, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/use-async'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { SystemSetting } from '@/lib/types'
import { useAuth } from '@/state/auth-context'
import { PageHeader } from '@/components/common/page-header'
import { Card, ErrorState, LoadingRows } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type TabId = 'general' | 'profile'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'System', icon: SlidersHorizontal },
  { id: 'profile', label: 'Admin profile', icon: UserCog },
]

export function SettingsPage() {
  const [tab, setTab] = React.useState<TabId>('general')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="System configuration and your admin profile. Plans and GCash live in the sidebar."
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
      .neq('key', 'gcash_qr')
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
