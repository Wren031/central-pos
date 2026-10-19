-- ============================================================================
-- Central POS — 12_suspend_payment_guard.sql
-- Defense in depth: a SUSPENDED account must not be able to submit a new GCash
-- payment proof even if the client block is bypassed.
--
-- Re-declares submit_payment_request() (from 10_client_subscription_access.sql)
-- with the suspension check added. Everything else is identical.
--
-- DEPENDENCIES: 07_payment_requests.sql (payment_requests, subscription_plans)
-- and 10_client_subscription_access.sql (the original function), plus
-- 11_account_status.sql (is_account_suspended). Run AFTER 10 and 11.
--
-- Deliberately SEPARATE from 11_account_status.sql so that the account-status
-- RPC — the piece the client actually needs — can be applied on its own without
-- being blocked by an incomplete payment schema.
--
-- Idempotent — safe to re-run.
-- ============================================================================

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

  -- Server-side access restriction: a suspended account cannot submit payments.
  if public.is_account_suspended(v_client) then
    raise exception 'Your account has been suspended. Please contact the administrator for assistance.';
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
