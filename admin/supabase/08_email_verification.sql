-- ============================================================================
-- Central POS — Admin Dashboard: 08_email_verification.sql
-- Real email-verification enforcement for POS clients. Run AFTER 07_...sql.
-- Idempotent — safe to re-run.
--
-- The POS client registers through Supabase Auth and must confirm its email
-- (via the confirmation link) before the account is usable. Supabase Auth
-- already blocks sign-in for unconfirmed emails; this file additionally gates
-- the rows a signed-in client may write, so an unverified account cannot
-- register a store or push sales until its email is confirmed.
--
-- Admins bypass these checks so the dashboard keeps working unchanged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- is_email_verified — is the current auth user's email confirmed?
-- SECURITY DEFINER so policies can read auth.users without RLS recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_email_verified()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select u.email_confirmed_at is not null
      from auth.users u
      where u.id = auth.uid()
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- stores — an unverified owner may not register a store.
-- (Admins keep full access.)
-- ---------------------------------------------------------------------------
drop policy if exists "stores_insert_own_or_admin" on public.stores;
create policy "stores_insert_own_or_admin"
  on public.stores for insert
  to authenticated
  with check (
    public.is_admin()
    or (owner_id = auth.uid() and public.is_email_verified())
  );

-- ---------------------------------------------------------------------------
-- pos_sales — an unverified device may not push synced sales.
-- ---------------------------------------------------------------------------
drop policy if exists "pos_sales_insert_own_or_admin" on public.pos_sales;
create policy "pos_sales_insert_own_or_admin"
  on public.pos_sales for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_email_verified()
      and user_id = auth.uid()
      and exists (
        select 1 from public.stores s
        where s.id = store_id and s.owner_id = auth.uid()
      )
    )
  );
