-- ============================================================================
-- Central POS — Admin Dashboard: 02_rls.sql
-- Row Level Security. Run AFTER 01_schema.sql.
--
-- Model: only authenticated admins can administer anything. Customers (POS
-- devices, when they later sync to Supabase) can read their own rows and push
-- their own offline sales. Nothing is trusted from the frontend — every
-- policy lives here in the database.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is the current user an admin?
-- SECURITY DEFINER so policies can read profiles without recursing into RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (true);

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

-- No DELETE policy: accounts are deactivated (status), never hard-deleted
-- from the dashboard. (Cascade deletes still work from auth.users side.)

-- Guard rails: even admins cannot silently rewrite role/email through the
-- API; role can only change via the promote_to_admin() function, and only
-- admins may flip status.
-- The guards only apply to API requests (which always carry JWT claims).
-- Trusted DB-level connections (SQL Editor, migrations, psql as postgres)
-- have no request.jwt.claims — and can already rewrite the schema — so
-- bootstrap/promote scripts can run there while the API surface stays locked.
create or replace function public.profiles_protect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    if old.role is distinct from new.role and not public.is_admin() then
      raise exception 'not allowed to change profile role';
    end if;
    if old.email is distinct from new.email and not public.is_admin() then
      raise exception 'not allowed to change profile email';
    end if;
    if old.status is distinct from new.status and not public.is_admin() then
      raise exception 'not allowed to change profile status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.profiles_protect();

-- ---------------------------------------------------------------------------
-- pos_types — every signed-in user may read the catalog; admins manage it
-- ---------------------------------------------------------------------------
alter table public.pos_types enable row level security;

drop policy if exists "pos_types_select_authenticated" on public.pos_types;
create policy "pos_types_select_authenticated"
  on public.pos_types for select
  to authenticated
  using (true);

drop policy if exists "pos_types_write_admin" on public.pos_types;
create policy "pos_types_write_admin"
  on public.pos_types for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- categories — catalog is readable by any signed-in device (a POS workspace
-- needs it to sync its assigned category list); admins manage it.
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

drop policy if exists "categories_select_authenticated" on public.categories;
create policy "categories_select_authenticated"
  on public.categories for select
  to authenticated
  using (true);

drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin"
  on public.categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- pos_type_categories — devices read their own pos_type's assignments;
-- admins manage all.
-- ---------------------------------------------------------------------------
alter table public.pos_type_categories enable row level security;

drop policy if exists "pos_type_categories_select_authenticated" on public.pos_type_categories;
create policy "pos_type_categories_select_authenticated"
  on public.pos_type_categories for select
  to authenticated
  using (true);

drop policy if exists "pos_type_categories_write_admin" on public.pos_type_categories;
create policy "pos_type_categories_write_admin"
  on public.pos_type_categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- subscription_plans — public catalog, admin-managed
-- ---------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;

drop policy if exists "plans_select_authenticated" on public.subscription_plans;
create policy "plans_select_authenticated"
  on public.subscription_plans for select
  to authenticated
  using (true);

drop policy if exists "plans_write_admin" on public.subscription_plans;
create policy "plans_write_admin"
  on public.subscription_plans for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- stores — owner reads own; admins manage all
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;

drop policy if exists "stores_select_own_or_admin" on public.stores;
create policy "stores_select_own_or_admin"
  on public.stores for select
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "stores_insert_own_or_admin" on public.stores;
create policy "stores_insert_own_or_admin"
  on public.stores for insert
  to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "stores_update_admin" on public.stores;
create policy "stores_update_admin"
  on public.stores for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "stores_delete_admin" on public.stores;
create policy "stores_delete_admin"
  on public.stores for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- subscriptions — owner reads own; ALL writes go through admin RPCs
-- (03_functions.sql). No insert/update/delete policies on purpose: a POS
-- device must never be able to grant itself a subscription.
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- payments — owner reads own; admins read/write all. Future payment
-- gateways would use the service-role key (server side), never this policy.
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;

drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin"
  on public.payments for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payments_admin_write" on public.payments;
create policy "payments_admin_write"
  on public.payments for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "payments_admin_update" on public.payments;
create policy "payments_admin_update"
  on public.payments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "payments_admin_delete" on public.payments;
create policy "payments_admin_delete"
  on public.payments for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- activity_logs — admins read; inserts happen via triggers/RPCs.
-- Deliberately NO update/delete policies (append-only audit trail).
-- ---------------------------------------------------------------------------
alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_admin" on public.activity_logs;
create policy "activity_logs_select_admin"
  on public.activity_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "activity_logs_insert_admin" on public.activity_logs;
create policy "activity_logs_insert_admin"
  on public.activity_logs for insert
  to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- system_settings — admin only, read and write
-- ---------------------------------------------------------------------------
alter table public.system_settings enable row level security;

drop policy if exists "system_settings_select_admin" on public.system_settings;
create policy "system_settings_select_admin"
  on public.system_settings for select
  to authenticated
  using (public.is_admin());

drop policy if exists "system_settings_admin_write" on public.system_settings;
create policy "system_settings_admin_write"
  on public.system_settings for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "system_settings_admin_update" on public.system_settings;
create policy "system_settings_admin_update"
  on public.system_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "system_settings_admin_delete" on public.system_settings;
create policy "system_settings_admin_delete"
  on public.system_settings for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- pos_sales — the future offline-sync target. A device may push/read only
-- its own store's sales; admins read everything. The unique idempotency_key
-- column (schema) makes retried syncs safe.
-- ---------------------------------------------------------------------------
alter table public.pos_sales enable row level security;

drop policy if exists "pos_sales_select_own_or_admin" on public.pos_sales;
create policy "pos_sales_select_own_or_admin"
  on public.pos_sales for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "pos_sales_insert_own_or_admin" on public.pos_sales;
create policy "pos_sales_insert_own_or_admin"
  on public.pos_sales for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.stores s
        where s.id = store_id and s.owner_id = auth.uid()
      )
    )
  );
