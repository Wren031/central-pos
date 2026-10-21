# Central POS — Admin Dashboard

Subscription management console for the Central POS platform. A standalone
React + Vite app that talks to **Supabase** (Auth + PostgreSQL) — completely
separate from the customer POS workspace in `../client`.

**Stack:** React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui
(Radix primitives, Lucide icons) · Recharts · @supabase/supabase-js ·
react-router-dom 7 · sonner

## Features

- **Admin authentication** — Supabase Auth email/password, protected routes,
  role check enforced in the database (RLS), not just the UI.
- **Dashboard** — total users, stores, active subscriptions, free trials,
  expired subscriptions, revenue, plus charts (revenue trend, plan
  distribution, signups, status donut) and an "expiring soon" watchlist.
- **Users** — search, filter, view details, activate/suspend (suspension also
  suspends the user's stores via one audited RPC).
- **Stores** — owners, contacts, POS type, status; suspend/activate.
- **Subscriptions** — 30-day trials and weekly/monthly/yearly plans; extend,
  change plan, cancel, record renewals; expiry countdowns.
- **POS types** — manage the supported business types (BBQ, retail, grocery,
  restaurant, cafe, pharmacy, general merchandise) and add new ones.
- **GCash Payments** — verify customer-submitted GCash transfers (reference
  number + receipt screenshot), open the receipt image, and browse the payment
  ledger (succeeded/pending/failed/refunded). GCash is the only payment method;
  no gateway is connected and nothing activates without admin approval.
- **Subscription Plans** — a dedicated page for the plan catalogue (duration,
  price, trial flag, features, active state).
- **Landing page** (`/landing`) — public marketing site: hero, features,
  supported POS types, subscription plans, how-it-works, installer downloads
  (published releases only), FAQ, and footer. "Get Started" links to the POS
  client's registration (`VITE_POS_APP_URL`); the catch-all route serves it.
- **Downloads** — publish POS installers (Android APK / Windows EXE) to the
  public `pos-releases` storage bucket with version, file size, release notes,
  and draft/published status. Only published releases appear on the landing
  page. No release is seeded — create one after uploading a real build.
- **Activity logs** — append-only audit trail (automatic DB triggers + RPC
  logging).
- **Settings** — system configuration, subscription plan pricing/durations,
  admin profile, and password change.

## Setup

### 1. Seed the database

**Option A — one command** (uses the Supabase Management API; get a token at
https://supabase.com/dashboard/account/tokens, revoke it afterwards):

```bash
node supabase/seed.mjs <SUPABASE_ACCESS_TOKEN>        # default project: rkpetffnstnmwwaevzmd
node supabase/run-statements.mjs <TOKEN> supabase/03_functions.sql   # per-statement mode (better error reporting)
```

**Option B — SQL Editor** (Supabase dashboard → SQL Editor), run **in this
order**:

1. `supabase/01_schema.sql` — tables, indexes, triggers
2. `supabase/02_rls.sql` — Row Level Security policies + `is_admin()`
3. `supabase/03_functions.sql` — admin RPCs, audit logging, `admin_dashboard_stats()`,
   `verify_subscription()`, `promote_to_admin()`
4. `supabase/04_seed.sql` — plans, POS types, settings, and realistic demo data
   (18 customers, 18 stores, subscriptions, logs)
5. `supabase/05_categories_migration.sql` — global `categories` catalog +
   `pos_type_categories` assignments
6. `supabase/06_releases.sql` — `pos_releases` (installer releases), anon
   read policies for landing data, and the public `pos-releases` storage bucket
7. `supabase/07_payment_requests.sql`, `supabase/08_email_verification.sql` —
   GCash payment requests and email-verification support
8. `supabase/09_pos_type_public_read.sql` — lets the session-less POS client
   read active POS types + their categories (writes stay admin-only)
9. `supabase/10_client_subscription_access.sql` — lets the session-less POS
   client read the active GCash QR, submit manual payment proofs (always
   pending), and check its own submission status
10. `supabase/11…16_*.sql` — account status, suspend guards, account deletion,
    barcodes, client store config, workspace uniqueness
11. `supabase/17_gcash_only.sql` — links `payments` to the verified
    `payment_requests` row (so each ledger entry can open its receipt), makes
    GCash the only payment method, and removes the mock payment RPC + demo rows

The scripts are idempotent — safe to re-run after a partial failure.

### 2. Sign in with the seeded admin account

`04_seed.sql` already bootstraps your admin:

| Field | Value |
|---|---|
| Email | `javierrenren1@gmail.com` |
| Password | `monteroTzy31` |

**Change this password after your first sign-in** (Settings → Admin profile →
Change password), then delete the "Admin bootstrap" block at the top of
`04_seed.sql` so the credential doesn't linger in the repo.

To add *another* admin later: Authentication → Users → Add user, then run
`select public.promote_to_admin('other@email.com');`.

### 3. Configure environment

```bash
cd admin
cp .env.example .env.local
```

Fill `.env.local` (Supabase → Settings → API):

```
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # or the legacy anon key
# Optional: POS client base URL. Leave unset in production when the client is
# served from the site root of the same Vercel project.
# VITE_POS_APP_URL=https://app.example.com
```

> **Security:** only the publishable/anon key belongs in the frontend. Every
> table is locked down by RLS; admin mutations re-check `is_admin()` inside
> SECURITY DEFINER RPCs. **Never** put the `service_role` key in any `VITE_`
> variable or in this repo.

### 4. Run

```bash
npm install
npm run dev        # http://localhost:5174/admin/
```

Other scripts: `npm run build` (typecheck + production build),
`npm run lint`, `npm run preview`.

Demo customer logins (created by the seed): `juan@bbqhouse.ph` /
`demo12345`, `maria@tindahanmaria.ph` / `demo12345`, … — these are
**customer** accounts and cannot sign in to the admin console.

## Troubleshooting

- **"relation already exists" / pre-existing `profiles` table** — `01_schema.sql`
  is additive: it upgrades a minimal `profiles` table (id/email/full_name/role)
  in place by adding the missing columns (`business_name`, `contact_number`,
  `address`, `status`, `notification_prefs`) plus FK/CHECK constraints. Safe to
  run on an initialized project.
- **Seed fails on `auth.users` insert** — the demo-customer seed inserts
  minimal `auth.users` rows directly (a standard Supabase seeding technique).
  If your GoTrue version rejects it, create the demo users manually in
  Authentication → Users, then re-run only the non-`auth.users` parts of
  `04_seed.sql`, or skip the demo data entirely — the admin app works with
  empty tables.
- **`Could not find the table 'public.…' in the schema cache`** — the SQL has
  not been applied yet (or only partially). Re-run the six files in order.

## Architecture notes

### Security model

| Layer | Mechanism |
|---|---|
| Authentication | Supabase Auth (email/password), session persisted by supabase-js |
| Authorization | RLS policies on every table; `is_admin()` security-definer helper checks `profiles.role` |
| Mutations | Admin actions go through SECURITY DEFINER RPCs (`admin_set_user_status`, `admin_extend_subscription`, `admin_change_plan`, `admin_cancel_subscription`, `admin_approve_payment_request`, `admin_delete_plan`) that re-check admin rights and write audit rows atomically |
| Client-facing RPCs | The session-less POS client calls `public_gcash_qr()`, `submit_payment_request()`, and `client_payment_requests()` (anon-executable SECURITY DEFINER). Submission always writes `status='pending'` with `user_id=null`; only an admin approval activates a plan |
| Audit | DB triggers on `profiles`, `stores`, `subscriptions`, `payments`, `pos_types`, `subscription_plans`, `system_settings` + explicit RPC logging. `activity_logs` is append-only (no update/delete policies) |
| Role escalation | `profiles_protect` trigger blocks role/email/status changes except by admins; `promote_to_admin()` is the only path to admin |

### Data model

- `profiles` — one per auth user (`role`: `admin` | `customer`), auto-created
  by the `on_auth_user_created` trigger.
- `stores` — owned by a profile; typed by `pos_types`.
- `subscriptions` — **one current row per user** (mirrors the POS client's
  local Dexie model so future device sync stays trivial). Renewal history
  lives in `payments`.
- `subscription_plans` — editable on the Subscription Plans page (`trial` 30d ₱0, `weekly` 7d
  ₱99, `monthly` 30d ₱299, `yearly` 365d ₱2,999 by default). Plans can be
  created/edited/activated/deactivated at any time; deleting a plan is blocked
  while any subscription, payment, or request references it
  (`admin_delete_plan` — deactivate instead).
- `system_settings.gcash_qr` — `{"url","active"}`; the POS client reads only the
  active QR via `public_gcash_qr()`.
- `payments` — the GCash ledger only. Each row is written by
  `admin_approve_payment_request()`, which also sets `payment_request_id` so the
  receipt screenshot stays reachable. `reference` is the transaction id.
- `pos_sales` — forward-compatible table for offline POS sale sync: a device
  queues sales offline and pushes them here on reconnect with a unique
  `idempotency_key` (retries can never double-count). RLS allows a device to
  insert/read only its own store's sales.

### POS ↔ Supabase integration

The `client/` app is offline-first (Dexie/IndexedDB) and holds **no** Supabase
session. These pieces are now wired to Supabase:

- **Plans** — read live from `subscription_plans` (active rows) and cached
  locally; no plan data is hardcoded on the client.
- **GCash QR** — read from `public_gcash_qr()` (active only).
- **Manual payments** — `submit_payment_request()` (online-only, always
  pending); `client_payment_requests()` mirrors admin approval/rejection back so
  the local subscription activates only after approval.

Still planned:

1. Replace local auth with `supabase.auth` (profiles already auto-create).
2. On app start and on reconnect, call
   `supabase.rpc('verify_subscription')` → `{ status, can_sell, expires_at }`.
3. Push queued offline sales with
   `supabase.from('pos_sales').upsert(..., { onConflict: 'idempotency_key' })`.
4. Keep the local Dexie store as the offline cache; treat Supabase as the
   source of truth for users, stores, and sales.

`verify_subscription()` only lets a signed-in device verify **its own** user
(or an admin verify anyone), and subscription rows have **no** client-writable
policies — a POS device can never grant itself a subscription.

## Ports

| App | URL |
|---|---|
| Admin dashboard (this app) | http://localhost:5174/admin/ |
| Customer POS (`../client`) | http://localhost:5173 |
