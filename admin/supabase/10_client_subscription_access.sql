-- ============================================================================
-- Central POS — 10_client_subscription_access.sql
-- Lets the (session-less) POS client read the ACTIVE GCash QR, submit a manual
-- GCash payment proof, and check the status of its own submissions — all
-- WITHOUT ever activating a subscription. Only an administrator approving a
-- request (07_payment_requests.sql) activates a plan.
--
-- Run AFTER 01 -> 09. Idempotent — safe to re-run.
--
-- Why a migration: the POS client never holds a Supabase session (it stays
-- offline-first), so `to authenticated` policies are not enough. The plan
-- catalog is already public (06_releases.sql -> plans_select_public). What is
-- missing is (a) the QR, (b) proof upload, and (c) submission + status.
--
-- Security posture:
--   * submission always writes status='pending' with user_id = null for anon;
--     an admin links the row to a customer before approving (client_user_id).
--   * the status RPC returns only rows whose client_user_id matches the caller.
--   * the private payment-proofs bucket gains anon INSERT only under the
--     `anon/` prefix, with a 5 MB cap and image-only MIME allow-list.
--   * no payment gateway, webhook, or auto-approval exists anywhere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. system_settings.gcash_qr gains an `active` flag
--    Shape: {"url": "", "active": true}
--    Existing rows are upgraded in place; a re-run never reactivates a QR an
--    admin deliberately turned off.
-- ---------------------------------------------------------------------------
update public.system_settings
set value = value || jsonb_build_object('active', true)
where key = 'gcash_qr' and not (value ? 'active');

insert into public.system_settings (key, value, description)
values (
  'gcash_qr',
  '{"url": "", "active": true}'::jsonb,
  'GCash QR code image URL shown on the POS client subscription payment page.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. public_gcash_qr() — the ACTIVE QR, readable by anon. Returns a null URL
--    when the QR is deactivated or unset, so the client shows a clear
--    "not configured" notice instead of a stale/fake code.
-- ---------------------------------------------------------------------------
create or replace function public.public_gcash_qr()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_value  jsonb;
  v_active boolean;
  v_url    text;
begin
  select value into v_value from public.system_settings where key = 'gcash_qr';
  v_active := coalesce((v_value ->> 'active')::boolean, v_value is not null);
  v_url := nullif(btrim(coalesce(v_value ->> 'url', '')), '');
  return jsonb_build_object(
    'url', case when v_active then v_url else null end,
    'active', v_active
  );
end;
$$;

grant execute on function public.public_gcash_qr() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. submit_payment_request() — the ONLY way a client writes a payment proof.
--    SECURITY DEFINER so anon can insert; forces status='pending', pins the
--    amount to the plan's current price, and never touches subscriptions.
-- ---------------------------------------------------------------------------
create or replace function public.submit_payment_request(
  p_client_user_id  text,
  p_plan_id         text,
  p_reference_no    text,
  p_submitter_name  text default null,
  p_submitter_email text default null,
  p_business_name   text default null,
  p_notes           text default null,
  p_proof_path      text default null
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   public.subscription_plans;
  v_req    public.payment_requests;
  v_ref    text := btrim(p_reference_no);
  v_client text := nullif(btrim(p_client_user_id), '');
begin
  if v_client is null then
    raise exception 'missing client identifier';
  end if;
  if v_ref is null or length(v_ref) < 4 or length(v_ref) > 80 then
    raise exception 'Enter a valid GCash reference number (4 to 80 characters).';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id and active;
  if v_plan.id is null then
    raise exception 'That plan is no longer available. Refresh the page and choose an active plan.';
  end if;

  insert into public.payment_requests (
    user_id, client_user_id, submitter_name, submitter_email, business_name,
    plan_id, amount, currency, method, reference_no, notes, proof_path, status
  ) values (
    auth.uid(),
    v_client,
    nullif(btrim(p_submitter_name), ''),
    nullif(btrim(p_submitter_email), ''),
    nullif(btrim(p_business_name), ''),
    v_plan.id,
    v_plan.price,
    v_plan.currency,
    'gcash_qr',
    v_ref,
    nullif(btrim(p_notes), ''),
    nullif(btrim(p_proof_path), ''),
    'pending'
  )
  returning * into v_req;

  return v_req;
exception
  when unique_violation then
    raise exception 'That transaction reference has already been submitted.';
end;
$$;

grant execute on function public.submit_payment_request(text, text, text, text, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. client_payment_requests() — status of ONE client's submissions, matched
--    by client_user_id. Used by the client to reflect admin approval locally.
-- ---------------------------------------------------------------------------
create or replace function public.client_payment_requests(p_client_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_client text := nullif(btrim(p_client_user_id), '');
  v_rows   jsonb;
begin
  if v_client is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(t.x order by t.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      pr.created_at,
      jsonb_build_object(
        'id',                  pr.id,
        'reference_no',        pr.reference_no,
        'plan_id',             pr.plan_id,
        'plan_name',           sp.name,
        'duration_days',       sp.duration_days,
        'amount',              pr.amount,
        'status',              pr.status,
        'rejection_reason',    pr.rejection_reason,
        'reviewed_at',         pr.reviewed_at,
        'created_at',          pr.created_at,
        'expires_at',          s.expires_at,
        'subscription_status', s.status
      ) as x
    from public.payment_requests pr
    left join public.subscription_plans sp on sp.id = pr.plan_id
    left join public.subscriptions s on s.user_id = pr.user_id
    where pr.client_user_id = v_client
    order by pr.created_at desc
    limit 50
  ) t;

  return v_rows;
end;
$$;

grant execute on function public.client_payment_requests(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. payment-proofs storage — anon uploads allowed ONLY under the `anon/`
--    prefix, image-only, capped at 5 MB. Files stay private (the admin reads
--    them through short-lived signed URLs).
-- ---------------------------------------------------------------------------
drop policy if exists "payment_proofs_insert_anon" on storage.objects;
create policy "payment_proofs_insert_anon"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = 'anon'
  );

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'payment-proofs';

-- ---------------------------------------------------------------------------
-- 6. admin_delete_plan() — deletion is blocked while any subscription, payment,
--    or request still references the plan. Admins deactivate instead.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_plan(target_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_subs bigint := 0;
  v_pay  bigint := 0;
  v_req  bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select name into v_name from public.subscription_plans where id = target_plan;
  if v_name is null then
    raise exception 'plan not found';
  end if;

  select count(*) into v_subs from public.subscriptions where plan_id = target_plan;
  select count(*) into v_pay  from public.payments where plan_id = target_plan;
  select count(*) into v_req  from public.payment_requests where plan_id = target_plan;

  if v_subs > 0 or v_pay > 0 or v_req > 0 then
    raise exception 'Cannot delete "%" — % subscription(s), % payment(s), % request(s) reference it. Deactivate it instead.',
      v_name, v_subs, v_pay, v_req;
  end if;

  perform set_config('app.skip_audit', '1', true);
  delete from public.subscription_plans where id = target_plan;
  perform public.log_activity('plan.delete', 'subscription_plan', target_plan,
    'Deleted plan ' || v_name, jsonb_build_object('subscriptions', v_subs));
end;
$$;

grant execute on function public.admin_delete_plan(text) to authenticated;
