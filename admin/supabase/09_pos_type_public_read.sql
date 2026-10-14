-- ============================================================================
-- Central POS — 09_pos_type_public_read.sql
-- Allow the (session-less) POS client to READ the admin-managed POS-type
-- catalog. Writes remain admin-only (see 02_rls.sql / 05_categories_migration.sql).
--
-- Run AFTER 01 -> 08. Idempotent — safe to run multiple times.
--
-- Why: the POS client never holds a Supabase session (it stays fully offline
-- and local-first), so `to authenticated` SELECT policies are not enough for
-- onboarding to list POS types. POS types/categories are non-sensitive
-- configuration, so active rows are readable by anon + authenticated.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pos_types — read active types
-- ---------------------------------------------------------------------------
alter table public.pos_types enable row level security;

drop policy if exists "pos_types_select_public" on public.pos_types;
create policy "pos_types_select_public"
  on public.pos_types for select
  to anon, authenticated
  using (active);

-- ---------------------------------------------------------------------------
-- categories — read active categories
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public"
  on public.categories for select
  to anon, authenticated
  using (active);

-- ---------------------------------------------------------------------------
-- pos_type_categories — read assignments (rows reference active parents)
-- ---------------------------------------------------------------------------
alter table public.pos_type_categories enable row level security;

drop policy if exists "pos_type_categories_select_public" on public.pos_type_categories;
create policy "pos_type_categories_select_public"
  on public.pos_type_categories for select
  to anon, authenticated
  using (true);
