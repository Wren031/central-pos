-- ============================================================================
-- Central POS — Admin Dashboard: 01_schema.sql
-- Tables, constraints, indexes, triggers.
-- Run FIRST in the Supabase SQL editor (order: 01 -> 02 -> 03 -> 04).
-- ============================================================================

-- gen_random_uuid() is built in; pgcrypto only needed for crypt()/gen_salt()
-- used by the demo seed (04_seed.sql).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (admins and, later, POS customers)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  full_name          text not null default '',
  business_name      text,
  contact_number     text,
  address            text,
  role               text not null default 'customer' check (role in ('admin', 'customer')),
  status             text not null default 'active'   check (status in ('active', 'suspended')),
  notification_prefs jsonb not null default '{"expiration":true,"reminders":true,"marketing":false}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Upgrade a pre-existing minimal profiles table (id/email/full_name/role/...)
-- in place so this script is safe to run on an initialized project.
alter table public.profiles add column if not exists business_name text;
alter table public.profiles add column if not exists contact_number text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists notification_prefs jsonb;
alter table public.profiles alter column role set default 'customer';
alter table public.profiles alter column status set default 'active';
alter table public.profiles alter column full_name set default '';
alter table public.profiles alter column notification_prefs set default
  '{"expiration":true,"reminders":true,"marketing":false}'::jsonb;
update public.profiles set role = 'customer' where role is null;
update public.profiles set status = 'active' where status is null;
update public.profiles set notification_prefs =
  '{"expiration":true,"reminders":true,"marketing":false}'::jsonb where notification_prefs is null;
alter table public.profiles alter column role set not null;
alter table public.profiles alter column status set not null;
alter table public.profiles alter column notification_prefs set not null;

-- FK to auth.users (skip when one already exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- CHECK constraints (present for freshly created table; add for upgraded ones)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('admin', 'customer'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check check (status in ('active', 'suspended'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever an auth user signs up (POS or admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, business_name, contact_number)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'contact_number'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- pos_types — supported business types (ids match the POS client taxonomy)
-- ---------------------------------------------------------------------------
create table if not exists public.pos_types (
  id          text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name        text not null,
  tagline     text,
  description text,
  icon        text,
  category    text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.pos_types add column if not exists category text;

create index if not exists pos_types_active_idx on public.pos_types (active, sort_order);

drop trigger if exists pos_types_set_updated_at on public.pos_types;
create trigger pos_types_set_updated_at
  before update on public.pos_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories — global product-category catalog (admin-managed).
-- A POS workspace loads the categories assigned to its pos_type through the
-- pos_type_categories junction below when the device is online / syncing.
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

-- ---------------------------------------------------------------------------
-- pos_type_categories — many-to-many assignment of categories to POS types.
-- sort_order is per POS type so each workspace can order its own list.
-- ---------------------------------------------------------------------------
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
-- subscription_plans — trial / weekly / monthly / yearly (editable in Settings)
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id            text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name          text not null,
  description   text,
  duration_days int not null check (duration_days > 0),
  price         numeric(10,2) not null default 0 check (price >= 0),
  currency      text not null default 'PHP',
  is_trial      boolean not null default false,
  active        boolean not null default true,
  features      jsonb not null default '[]'::jsonb,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- stores — registered stores owned by profiles
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  pos_type   text not null references public.pos_types (id),
  email      text,
  phone      text,
  address    text,
  status     text not null default 'active' check (status in ('active', 'suspended')),
  onboarded  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stores_owner_idx on public.stores (owner_id);
create index if not exists stores_pos_type_idx on public.stores (pos_type);
create index if not exists stores_status_idx on public.stores (status);

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions — ONE current subscription row per user (mirrors the POS
-- client's local model so future device sync stays trivial)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles (id) on delete cascade,
  plan_id     text not null references public.subscription_plans (id),
  status      text not null default 'trial'
                check (status in ('trial', 'active', 'expired', 'cancelled')),
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  price_paid  numeric(10,2) not null default 0 check (price_paid >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_expires_at_idx on public.subscriptions (expires_at);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — MOCK payments only (no gateway). Reference is the transaction id.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id         text references public.subscription_plans (id),
  reference       text not null unique,
  method          text not null default 'gcash_qr'
                    check (method = 'gcash_qr'),
  amount          numeric(10,2) not null check (amount >= 0),
  currency        text not null default 'PHP',
  status          text not null default 'succeeded'
                    check (status in ('succeeded', 'pending', 'failed', 'refunded')),
  paid_at         timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_plan_idx on public.payments (plan_id);

-- ---------------------------------------------------------------------------
-- activity_logs — append-only audit trail (no UPDATE/DELETE policies ever)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  summary    text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_id);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity, entity_id);

-- ---------------------------------------------------------------------------
-- system_settings — key/value JSON configuration
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pos_sales — FORWARD-COMPATIBLE foundation for offline POS sale sync.
-- Devices queue sales while offline and push them here on reconnect; the
-- unique idempotency_key guarantees a retried push never double-counts.
-- ---------------------------------------------------------------------------
create table if not exists public.pos_sales (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  store_id        uuid not null references public.stores (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  receipt_no      text not null,
  total           numeric(12,2) not null default 0,
  sold_at         timestamptz not null,
  payload         jsonb not null default '{}'::jsonb,
  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists pos_sales_store_idx on public.pos_sales (store_id);
create index if not exists pos_sales_user_idx on public.pos_sales (user_id);
create index if not exists pos_sales_sold_at_idx on public.pos_sales (sold_at desc);
