-- ============================================================================
-- Central POS — Admin Dashboard: 06_releases.sql
-- POS installer releases. Run AFTER 05_...sql.
--
-- The public landing page reads ONLY published releases as the anon role. The
-- admin console (Downloads page) manages rows, each pointing at an external
-- http(s) download URL — installers are not uploaded to Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pos_releases — one row per published installer build
-- ---------------------------------------------------------------------------
create table if not exists public.pos_releases (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null check (platform in ('android', 'windows')),
  version         text not null check (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?([-+][0-9A-Za-z.-]+)?$'),
  -- Releases are external links only: the installer is hosted elsewhere and
  -- this URL is required (see 18_external_releases.sql).
  download_url    text not null check (download_url ~* '^https?://[^[:space:]]+$'),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  release_notes   text,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pos_releases_version_uniq unique (platform, version)
);

create index if not exists pos_releases_public_idx
  on public.pos_releases (status, platform, created_at desc);

drop trigger if exists pos_releases_set_updated_at on public.pos_releases;
create trigger pos_releases_set_updated_at
  before update on public.pos_releases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — everyone (incl. anon) reads published rows; admins manage all
-- ---------------------------------------------------------------------------
alter table public.pos_releases enable row level security;

drop policy if exists "pos_releases_select_public" on public.pos_releases;
create policy "pos_releases_select_public"
  on public.pos_releases for select
  to public
  using (status = 'published' or public.is_admin());

drop policy if exists "pos_releases_write_admin" on public.pos_releases;
create policy "pos_releases_write_admin"
  on public.pos_releases for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Public catalog reads for the landing page (anon)
-- ---------------------------------------------------------------------------
drop policy if exists "plans_select_public" on public.subscription_plans;
create policy "plans_select_public"
  on public.subscription_plans for select
  to anon
  using (active = true);

drop policy if exists "pos_types_select_public" on public.pos_types;
create policy "pos_types_select_public"
  on public.pos_types for select
  to anon
  using (active = true);

-- ---------------------------------------------------------------------------
-- Audit trail (mirrors the other admin-managed entities)
-- ---------------------------------------------------------------------------
create or replace function public.audit_pos_releases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.skip_audit', true), '0') = '1'
     or auth.uid() is null or not public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity('release.create', 'pos_release', new.id::text,
      'Created ' || new.platform || ' release v' || new.version,
      jsonb_build_object('platform', new.platform, 'version', new.version, 'status', new.status));
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      perform public.log_activity('release.status_changed', 'pos_release', new.id::text,
        new.platform || ' release v' || new.version || ' ' || new.status,
        jsonb_build_object('from', old.status, 'to', new.status));
    else
      perform public.log_activity('release.update', 'pos_release', new.id::text,
        'Updated ' || new.platform || ' release v' || new.version,
        jsonb_build_object('version', new.version, 'status', new.status));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity('release.delete', 'pos_release', old.id::text,
      'Deleted ' || old.platform || ' release v' || old.version,
      jsonb_build_object('platform', old.platform, 'version', old.version));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_pos_releases on public.pos_releases;
create trigger audit_pos_releases
  after insert or update or delete on public.pos_releases
  for each row execute function public.audit_pos_releases();
