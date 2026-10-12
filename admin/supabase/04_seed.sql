-- ============================================================================
-- Central POS — Admin Dashboard: 04_seed.sql
-- Run LAST (after 01-03). Idempotent: skips demo users that already exist;
-- plans/pos types/settings use ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin bootstrap — YOUR console account
--   email:    javierrenren1@gmail.com
--   password: monteroTzy31
-- SECURITY NOTE: this credential lives in this file only for first-time
-- setup. After your first sign-in, change the password in
-- Settings -> Admin profile, then delete this block from the seed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = 'javierrenren1@gmail.com';

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'javierrenren1@gmail.com', crypt('monteroTzy31', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Javier Montero"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  end if;

  -- ensure the profile exists and is an active admin
  insert into public.profiles (id, email, full_name, role, status)
  values (v_uid, 'javierrenren1@gmail.com', 'Javier Montero', 'admin', 'active')
  on conflict (id) do update set role = 'admin', status = 'active';

  insert into public.activity_logs (actor_id, action, entity, entity_id, summary, metadata, created_at)
  values (null, 'admin.promote', 'profile', v_uid::text,
          'Bootstrapped admin account javierrenren1@gmail.com',
          '{"source":"04_seed.sql"}'::jsonb, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- POS types (ids match client/src/lib/pos-types.ts)
-- ---------------------------------------------------------------------------
insert into public.pos_types (id, name, tagline, description, icon, category, sort_order) values
  ('bbq',         'BBQ POS',              'Grill houses & ihawan',
   'Built for Filipino barbecue stalls and ihawan — fast order taking for dine-in, takeout, and bilao catering with per-kilo tracking.',
   'Flame', 'food_beverage', 1),
  ('retail',      'Retail Store POS',     'Boutiques & sari-sari retail',
   'General retail checkout with SKU search, promotions, and stock counts for apparel, gadgets, and variety stores.',
   'ShoppingBag', 'retail', 2),
  ('grocery',     'Grocery POS',          'Supermarkets & wet-market grocers',
   'High-volume scanning checkout with weight-based items, expiry tracking, and bulk pricing.',
   'ShoppingBasket', 'retail', 3),
  ('restaurant',  'Restaurant POS',       'Carinderias & full-service dining',
   'Dine-in, takeout, and delivery ticketing with table tracking and kitchen-friendly order flow.',
   'UtensilsCrossed', 'food_beverage', 4),
  ('cafe',        'Cafe POS',             'Coffee shops & milk-tea bars',
   'Quick drink customization, add-ons, and queue numbers for busy cafes and milk-tea shops.',
   'Coffee', 'food_beverage', 5),
  ('pharmacy',    'Pharmacy POS',         'Drugstores & boticas',
   'Prescription tracking, per-item batch and expiry dates, and senior-discount handling.',
   'Cross', 'health', 6),
  ('general',     'General Merchandise',  'All-around sari-sari stores',
   'A flexible setup for neighborhood stores selling a bit of everything.',
   'Store', 'retail', 7)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Product categories — global catalog + per-POS-type assignments.
-- Slugs are prefixed by POS type so the catalog stays collision-free while
-- each workspace gets its own curated set (admins can reassign later).
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

-- ---------------------------------------------------------------------------
-- Subscription plans
-- ---------------------------------------------------------------------------
insert into public.subscription_plans
  (id, name, description, duration_days, price, is_trial, sort_order, features)
values
  ('trial',   'Free Trial', 'Full access for 30 days — no card required.',
   30, 0, true,  0,
   '["Full POS workspace","Product catalog & inventory","Order history & receipts"]'::jsonb),
  ('weekly',  'Weekly',     'Try a plan week-to-week.',
   7, 99, false, 1,
   '["Full POS workspace","Product catalog & inventory","Order history & receipts","Email support"]'::jsonb),
  ('monthly', 'Monthly',    'Most popular for small stores.',
   30, 299, false, 2,
   '["Everything in Weekly","Sales reports & analytics","Priority chat support","Free POS type changes"]'::jsonb),
  ('yearly',  'Yearly',     'Best value — save two months vs monthly.',
   365, 2999, false, 3,
   '["Everything in Monthly","2 months free vs monthly","Dedicated onboarding call","Early access to new POS types"]'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('platform_name',        '"Central POS"',        'Display name of the platform'),
  ('support_email',        '"support@centralpos.ph"', 'Support contact shown to stores'),
  ('currency',             '"PHP"',                'Billing currency'),
  ('trial_days',           '30',                   'Default free trial length in days'),
  ('expiring_soon_days',   '7',                    'Warn stores when fewer than this many days remain'),
  ('maintenance_mode',     'false',                'When true, the POS client shows a maintenance notice'),
  ('offline_sync_enabled', 'false',                'Master switch for device sale synchronization')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Demo customers, stores, subscriptions, payments, activity logs
-- Password for every demo login: demo12345
-- ---------------------------------------------------------------------------
do $$
declare
  u            record;
  v_uid        uuid;
  v_store_id   uuid;
  v_sub_id     uuid;
  v_started    timestamptz;
  v_expires    timestamptz;
  v_price      numeric;
  v_plan_days  int;
  v_n_payments int;
  v_interval   int;
  v_paid       timestamptz;
  i            int;
begin
  for u in
    select * from (values
      ( 1,'juan@bbqhouse.ph',       'Juan Dela Cruz',  'BBQ House Manila',    'bbq',        'BBQ House Manila',      '+63 917 555 0142', '1234 Quezon Ave, Quezon City',      'monthly', 'active',    95,  25, 'active'),
      ( 2,'maria@tindahanmaria.ph', 'Maria Santos',    'Tindahan ni Maria',   'general',    'Tindahan ni Maria',     '+63 918 220 7745', '88 Sampaguita St, Marikina City',   'trial',   'trial',      8,  22, 'active'),
      ( 3,'pedro@pedrosretail.ph',  'Pedro Reyes',     'Pedro''s Retail Hub', 'retail',     'Pedro''s Retail Hub',   '+63 916 334 1180', '5th Ave corner 20th St, BGC, Taguig','yearly', 'active',   120, 245, 'active'),
      ( 4,'ana@anagrocery.ph',      'Ana Villanueva',  'Ana''s Grocery',      'grocery',    'Ana''s Grocery Mart',   '+63 919 887 3321', 'Rizal St, Lipa City, Batangas',     'monthly', 'expired',   75, -12, 'active'),
      ( 5,'lito@litocafe.ph',       'Lito Mendoza',    'Lito''s Cafe',        'cafe',       'Lito''s Cafe',          '+63 921 445 6678', 'A. Bonifacio Ave, Pasig City',      'weekly',  'active',    11,   3, 'active'),
      ( 6,'teresa@teresapharmacy.ph','Teresa Cruz',    'Teresa Pharmacy',     'pharmacy',   'Teresa Pharmacy',       '+63 917 909 2213', 'Mabini St, Batangas City',          'monthly', 'active',    28,   2, 'active'),
      ( 7,'bong@smokehousebbq.ph',  'Bong Garcia',     'Smokehouse BBQ Pit',  'bbq',        'Smokehouse BBQ Pit',    '+63 927 118 4402', 'Session Rd, Baguio City',           'monthly', 'active',    62,  28, 'active'),
      ( 8,'leny@lenysgrocery.ph',   'Leny Ramos',      'Leny''s Super Grocer','grocery',    'Leny''s Super Grocer',  '+63 918 776 5510', 'Colon St, Cebu City',               'yearly',  'active',   300,  65, 'active'),
      ( 9,'joel@joelsrestaurant.ph','Joel Aquino',     'Joel''s Restaurant',  'restaurant', 'Joel''s Lutong Kusina', '+63 916 229 8834', 'Ortigas Ext, Pasig City',           'monthly', 'active',    45,  15, 'active'),
      (10,'girlie@girliecafe.ph',   'Girlie Torres',   'Girlie Brew Cafe',    'cafe',       'Girlie Brew Cafe',      '+63 995 330 1129', 'Maginhawa St, Quezon City',         'trial',   'trial',     24,   6, 'active'),
      (11,'raffy@raffygrocery.ph',  'Raffy Bautista',  'Raffy Mart',          'grocery',    'Raffy Mart',            '+63 928 445 7781', 'National Hwy, Angeles City, Pampanga','weekly', 'expired',  21,  -3, 'suspended'),
      (12,'norma@normaretail.ph',   'Norma Lim',       'Norma Variety Store', 'retail',     'Norma Variety Store',   '+63 917 332 9087', 'Quezon Blvd, Santa Cruz, Manila',   'monthly', 'expired',   90, -40, 'active'),
      (13,'dennis@bbqribsdavao.ph', 'Dennis Ocampo',   'Davao Ribs & Grill',  'bbq',        'Davao Ribs & Grill',    '+63 917 664 2201', 'Matina, Davao City',                'monthly', 'active',    33,  27, 'active'),
      (14,'cynthia@cynthiapharma.ph','Cynthia Sy',     'Cynthia Drugstore',   'pharmacy',   'Cynthia Drugstore',     '+63 918 554 6673', 'Santo Tomas, Pampanga',             'yearly',  'active',   180, 185, 'active'),
      (15,'berto@bertosresto.ph',   'Alberto Cruz',    'Bert''s Lutong Bahay','restaurant', 'Bert''s Lutong Bahay',  '+63 916 778 9902', 'Taft Ave, Manila',                  'monthly', 'cancelled', 50,  10, 'active'),
      (16,'michelle@michellecafe.ph','Michelle Go',    'Michelle''s Brews',   'cafe',       'Michelle''s Brews',     '+63 917 226 3348', 'Katipunan Ave, Quezon City',        'monthly', 'active',    15,  15, 'active'),
      (17,'ramon@ramonretail.ph',   'Ramon Diaz',      'Ramon Gadgets',       'retail',     'Ramon Gadgets',         '+63 995 667 8812', 'SM Aura area, Taguig',              'trial',   'trial',      2,  28, 'active'),
      (18,'lorna@lornagrocery.ph',  'Lorna Perez',     'Lorna Corner Store',  'general',    'Lorna Corner Store',    '+63 927 889 0043', 'Poblacion, Makati City',            'monthly', 'active',    70,  20, 'active')
    ) as t(seq, email, full_name, business_name, pos_type, store_name, phone, address,
           plan_id, sub_status, started_days_ago, expires_in_days, user_status)
  loop
    if exists (select 1 from auth.users where email = u.email) then
      continue;
    end if;

    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      u.email, crypt('demo12345', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.full_name),
      now() - make_interval(days => u.started_days_ago + 5), now(),
      '', '', '', ''
    );

    -- handle_new_user() created the profile; enrich it and backdate signup
    update public.profiles
    set business_name  = u.business_name,
        contact_number = u.phone,
        address        = u.address,
        created_at     = now() - make_interval(days => u.started_days_ago + 5)
    where id = v_uid;

    insert into public.stores
      (owner_id, name, pos_type, email, phone, address, status, onboarded, created_at)
    values (
      v_uid, u.store_name, u.pos_type, u.email, u.phone, u.address,
      case when u.user_status = 'suspended' then 'suspended' else 'active' end,
      true,
      now() - make_interval(days => u.started_days_ago + 3)
    )
    returning id into v_store_id;

    -- subscription
    select sp.price, sp.duration_days into v_price, v_plan_days
    from public.subscription_plans sp where sp.id = u.plan_id;

    v_started := now() - make_interval(days => u.started_days_ago);
    v_expires := case
      when u.expires_in_days >= 0 then now() + make_interval(days => u.expires_in_days)
      else now() - make_interval(days => abs(u.expires_in_days))
    end;

    insert into public.subscriptions
      (user_id, plan_id, status, started_at, expires_at, price_paid, created_at)
    values (v_uid, u.plan_id, u.sub_status, v_started, v_expires, v_price, v_started)
    returning id into v_sub_id;

    -- mock payment history (one payment per billing period)
    if u.plan_id <> 'trial' then
      v_interval := case u.plan_id when 'monthly' then 30 when 'weekly' then 7 else 365 end;
      v_n_payments := case u.plan_id
        when 'monthly' then least(floor(u.started_days_ago / 30)::int, 3)
        when 'weekly'  then least(floor(u.started_days_ago / 7)::int, 4)
        else 0
      end;

      for i in 0 .. v_n_payments loop
        v_paid := v_started - make_interval(days => i * v_interval);
        exit when v_paid < now() - interval '330 days';

        insert into public.payments
          (user_id, subscription_id, plan_id, reference, method, amount, paid_at, notes, created_at)
        values (
          v_uid, v_sub_id, u.plan_id,
          'MOCK-' || upper(substr(md5(u.email || ':' || i::text), 1, 8)),
          (array['mock_gcash', 'mock_card', 'mock_bank'])[1 + ((u.seq + i) % 3)],
          v_price, v_paid,
          case when i = 0 then 'Initial subscription payment (seed)' else 'Renewal (seed)' end,
          v_paid
        );
      end loop;
    end if;

    -- audit history for the demo timeline
    insert into public.activity_logs (actor_id, action, entity, entity_id, summary, metadata, created_at)
    values
      (null, 'user.register', 'profile', v_uid::text,
       'Registered ' || u.business_name || ' (' || u.email || ')',
       jsonb_build_object('pos_type', u.pos_type, 'source', 'sql-seed'),
       now() - make_interval(days => u.started_days_ago + 5)),
      (null, 'subscription.create', 'subscription', v_sub_id::text,
       'Started ' || u.plan_id || ' plan for ' || u.business_name,
       jsonb_build_object('plan_id', u.plan_id, 'source', 'sql-seed'),
       v_started);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extra payment states for the payments filters (pending/failed/refunded)
-- ---------------------------------------------------------------------------
insert into public.payments (user_id, subscription_id, plan_id, reference, method, amount, status, paid_at, notes)
select s.user_id, s.id, s.plan_id,
       'MOCK-' || upper(substr(md5(s.user_id::text || 'pending'), 1, 8)),
       'mock_gcash', sp.price, 'pending', now() - interval '2 days',
       'Awaiting confirmation (seed demo)'
from public.subscriptions s
join public.subscription_plans sp on sp.id = s.plan_id
join public.profiles p on p.id = s.user_id
where p.email = 'joel@joelsrestaurant.ph'
on conflict (reference) do nothing;

insert into public.payments (user_id, subscription_id, plan_id, reference, method, amount, status, paid_at, notes)
select s.user_id, s.id, s.plan_id,
       'MOCK-' || upper(substr(md5(s.user_id::text || 'failed'), 1, 8)),
       'mock_card', sp.price, 'failed', now() - interval '5 days',
       'Card declined (seed demo)'
from public.subscriptions s
join public.subscription_plans sp on sp.id = s.plan_id
join public.profiles p on p.id = s.user_id
where p.email = 'lito@litocafe.ph'
on conflict (reference) do nothing;

insert into public.payments (user_id, subscription_id, plan_id, reference, method, amount, status, paid_at, notes)
select s.user_id, s.id, s.plan_id,
       'MOCK-' || upper(substr(md5(s.user_id::text || 'refunded'), 1, 8)),
       'mock_bank', sp.price, 'refunded', now() - interval '12 days',
       'Refunded after plan downgrade request (seed demo)'
from public.subscriptions s
join public.subscription_plans sp on sp.id = s.plan_id
join public.profiles p on p.id = s.user_id
where p.email = 'norma@normaretail.ph'
on conflict (reference) do nothing;

-- ---------------------------------------------------------------------------
-- Sample synced offline sales (foundation demo for future POS sync)
-- ---------------------------------------------------------------------------
insert into public.pos_sales (idempotency_key, store_id, user_id, receipt_no, total, sold_at, payload)
select 'seed-sale-' || st.id::text, st.id, st.owner_id, 'R-000123', 1450.00,
       now() - interval '3 hours',
       '{"items":[{"name":"Pork BBQ Stick","qty":20,"price":25},{"name":"Garlic Rice","qty":10,"price":25},{"name":"Coke Regular 355ml","qty":8,"price":25}],"note":"seed demo offline sale"}'::jsonb
from public.stores st
where st.name = 'BBQ House Manila'
on conflict (idempotency_key) do nothing;

insert into public.pos_sales (idempotency_key, store_id, user_id, receipt_no, total, sold_at, payload)
select 'seed-sale-2-' || st.id::text, st.id, st.owner_id, 'R-000124', 890.00,
       now() - interval '26 hours',
       '{"items":[{"name":"Chicken Inasal (Quarter)","qty":5,"price":89},{"name":"Sago''t Gulaman","qty":5,"price":35}],"note":"seed demo offline sale"}'::jsonb
from public.stores st
where st.name = 'BBQ House Manila'
on conflict (idempotency_key) do nothing;

-- ---------------------------------------------------------------------------
-- Final audit rows
-- ---------------------------------------------------------------------------
insert into public.activity_logs (actor_id, action, entity, entity_id, summary, metadata, created_at) values
  (null, 'system.setup', 'system', null, 'Installed Central POS admin schema', '{"source":"04_seed.sql"}'::jsonb, now() - interval '1 day'),
  (null, 'system.seed',  'system', null, 'Seeded demo data (18 customers, 18 stores, plans, payments)', '{"source":"04_seed.sql"}'::jsonb, now() - interval '1 day'),
  (null, 'user.suspend', 'profile', (select id::text from public.profiles where email = 'raffy@raffygrocery.ph'),
   'Suspended Raffy Mart for unpaid weekly plan', '{"reason":"payment overdue","source":"sql-seed"}'::jsonb, now() - interval '3 days'),
  (null, 'subscription.extend', 'subscription', (select s.id::text from public.subscriptions s join public.profiles p on p.id = s.user_id where p.email = 'teresa@teresapharmacy.ph'),
   'Extended Teresa Pharmacy by 7 day(s) as goodwill', '{"reason":"support gesture","source":"sql-seed"}'::jsonb, now() - interval '6 days'),
  (null, 'setting.update', 'system_setting', 'offline_sync_enabled',
   'Disabled offline sync master switch pending POS client migration', '{"source":"sql-seed"}'::jsonb, now() - interval '1 day');
