-- ============================================================================
-- Central POS — 16_workspace_uniqueness.sql
-- One workspace (store) per authenticated user, enforced by the database.
--
-- Why: the POS client is offline-first and recovers its workspace config from
-- `client_store_config()`. Without a uniqueness constraint, a race between two
-- setup requests (or two devices) could insert TWO store rows for the same
-- owner. `client_store_config()` then returned whichever row sorted first,
-- which made the assigned POS type look "missing" or "wrong".
--
-- Run AFTER 01 -> 15. Idempotent and safe to re-run.
--
-- What this script does:
--   1. Collapses any legacy duplicate stores, keeping the OLDEST row per owner
--      (the one the client has always read) and re-pointing pos_sales at it.
--   2. Adds a UNIQUE index on stores(owner_id).
--   3. Replaces client_save_store_config() with a concurrency-safe upsert
--      (INSERT ... ON CONFLICT (owner_id)), still refusing POS-type changes.
--
-- Security posture is unchanged: both client RPCs remain SECURITY DEFINER and
-- keyed on auth.uid(); RLS in 02_rls.sql still prevents cross-owner access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Prelude
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.stores') is null then
    raise exception 'public.stores does not exist — run 01_schema.sql first.';
  end if;
  if to_regclass('public.pos_sales') is null then
    raise exception 'public.pos_sales does not exist — run 01_schema.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Collapse legacy duplicates (keep the oldest per owner).
--    pos_sales rows are moved to the kept store before the extras are deleted,
--    so no synced sale is ever orphaned.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by owner_id
      order by created_at asc, id asc
    ) as keep_id
  from public.stores
)
update public.pos_sales p
set store_id = r.keep_id
from ranked r
where p.store_id = r.id
  and r.rn > 1;

with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by created_at asc, id asc
    ) as rn
  from public.stores
)
delete from public.stores s
using ranked r
where s.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Enforce ONE store per owner. (The client reads/upserts by owner_id.)
-- ---------------------------------------------------------------------------
create unique index if not exists stores_owner_unique_idx
  on public.stores (owner_id);

-- ---------------------------------------------------------------------------
-- 3. Concurrency-safe upsert.
--    * First setup inserts the store with the chosen POS type.
--    * Repeated setup / double-clicks / a second device conflict on owner_id
--      and only refresh the name + onboarded flag.
--    * A DIFFERENT POS type is still rejected (immutable after assignment).
--    * If the conflicting row has another type, RETURNING yields no row and we
--      raise the same readable error the client already surfaces.
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

  insert into public.stores (owner_id, name, pos_type, onboarded)
  values (v_uid, coalesce(v_name, 'My Store'), v_pos_type, true)
  on conflict (owner_id) do update
    set name = coalesce(v_name, public.stores.name),
        onboarded = true
    where public.stores.pos_type = v_pos_type
  returning * into v_store;

  if v_store.id is null then
    -- Conflict with a DIFFERENT type: never overwrite an existing workspace.
    select * into v_store from public.stores where owner_id = v_uid;
    raise exception 'This account is already configured as "%". The POS type cannot be changed here — contact an administrator.',
      coalesce(v_store.pos_type, 'another type');
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
