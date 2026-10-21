-- ============================================================================
-- 17_gcash_only.sql — make GCash the only payment method on the ledger and
-- link each ledger row back to the payment request (and its receipt image).
--
-- Run AFTER 16_workspace_uniqueness.sql. Idempotent — safe to re-run.
--
-- What this does
--   1. payments.payment_request_id — lets the admin ledger open the receipt
--      screenshot that was uploaded with the verified GCash request.
--   2. Backfills existing rows from the '[GCash ref …]' marker that
--      admin_approve_payment_request() already writes into payments.notes.
--   3. Re-creates admin_approve_payment_request() so new approvals set the link.
--   4. Drops the mock payment RPC and removes mock/demo payment rows.
--   5. Restricts payments.method to 'gcash_qr' (no cash/card/bank/mock values).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payments.payment_request_id — link the ledger to the verified request
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists payment_request_id uuid
    references public.payment_requests (id) on delete set null;

create index if not exists payments_payment_request_idx
  on public.payments (payment_request_id);

comment on column public.payments.payment_request_id is
  'The verified GCash request this ledger row came from; its proof object is the receipt.';

-- ---------------------------------------------------------------------------
-- 2. Backfill the link for rows created before this column existed.
--    admin_approve_payment_request() wrote: notes = '<notes> [GCash ref <ref>]'
-- ---------------------------------------------------------------------------
update public.payments p
set    payment_request_id = pr.id
from   public.payment_requests pr
where  p.payment_request_id is null
  and  pr.status = 'approved'
  and  p.notes is not null
  and  p.notes like '%[GCash ref ' || pr.reference_no || ']%';

-- ---------------------------------------------------------------------------
-- 3. admin_approve_payment_request — now records the request id on the ledger.
--    (Body unchanged apart from the new column in the INSERT.)
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

  insert into public.payments
    (user_id, subscription_id, plan_id, payment_request_id, reference, method, amount, paid_at, notes)
  values
    (v_req.user_id, v_sub.id, v_plan.id, v_req.id, v_ref, 'gcash_qr',
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
-- 4. Remove the mock payment flow.
--    admin_extend_subscription() / admin_change_plan() / admin_cancel_subscription()
--    remain — they adjust access without writing a fake payment row.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_record_mock_payment(uuid, text, text, numeric, text, boolean);

-- Demo/simulated ledger rows: nothing outside verification should exist here.
delete from public.payments
where  reference like 'MOCK-%'
   or  method in ('mock_card', 'mock_gcash', 'mock_bank');

-- Any manual row that recorded a real GCash payment under the old 'cash' value.
update public.payments set method = 'gcash_qr' where method = 'cash';

-- ---------------------------------------------------------------------------
-- 5. GCash is the only method on the ledger.
-- ---------------------------------------------------------------------------
alter table public.payments alter column method set default 'gcash_qr';
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check check (method = 'gcash_qr');
