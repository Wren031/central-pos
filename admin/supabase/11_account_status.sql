-- ============================================================================
-- Central POS — 11_account_status.sql
-- Server-authoritative ACCOUNT STATUS lookup for the (session-less) POS client.
--
-- Root cause this fixes: the POS client authenticates LOCALLY (Dexie/IndexedDB),
-- so a suspended profile could still sign in and open the workspace because the
-- client had NO way to read `profiles.status`. This migration exposes the
-- authoritative status through a SECURITY DEFINER RPC.
--
-- DEPENDENCIES: only public.profiles (from 01_schema.sql). The prelude below
-- makes this file SELF-SUFFICIENT: if `profiles` exists but predates the full
-- schema (a common "minimal profiles table" — id/email/full_name/role only), it
-- adds the `status` column in place instead of failing with
-- `42703 column "status" does not exist`. The companion payment guard that uses
-- is_account_suspended() lives in 12_suspend_payment_guard.sql.
--
-- Run AFTER 01. Idempotent — safe to re-run.
--
-- Security posture:
--   * The POS client holds NO Supabase session (persistSession:false, anon key),
--     so `to authenticated` RLS policies never apply to it. Server-side
--     enforcement therefore lives in SECURITY DEFINER RPCs, exactly like
--     submit_payment_request()/client_payment_requests() in 10_*.sql.
--   * client_account_status() returns ONLY `found`/`status` for the single email
--     the caller already knows — no PII beyond the email echo, no enumeration of
--     other accounts, no profile listing.
--   * A missing/invalid account is reported as found=false (never throws), so the
--     client can distinguish "no such account" from "active"/"suspended".
--   * Never uses or exposes the service-role key; the anon key is sufficient
--     because the RPC is explicitly granted to anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Prelude — guarantee public.profiles.status exists and is constrained.
--    Mirrors the upgrade block in 01_schema.sql, but scoped to just the column
--    this migration needs, so the file can be applied on its own. Idempotent.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception
      'public.profiles does not exist — run 01_schema.sql first (this migration needs it).';
  end if;
end $$;

-- Add the column if a legacy/minimal profiles table is missing it.
alter table public.profiles add column if not exists status text;

-- Backfill + default + not null (safe on an already-correct table).
update public.profiles set status = 'active' where status is null;
alter table public.profiles alter column status set default 'active';
alter table public.profiles alter column status set not null;

-- Only allow the known vocabulary.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check check (status in ('active', 'suspended'));
  end if;
end $$;

create index if not exists profiles_status_idx on public.profiles (status);

-- ---------------------------------------------------------------------------
-- 1. is_account_suspended() — true ONLY when a profile exists AND is suspended.
--    Missing / empty email -> false. Used by other RPCs for defense in depth.
-- ---------------------------------------------------------------------------
create or replace function public.is_account_suspended(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where lower(btrim(email)) = lower(btrim(coalesce(p_email, '')))
      and status = 'suspended'
  );
$$;

grant execute on function public.is_account_suspended(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. client_account_status() — the ONE call the POS client makes to verify an
--    account's current status. Returns:
--      { "found": true,  "status": "active"    }
--      { "found": true,  "status": "suspended" }
--      { "found": false, "status": null        }   -- missing / invalid record
--    Never raises for an unknown email, so the client can handle it safely.
-- ---------------------------------------------------------------------------
create or replace function public.client_account_status(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_status text;
begin
  if v_email = '' then
    return jsonb_build_object('found', false, 'status', null);
  end if;

  select status
  into v_status
  from public.profiles
  where lower(btrim(email)) = v_email
  limit 1;

  if v_status is null then
    return jsonb_build_object('found', false, 'status', null);
  end if;

  -- Only ever surface the known status vocabulary.
  if v_status not in ('active', 'suspended') then
    return jsonb_build_object('found', true, 'status', 'unknown');
  end if;

  return jsonb_build_object('found', true, 'status', v_status);
end;
$$;

grant execute on function public.client_account_status(text) to anon, authenticated;
