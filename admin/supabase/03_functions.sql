-- ============================================================================
-- Central POS — Admin Dashboard: 03_functions.sql
-- Run AFTER 02_rls.sql.
--
-- Every state-changing admin operation is a SECURITY DEFINER RPC that
-- re-checks is_admin() inside the database and writes an audit row. The
-- frontend is never trusted for authorization.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- log_activity — single write path into the append-only audit trail
-- ---------------------------------------------------------------------------
create or replace function public.log_activity(
  p_action    text,
  p_entity    text,
  p_entity_id text,
  p_summary   text,
  p_metadata  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs (actor_id, action, entity, entity_id, summary, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers — automatic logging of admin-driven changes.
-- Skipped when app.skip_audit is set (RPCs log richer rows themselves) and
-- for system/seed writes (no authenticated actor).
-- ---------------------------------------------------------------------------
create or replace function public.audit_profiles()
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
    perform public.log_activity('user.create', 'profile', new.id::text,
      'Created user ' || coalesce(nullif(new.full_name, ''), new.email),
      jsonb_build_object('email', new.email, 'role', new.role));
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      perform public.log_activity('user.status_changed', 'profile', new.id::text,
        'User ' || coalesce(nullif(new.full_name, ''), new.email) || ' ' || new.status,
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if old.role is distinct from new.role then
      perform public.log_activity('user.role_changed', 'profile', new.id::text,
        'Role of ' || new.email || ' changed to ' || new.role,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update on public.profiles
  for each row execute function public.audit_profiles();

create or replace function public.audit_stores()
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
    perform public.log_activity('store.create', 'store', new.id::text,
      'Registered store ' || new.name,
      jsonb_build_object('owner_id', new.owner_id, 'pos_type', new.pos_type));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.log_activity('store.status_changed', 'store', new.id::text,
      'Store ' || new.name || ' ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('store.delete', 'store', old.id::text,
      'Deleted store ' || old.name, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_stores on public.stores;
create trigger audit_stores
  after insert or update or delete on public.stores
  for each row execute function public.audit_stores();

create or replace function public.audit_subscriptions()
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
    perform public.log_activity('subscription.create', 'subscription', new.id::text,
      'Created ' || new.plan_id || ' subscription (expires ' || new.expires_at::date || ')',
      jsonb_build_object('user_id', new.user_id, 'plan_id', new.plan_id, 'expires_at', new.expires_at));
  elsif tg_op = 'UPDATE' then
    if old.plan_id is distinct from new.plan_id
       or old.expires_at is distinct from new.expires_at
       or old.status is distinct from new.status then
      perform public.log_activity('subscription.updated', 'subscription', new.id::text,
        'Subscription for user updated',
        jsonb_build_object(
          'user_id', new.user_id,
          'plan', jsonb_build_object('from', old.plan_id, 'to', new.plan_id),
          'status', jsonb_build_object('from', old.status, 'to', new.status),
          'expires_at', jsonb_build_object('from', old.expires_at, 'to', new.expires_at)));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity('subscription.delete', 'subscription', old.id::text,
      'Deleted subscription', jsonb_build_object('user_id', old.user_id));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_subscriptions on public.subscriptions;
create trigger audit_subscriptions
  after insert or update or delete on public.subscriptions
  for each row execute function public.audit_subscriptions();

create or replace function public.audit_payments()
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
    perform public.log_activity('payment.recorded', 'payment', new.id::text,
      'Recorded ' || new.status || ' payment ' || new.reference || ' (' || new.amount || ' ' || new.currency || ')',
      jsonb_build_object('user_id', new.user_id, 'plan_id', new.plan_id, 'method', new.method, 'amount', new.amount));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.log_activity('payment.status_changed', 'payment', new.id::text,
      'Payment ' || new.reference || ' marked ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('payment.delete', 'payment', old.id::text,
      'Deleted payment ' || old.reference, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.audit_payments();

create or replace function public.audit_pos_types()
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
    perform public.log_activity('pos_type.create', 'pos_type', new.id,
      'Created POS type ' || new.name, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    perform public.log_activity('pos_type.update', 'pos_type', new.id,
      'Updated POS type ' || new.name,
      jsonb_build_object('active', jsonb_build_object('from', old.active, 'to', new.active)));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('pos_type.delete', 'pos_type', old.id,
      'Deleted POS type ' || old.name, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_pos_types on public.pos_types;
create trigger audit_pos_types
  after insert or update or delete on public.pos_types
  for each row execute function public.audit_pos_types();

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

-- ---------------------------------------------------------------------------
-- admin_delete_category — delete a category with a product-usage safeguard.
-- If a products table exists and references the category, deletion is blocked
-- so live product data is never orphaned.
-- ---------------------------------------------------------------------------
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

  -- Forward-compatible guard: the POS client's products table (when present)
  -- references categories. Block deletion while products still use it.
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

create or replace function public.audit_plans()
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
    perform public.log_activity('plan.create', 'subscription_plan', new.id,
      'Created plan ' || new.name || ' (' || new.duration_days || 'd, ' || new.price || ')',
      jsonb_build_object('duration_days', new.duration_days, 'price', new.price));
  elsif tg_op = 'UPDATE' then
    perform public.log_activity('plan.update', 'subscription_plan', new.id,
      'Updated plan ' || new.name,
      jsonb_build_object(
        'price', jsonb_build_object('from', old.price, 'to', new.price),
        'duration_days', jsonb_build_object('from', old.duration_days, 'to', new.duration_days),
        'active', jsonb_build_object('from', old.active, 'to', new.active)));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('plan.delete', 'subscription_plan', old.id,
      'Deleted plan ' || old.name, '{}'::jsonb);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_plans on public.subscription_plans;
create trigger audit_plans
  after insert or update or delete on public.subscription_plans
  for each row execute function public.audit_plans();

create or replace function public.audit_settings()
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
    perform public.log_activity('setting.create', 'system_setting', new.key,
      'Set configuration ' || new.key, jsonb_build_object('value', new.value));
  elsif tg_op = 'UPDATE' then
    perform public.log_activity('setting.update', 'system_setting', new.key,
      'Updated configuration ' || new.key,
      jsonb_build_object('from', old.value, 'to', new.value));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_settings on public.system_settings;
create trigger audit_settings
  after insert or update on public.system_settings
  for each row execute function public.audit_settings();

-- ---------------------------------------------------------------------------
-- admin_dashboard_stats — one round trip for all dashboard numbers
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_result  jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'customers',           (select count(*) from public.profiles where role = 'customer'),
        'admins',              (select count(*) from public.profiles where role = 'admin'),
        'suspended_users',     (select count(*) from public.profiles where status = 'suspended'),
        'stores',              (select count(*) from public.stores),
        'active_subscriptions',(select count(*) from public.subscriptions where status = 'active' and expires_at > v_now),
        'trials',              (select count(*) from public.subscriptions where status = 'trial' and expires_at > v_now),
        'expiring_soon',       (select count(*) from public.subscriptions
                                  where status in ('active','trial')
                                    and expires_at > v_now
                                    and expires_at <= v_now + interval '7 days'),
        'expired',             (select count(*) from public.subscriptions
                                  where status = 'expired'
                                     or (status in ('active','trial') and expires_at <= v_now)),
        'revenue',             (select coalesce(sum(amount), 0) from public.payments where status = 'succeeded'),
        'revenue_30d',         (select coalesce(sum(amount), 0) from public.payments
                                  where status = 'succeeded' and paid_at >= v_now - interval '30 days'),
        'payments',            (select count(*) from public.payments),
        'sales_synced',        (select count(*) from public.pos_sales)
      )
    ),
    'revenue_by_month', (
      select coalesce(jsonb_agg(t.x order by t.x ->> 'month'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'month', to_char(m.month, 'YYYY-MM'),
                 'revenue', coalesce(sum(p.amount), 0)
               ) as x
        from generate_series(
               date_trunc('month', v_now) - interval '11 months',
               date_trunc('month', v_now),
               interval '1 month'
             ) as m(month)
        left join public.payments p
          on p.status = 'succeeded'
         and p.paid_at >= m.month
         and p.paid_at <  m.month + interval '1 month'
        group by m.month
      ) t
    ),
    'signups_by_month', (
      select coalesce(jsonb_agg(t.x order by t.x ->> 'month'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'month', to_char(m.month, 'YYYY-MM'),
                 'count', count(pr.id)
               ) as x
        from generate_series(
               date_trunc('month', v_now) - interval '11 months',
               date_trunc('month', v_now),
               interval '1 month'
             ) as m(month)
        left join public.profiles pr
          on pr.role = 'customer'
         and pr.created_at >= m.month
         and pr.created_at <  m.month + interval '1 month'
        group by m.month
      ) t
    ),
    'plans', (
      select coalesce(jsonb_agg(t.x order by t.x ->> 'sort_order'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'plan_id', sp.id,
                 'name', sp.name,
                 'sort_order', sp.sort_order,
                 'subscribers', count(s.id),
                 'revenue', coalesce((
                   select sum(p.amount) from public.payments p
                   where p.plan_id = sp.id and p.status = 'succeeded'
                 ), 0)
               ) as x
        from public.subscription_plans sp
        left join public.subscriptions s
          on s.plan_id = sp.id
         and s.status in ('trial','active')
         and s.expires_at > v_now
        group by sp.id, sp.name, sp.sort_order
      ) t
    ),
    'statuses', (
      select coalesce(jsonb_agg(t.x), '[]'::jsonb)
      from (
        select jsonb_build_object('status', s.status, 'count', count(*)) as x
        from public.subscriptions s
        group by s.status
      ) t
    ),
    'expiring_soon_list', (
      select coalesce(jsonb_agg(t.x order by t.x ->> 'expires_at'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'user_id', s.user_id,
                 'full_name', pr.full_name,
                 'email', pr.email,
                 'plan_id', s.plan_id,
                 'expires_at', s.expires_at,
                 'days_left', floor(extract(epoch from (s.expires_at - v_now)) / 86400)
               ) as x
        from public.subscriptions s
        join public.profiles pr on pr.id = s.user_id
        where s.status in ('active','trial')
          and s.expires_at > v_now
          and s.expires_at <= v_now + interval '7 days'
        order by s.expires_at
        limit 8
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_user_status — activate / suspend a user (and their stores)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_status(
  target_user uuid,
  new_status  text,
  reason      text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  if new_status not in ('active', 'suspended') then
    raise exception 'invalid status: %', new_status;
  end if;

  perform set_config('app.skip_audit', '1', true);

  update public.profiles
  set status = new_status
  where id = target_user
  returning * into v_profile;

  if not found then
    raise exception 'user not found';
  end if;

  update public.stores
  set status = new_status
  where owner_id = target_user;

  perform public.log_activity(
    'user.' || case when new_status = 'suspended' then 'suspend' else 'activate' end,
    'profile', target_user::text,
    'Set user ' || coalesce(nullif(v_profile.full_name, ''), v_profile.email) || ' to ' || new_status,
    jsonb_build_object('status', new_status, 'reason', reason)
  );

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_extend_subscription — add days; creates a trial if none exists
-- ---------------------------------------------------------------------------
create or replace function public.admin_extend_subscription(
  target_user uuid,
  extra_days  int,
  reason      text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub  public.subscriptions;
  v_plan public.subscription_plans;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;
  if extra_days < 1 or extra_days > 3650 then
    raise exception 'invalid extra_days: %', extra_days;
  end if;

  perform set_config('app.skip_audit', '1', true);

  select * into v_sub
  from public.subscriptions
  where user_id = target_user
  for update;

  if v_sub.id is null then
    select * into v_plan from public.subscription_plans where is_trial limit 1;
    if v_plan.id is null then
      raise exception 'no trial plan configured';
    end if;

    insert into public.subscriptions (user_id, plan_id, status, started_at, expires_at, price_paid)
    values (target_user, v_plan.id, 'trial', now(), now() + make_interval(days => extra_days), 0)
    returning * into v_sub;
  else
    update public.subscriptions
    set expires_at = greatest(now(), expires_at) + make_interval(days => extra_days),
        status = case when plan_id = 'trial' then 'trial' else 'active' end
    where id = v_sub.id
    returning * into v_sub;
  end if;

  perform public.log_activity(
    'subscription.extend', 'subscription', v_sub.id::text,
    'Extended subscription by ' || extra_days || ' day(s)',
    jsonb_build_object('user_id', target_user, 'extra_days', extra_days,
                       'reason', reason, 'expires_at', v_sub.expires_at)
  );

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_change_plan — switch (and extend by the plan duration)
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_plan(
  target_user uuid,
  new_plan    text,
  reason      text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub  public.subscriptions;
  v_plan public.subscription_plans;
  v_base timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = new_plan and active;
  if v_plan.id is null then
    raise exception 'unknown or inactive plan: %', new_plan;
  end if;

  perform set_config('app.skip_audit', '1', true);

  select * into v_sub
  from public.subscriptions
  where user_id = target_user
  for update;

  v_base := greatest(now(), coalesce(v_sub.expires_at, now()));

  if v_sub.id is null then
    insert into public.subscriptions (user_id, plan_id, status, started_at, expires_at, price_paid)
    values (target_user, v_plan.id,
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

  perform public.log_activity(
    'subscription.change_plan', 'subscription', v_sub.id::text,
    'Set subscription to ' || v_plan.name,
    jsonb_build_object('user_id', target_user, 'plan_id', v_plan.id,
                       'reason', reason, 'expires_at', v_sub.expires_at)
  );

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_cancel_subscription — stop renewals; access ends at expires_at
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_subscription(
  target_user uuid,
  reason      text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  perform set_config('app.skip_audit', '1', true);

  update public.subscriptions
  set status = 'cancelled'
  where user_id = target_user
  returning * into v_sub;

  if not found then
    raise exception 'no subscription found for user';
  end if;

  perform public.log_activity(
    'subscription.cancel', 'subscription', v_sub.id::text,
    'Cancelled subscription (access until ' || v_sub.expires_at::date || ')',
    jsonb_build_object('user_id', target_user, 'reason', reason)
  );

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_subscription — contract for the POS client (future device sync).
-- A signed-in device may only verify its own user; admins may verify anyone.
-- Returns a computed status without writing anything.
-- ---------------------------------------------------------------------------
create or replace function public.verify_subscription(target_user uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid    uuid := coalesce(target_user, auth.uid());
  v_sub    public.subscriptions;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_uid is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_sub from public.subscriptions where user_id = v_uid;

  if v_sub.id is null then
    return jsonb_build_object(
      'user_id', v_uid, 'has_subscription', false,
      'status', 'none', 'plan_id', null,
      'expires_at', null, 'days_left', 0, 'can_sell', false
    );
  end if;

  if v_sub.expires_at <= now() or v_sub.status = 'cancelled' then
    v_status := 'expired';
  elsif v_sub.plan_id = 'trial' then
    v_status := 'trial';
  else
    v_status := 'active';
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'has_subscription', true,
    'subscription_id', v_sub.id,
    'status', v_status,
    'plan_id', v_sub.plan_id,
    'started_at', v_sub.started_at,
    'expires_at', v_sub.expires_at,
    'days_left', floor(extract(epoch from (v_sub.expires_at - now())) / 86400),
    'can_sell', v_status in ('trial', 'active')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- promote_to_admin — setup helper: run once after creating your admin
-- account in Authentication -> Users.
-- ---------------------------------------------------------------------------
create or replace function public.promote_to_admin(admin_email text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  update public.profiles
  set role = 'admin', status = 'active'
  where lower(email) = lower(admin_email)
  returning * into v_profile;

  if not found then
    raise exception 'No profile for % — create the user in Authentication first.', admin_email;
  end if;

  perform set_config('app.skip_audit', '1', true);
  perform public.log_activity('admin.promote', 'profile', v_profile.id::text,
    'Promoted ' || v_profile.email || ' to admin', '{}'::jsonb);

  return v_profile;
end;
$$;
