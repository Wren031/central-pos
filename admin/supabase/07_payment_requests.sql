-- ============================================================================
-- Central POS — Admin Dashboard: 07_payment_requests.sql
-- GCash QR manual payments: a customer scans the admin-managed GCash QR,
-- pays in the GCash app, submits a transaction reference + receipt image, and
-- an admin approves or rejects it. NOTHING is activated by the customer —
-- only admin_approve_payment_request() extends a subscription.
--
-- No payment gateway is integrated anywhere (no PayMongo/Xendit/GCash API,
-- no webhooks). This is manual, proof-based verification only.
--
-- Run AFTER 06_releases.sql. Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payments.method — allow the manual GCash QR method on the audit ledger
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('mock_card', 'mock_gcash', 'mock_bank', 'cash', 'gcash_qr'));

-- ---------------------------------------------------------------------------
-- 2. payment_requests — one row per submitted proof awaiting verification
--    user_id is nullable: a submission may arrive from an offline POS device
--    that the admin links to a Supabase account before approving.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles (id) on delete set null,
  client_user_id   text,
  submitter_name   text,
  submitter_email  text,
  business_name    text,
  plan_id          text references public.subscription_plans (id),
  amount           numeric(10,2) not null default 0 check (amount >= 0),
  currency         text not null default 'PHP',
  method           text not null default 'gcash_qr' check (method in ('gcash_qr')),
  reference_no     text not null check (length(btrim(reference_no)) between 4 and 80),
  notes            text,
  proof_path       text,
  proof_url        text,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists payment_requests_user_idx
  on public.payment_requests (user_id);
create index if not exists payment_requests_status_idx
  on public.payment_requests (status, created_at desc);
create index if not exists payment_requests_created_idx
  on public.payment_requests (created_at desc);

-- A GCash reference number is unique per transaction. A rejected request
-- frees its reference again so the customer can correct and resubmit.
create unique index if not exists payment_requests_reference_key
  on public.payment_requests (reference_no)
  where status <> 'rejected';

drop trigger if exists payment_requests_set_updated_at on public.payment_requests;
create trigger payment_requests_set_updated_at
  before update on public.payment_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — owner reads/submits own; ONLY admins can review or delete.
--    A customer can never set status/review fields (insert is pinned to
--    'pending'); no update/delete policy for customers exists on purpose.
-- ---------------------------------------------------------------------------
alter table public.payment_requests enable row level security;

drop policy if exists "payment_requests_select_own_or_admin" on public.payment_requests;
create policy "payment_requests_select_own_or_admin"
  on public.payment_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payment_requests_insert_own_or_admin" on public.payment_requests;
create policy "payment_requests_insert_own_or_admin"
  on public.payment_requests for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
  );

drop policy if exists "payment_requests_update_admin" on public.payment_requests;
create policy "payment_requests_update_admin"
  on public.payment_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "payment_requests_delete_admin" on public.payment_requests;
create policy "payment_requests_delete_admin"
  on public.payment_requests for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Audit trail (append-only; mirrors the other admin-managed entities)
-- ---------------------------------------------------------------------------
create or replace function public.audit_payment_requests()
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
    perform public.log_activity('payment_request.create', 'payment_request', new.id::text,
      'GCash payment submitted (ref ' || new.reference_no || ')',
      jsonb_build_object('amount', new.amount, 'plan_id', new.plan_id, 'method', new.method));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.log_activity('payment_request.' || new.status, 'payment_request', new.id::text,
      'GCash payment ' || new.reference_no || ' ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'reason', new.rejection_reason));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('payment_request.delete', 'payment_request', old.id::text,
      'Deleted GCash payment ' || old.reference_no, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_payment_requests on public.payment_requests;
create trigger audit_payment_requests
  after insert or update or delete on public.payment_requests
  for each row execute function public.audit_payment_requests();

-- ---------------------------------------------------------------------------
-- 5. admin_link_payment_request — attach an offline submission to a customer
-- ---------------------------------------------------------------------------
create or replace function public.admin_link_payment_request(
  request_id  uuid,
  target_user uuid
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'customer not found';
  end if;

  perform set_config('app.skip_audit', '1', true);

  update public.payment_requests
  set user_id = target_user
  where id = request_id
  returning * into v_req;

  if not found then
    raise exception 'payment request not found';
  end if;

  perform public.log_activity('payment_request.link', 'payment_request', v_req.id::text,
    'Linked GCash payment ' || v_req.reference_no || ' to a customer',
    jsonb_build_object('user_id', target_user));

  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. admin_approve_payment_request — THE ONLY PATH that activates / extends a
--    subscription from a GCash payment. Locks the row, re-checks admin, writes
--    a payments ledger row, and audits everything.
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_payment_request(
  request_id uuid,
  reason     text default null
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.payment_requests;
  v_plan    public.subscription_plans;
  v_sub     public.subscriptions;
  v_payment public.payments;
  v_ref     text;
  v_base    timestamptz;
  v_notes   text;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select * into v_req
  from public.payment_requests
  where id = request_id
  for update;

  if v_req.id is null then
    raise exception 'payment request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'payment request is already %', v_req.status;
  end if;
  if v_req.user_id is null then
    raise exception 'link this request to a customer account before approving';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_req.plan_id and active;
  if v_plan.id is null then
    raise exception 'unknown or inactive plan: %', v_req.plan_id;
  end if;

  perform set_config('app.skip_audit', '1', true);

  select * into v_sub
  from public.subscriptions
  where user_id = v_req.user_id
  for update;

  v_base := greatest(now(), coalesce(v_sub.expires_at, now()));

  if v_sub.id is null then
    insert into public.subscriptions (user_id, plan_id, status, started_at, expires_at, price_paid)
    values (v_req.user_id, v_plan.id,
            case when v_plan.is_trial then 'trial' else 'active' end,
            now(), v_base + make_interval(days => v_plan.duration_days), v_plan.price)
    returning * into v_sub;
  else
    update public.subscriptions
    set plan_id    = v_plan.id,
        started_at = now(),
        expires_at = v_base + make_interval(days => v_plan.duration_days),
        price_paid = v_plan.price,
        status     = case when v_plan.is_trial then 'trial' else 'active' end
    where id = v_sub.id
    returning * into v_sub;
  end if;

  v_ref := 'GCASH-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_notes := btrim(
    coalesce(v_req.notes, '') ||
    case when v_req.reference_no is not null
         then ' [GCash ref ' || v_req.reference_no || ']'
         else '' end
  );

  insert into public.payments (user_id, subscription_id, plan_id, reference, method, amount, paid_at, notes)
  values (v_req.user_id, v_sub.id, v_plan.id, v_ref, 'gcash_qr',
          v_req.amount, now(), nullif(v_notes, ''))
  returning * into v_payment;

  update public.payment_requests
  set status           = 'approved',
      reviewed_by      = auth.uid(),
      reviewed_at      = now(),
      rejection_reason = null
  where id = v_req.id
  returning * into v_req;

  perform public.log_activity('payment_request.approve', 'payment_request', v_req.id::text,
    'Approved GCash payment ' || v_req.reference_no || ' — activated ' || v_plan.name,
    jsonb_build_object('user_id', v_req.user_id, 'plan_id', v_plan.id,
                       'amount', v_req.amount, 'payment_id', v_payment.id,
                       'reference_no', v_req.reference_no, 'reason', reason));

  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. admin_reject_payment_request — records a reason; NO subscription change.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reject_payment_request(
  request_id uuid,
  reason     text
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  if coalesce(btrim(reason), '') = '' then
    raise exception 'a rejection reason is required';
  end if;

  perform set_config('app.skip_audit', '1', true);

  select * into v_req
  from public.payment_requests
  where id = request_id
  for update;

  if v_req.id is null then
    raise exception 'payment request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'payment request is already %', v_req.status;
  end if;

  update public.payment_requests
  set status           = 'rejected',
      rejection_reason = btrim(reason),
      reviewed_by      = auth.uid(),
      reviewed_at      = now()
  where id = v_req.id
  returning * into v_req;

  perform public.log_activity('payment_request.reject', 'payment_request', v_req.id::text,
    'Rejected GCash payment ' || v_req.reference_no,
    jsonb_build_object('user_id', v_req.user_id, 'amount', v_req.amount,
                       'reference_no', v_req.reference_no, 'reason', v_req.rejection_reason));

  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Storage buckets
--    payment-proofs — PRIVATE receipts; readable by owner + admins only.
--    payment-assets — PUBLIC admin-managed images (the GCash QR code).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('payment-assets', 'payment-assets', true)
on conflict (id) do update set public = true;

-- payment-proofs: customers upload under their own uid folder; admins see all.
drop policy if exists "payment_proofs_select_own_or_admin" on storage.objects;
create policy "payment_proofs_select_own_or_admin"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-proofs' and (owner = auth.uid() or public.is_admin()));

drop policy if exists "payment_proofs_insert_own_or_admin" on storage.objects;
create policy "payment_proofs_insert_own_or_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "payment_proofs_update_admin" on storage.objects;
create policy "payment_proofs_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin())
  with check (bucket_id = 'payment-proofs' and public.is_admin());

drop policy if exists "payment_proofs_delete_admin" on storage.objects;
create policy "payment_proofs_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- payment-assets: world-readable images; only admins write.
drop policy if exists "payment_assets_public_read" on storage.objects;
create policy "payment_assets_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'payment-assets');

drop policy if exists "payment_assets_admin_insert" on storage.objects;
create policy "payment_assets_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'payment-assets' and public.is_admin());

drop policy if exists "payment_assets_admin_update" on storage.objects;
create policy "payment_assets_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'payment-assets' and public.is_admin())
  with check (bucket_id = 'payment-assets' and public.is_admin());

drop policy if exists "payment_assets_admin_delete" on storage.objects;
create policy "payment_assets_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'payment-assets' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. Default system setting for the GCash QR image (edited in Settings).
--    Empty by default — the client shows a "not configured" note, never a
--    fabricated QR code.
-- ---------------------------------------------------------------------------
insert into public.system_settings (key, value, description)
values (
  'gcash_qr',
  '{"url": ""}'::jsonb,
  'GCash QR code image URL shown on the POS client subscription payment page.'
)
on conflict (key) do nothing;
