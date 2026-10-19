-- ============================================================================
-- Central POS — 15_client_store_config.sql
-- Lets the (session-less) POS client persist and recover its STORE CONFIG
-- (business name + assigned POS type + subscription summary) across devices.
--
-- Problem this fixes: the POS client authenticates locally (Dexie/IndexedDB) and
-- its business data never left the device. On a second device the client had no
-- way to learn which POS type the account already used, so it presented the
-- onboarding wizard again and the user could pick a DIFFERENT POS type —
-- producing inconsistent workspaces.
--
-- Run AFTER 01 -> 14. Idempotent — safe to re-run.
--
-- Security posture:
--   * Both RPCs are SECURITY DEFINER and keyed on auth.uid() — never on an
--     email parameter. A caller can only read or write ITS OWN store row.
--   * SECURITY DEFINER is required because the POS client holds no persistent
--     Supabase session during normal use; it proves ownership by signing in
--     with its password for the duration of a single operation.
--   * Writes are limited to name/onboarded/pos_type on the caller's own row.
--     status (active/suspended) stays admin-only.
--   * pos_type can be set ONCE (when the store row is created). Any later
--     change is rejected — only an administrator may change a store's POS type
--     from the dashboard.
--   * No PII beyond the caller's own store row is returned.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Prelude — make sure the columns this file needs exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.stores') is null then
    raise exception 'public.stores does not exist — run 01_schema.sql first.';
  end if;
end $$;

alter table public.stores add column if not exists onboarded boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1. client_store_config() — the caller's own store + subscription summary.
--    Returns { found: false } when the account has no store yet (a brand-new
--    account) so the client can tell "never configured" from "configured
--    elsewhere" without guessing.
-- ---------------------------------------------------------------------------
create or replace function public.client_store_config()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid   uuid := auth.uid();
  v_store public.stores;
  v_sub   public.subscriptions;
begin
  if v_uid is null then
    return jsonb_build_object('found', false, 'store', null, 'subscription', null);
  end if;

  select * into v_store
  from public.stores
  where owner_id = v_uid
  order by created_at asc
  limit 1;

  if v_store.id is null then
    return jsonb_build_object('found', false, 'store', null, 'subscription', null);
  end if;

  select * into v_sub from public.subscriptions where user_id = v_uid limit 1;

  return jsonb_build_object(
    'found', true,
    'store', jsonb_build_object(
      'id',         v_store.id,
      'name',       v_store.name,
      'pos_type',   v_store.pos_type,
      'onboarded',  v_store.onboarded,
      'status',     v_store.status
    ),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'plan_id',    v_sub.plan_id,
      'status',     v_sub.status,
      'started_at', v_sub.started_at,
      'expires_at', v_sub.expires_at,
      'price_paid', v_sub.price_paid
    ) end
  );
end;
$$;

grant execute on function public.client_store_config() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. client_save_store_config() — upsert the caller's own store config.
--    * pos_type is validated against active POS types.
--    * On an EXISTING store the pos_type must match; changing it raises so the
--      client can never silently switch an account's workspace type.
-- ---------------------------------------------------------------------------
create or replace function public.client_save_store_config(
  p_name     text,
  p_pos_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_pos_type text := nullif(btrim(coalesce(p_pos_type, '')), '');
  v_store    public.stores;
  v_type_ok  boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_pos_type is null then
    raise exception 'A POS type is required.';
  end if;

  select exists(
    select 1 from public.pos_types where id = v_pos_type and active
  ) into v_type_ok;
  if not v_type_ok then
    raise exception 'That POS type is not available.';
  end if;

  select * into v_store
  from public.stores
  where owner_id = v_uid
  order by created_at asc
  limit 1;

  if v_store.id is null then
    insert into public.stores (owner_id, name, pos_type, onboarded)
    values (
      v_uid,
      coalesce(v_name, 'My Store'),
      v_pos_type,
      true
    )
    returning * into v_store;
  else
    -- The workspace type is immutable once assigned.
    if v_store.pos_type is distinct from v_pos_type then
      raise exception 'This account is already configured as "%". The POS type cannot be changed here — contact an administrator.',
        v_store.pos_type;
    end if;

    update public.stores
    set name = coalesce(v_name, name),
        onboarded = true
    where id = v_store.id
    returning * into v_store;
  end if;

  return jsonb_build_object(
    'ok', true,
    'store', jsonb_build_object(
      'id',        v_store.id,
      'name',      v_store.name,
      'pos_type',  v_store.pos_type,
      'onboarded', v_store.onboarded
    )
  );
end;
$$;

grant execute on function public.client_save_store_config(text, text) to authenticated;
