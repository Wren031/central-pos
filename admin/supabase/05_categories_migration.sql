-- ============================================================================
-- Migration: multi-category support for POS types
-- Idempotent — safe to run multiple times.
-- Paste this whole file into the Supabase SQL Editor and Run, OR run
--   .\supabase\seed.ps1 -Token <your-access-token>
-- from the admin folder (it re-applies 01-04, all idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 60),
  slug       text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_active_idx on public.categories (active, sort_order);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create table if not exists public.pos_type_categories (
  pos_type_id text not null references public.pos_types (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (pos_type_id, category_id)
);

create index if not exists pos_type_categories_category_idx
  on public.pos_type_categories (category_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — devices read; only admins write
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
-- 3. Audit triggers + guarded delete RPC
-- ---------------------------------------------------------------------------
create or replace function public.audit_categories()
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
    perform public.log_activity('category.create', 'category', new.id::text,
      'Created category ' || new.name, jsonb_build_object('slug', new.slug));
  elsif tg_op = 'UPDATE' then
    if old.name is distinct from new.name
       or old.active is distinct from new.active
       or old.sort_order is distinct from new.sort_order then
      perform public.log_activity('category.update', 'category', new.id::text,
        'Updated category ' || new.name,
        jsonb_build_object(
          'name', jsonb_build_object('from', old.name, 'to', new.name),
          'active', jsonb_build_object('from', old.active, 'to', new.active),
          'sort_order', jsonb_build_object('from', old.sort_order, 'to', new.sort_order)));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity('category.delete', 'category', old.id::text,
      'Deleted category ' || old.name, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_categories on public.categories;
create trigger audit_categories
  after insert or update or delete on public.categories
  for each row execute function public.audit_categories();

create or replace function public.audit_pos_type_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat_name text;
  v_pt_name  text;
begin
  if coalesce(current_setting('app.skip_audit', true), '0') = '1'
     or auth.uid() is null or not public.is_admin() then
    return coalesce(new, old);
  end if;
  select name into v_cat_name from public.categories
    where id = coalesce(new.category_id, old.category_id);
  select name into v_pt_name from public.pos_types
    where id = coalesce(new.pos_type_id, old.pos_type_id);
  if tg_op = 'INSERT' then
    perform public.log_activity('category.assign', 'pos_type', new.pos_type_id,
      'Assigned category ' || coalesce(v_cat_name, '?') || ' to ' || coalesce(v_pt_name, new.pos_type_id),
      jsonb_build_object('category_id', new.category_id, 'sort_order', new.sort_order));
  elsif tg_op = 'UPDATE' and old.sort_order is distinct from new.sort_order then
    perform public.log_activity('category.reorder', 'pos_type', new.pos_type_id,
      'Reordered category ' || coalesce(v_cat_name, '?') || ' in ' || coalesce(v_pt_name, new.pos_type_id),
      jsonb_build_object('category_id', new.category_id,
        'sort_order', jsonb_build_object('from', old.sort_order, 'to', new.sort_order)));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('category.unassign', 'pos_type', old.pos_type_id,
      'Removed category ' || coalesce(v_cat_name, '?') || ' from ' || coalesce(v_pt_name, old.pos_type_id),
      jsonb_build_object('category_id', old.category_id));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_pos_type_categories on public.pos_type_categories;
create trigger audit_pos_type_categories
  after insert or update or delete on public.pos_type_categories
  for each row execute function public.audit_pos_type_categories();

create or replace function public.admin_delete_category(target_category uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_products bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select name into v_name from public.categories where id = target_category;
  if v_name is null then
    raise exception 'category not found';
  end if;

  if to_regclass('public.products') is not null then
    execute 'select count(*) from public.products where category_id = $1'
      into v_products using target_category;
  end if;

  if v_products > 0 then
    raise exception 'cannot delete "%" — % product(s) still use this category. Reassign or remove them first.',
      v_name, v_products;
  end if;

  perform set_config('app.skip_audit', '1', true);
  delete from public.categories where id = target_category;

  perform public.log_activity('category.delete', 'category', target_category::text,
    'Deleted category ' || v_name, jsonb_build_object('products', v_products));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Default categories per POS type
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
  v_item  jsonb;
  v_slug  text;
  v_name  text;
  v_cat_id uuid;
  v_order int;
begin
  for t in
    select * from (values
      ('bbq', '[["bbq_grilled_skewers","Grilled Skewers"],["bbq_chicken","Chicken"],["bbq_pork_courses","Pork Courses"],["bbq_rice_meals","Rice Meals"],["bbq_bilao_platters","Bilao & Platters"],["bbq_drinks","Drinks"],["bbq_sides","Sides & Extras"]]'::jsonb),
      ('retail', '[["retail_apparel","Apparel"],["retail_footwear","Footwear"],["retail_accessories","Accessories"],["retail_gadgets","Gadgets & Electronics"],["retail_school","School Supplies"],["retail_household","Household Items"],["retail_personal_care","Personal Care"]]'::jsonb),
      ('grocery', '[["grocery_canned_goods","Canned Goods"],["grocery_snacks","Snacks"],["grocery_beverages","Beverages"],["grocery_fresh_produce","Fresh Produce"],["grocery_meat_seafood","Meat & Seafood"],["grocery_dairy","Dairy & Eggs"],["grocery_household","Household & Cleaning"],["grocery_personal_care","Personal Care"]]'::jsonb),
      ('restaurant', '[["restaurant_appetizers","Appetizers"],["restaurant_soups_salad","Soups & Salads"],["restaurant_main_courses","Main Courses"],["restaurant_rice_noodles","Rice & Noodles"],["restaurant_desserts","Desserts"],["restaurant_beverages","Beverages"],["restaurant_specials","Daily Specials"]]'::jsonb),
      ('cafe', '[["cafe_hot_coffee","Hot Coffee"],["cafe_cold_coffee","Cold Coffee"],["cafe_milk_tea","Milk Tea"],["cafe_fruit_tea","Fruit Tea & Juice"],["cafe_pastries","Pastries & Snacks"],["cafe_add_ons","Add-ons & Toppings"]]'::jsonb),
      ('pharmacy', '[["pharmacy_prescription","Prescription Medicines"],["pharmacy_otc","Over-the-Counter"],["pharmacy_vitamins","Vitamins & Supplements"],["pharmacy_first_aid","First Aid"],["pharmacy_medical_devices","Medical Devices"],["pharmacy_personal_care","Personal Care"]]'::jsonb),
      ('general', '[["general_snacks","Snacks"],["general_beverages","Beverages"],["general_canned_goods","Canned Goods"],["general_household","Household"],["general_school","School Supplies"],["general_personal_care","Personal Care"],["general_sari_sari","Sari-sari Essentials"]]'::jsonb)
    ) as tp(pos_type_id, cats)
  loop
    v_order := 1;
    for v_item in select * from jsonb_array_elements(t.cats) loop
      v_slug := v_item ->> 0;
      v_name := v_item ->> 1;

      insert into public.categories (slug, name, sort_order)
      values (v_slug, v_name, v_order)
      on conflict (slug) do nothing;

      select id into v_cat_id from public.categories where slug = v_slug;

      insert into public.pos_type_categories (pos_type_id, category_id, sort_order)
      values (t.pos_type_id, v_cat_id, v_order)
      on conflict (pos_type_id, category_id) do nothing;

      v_order := v_order + 1;
    end loop;
  end loop;
end;
$$;

-- Verify
select
  (select count(*) from public.categories) as categories,
  (select count(*) from public.pos_type_categories) as assignments;
