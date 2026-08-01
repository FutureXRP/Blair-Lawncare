-- Demo data for local development.
--
-- Run this only against a local or sandbox database. It attaches to whichever
-- org already exists, which in single tenant is the one the first signup made.
-- Every value below is fixed, not random, so a reseeded database looks exactly
-- the same and screenshots stay comparable. No financial figure here is ever
-- presented as coming from QuickBooks.

do $$
declare
  v_org uuid;
  v_mow uuid;
  v_cleanup uuid;
  v_mulch uuid;
  v_customer uuid;
  v_property uuid;
  v_recurring uuid;
  v_today date := current_date;
  v_row record;
  v_order integer := 1;
begin
  select id into v_org from public.orgs order by created_at asc limit 1;
  if v_org is null then
    raise notice 'No org found. Sign up once first, then rerun this seed.';
    return;
  end if;

  update public.orgs
     set weekly_revenue_target_cents = 250000
   where id = v_org;

  -- Services -----------------------------------------------------------------
  insert into public.services (org_id, name, default_price_cents, pricing_unit)
  values (v_org, 'Weekly mow', 5500, 'per_visit')
  returning id into v_mow;

  insert into public.services (org_id, name, default_price_cents, pricing_unit)
  values (v_org, 'Spring cleanup', 32500, 'flat')
  returning id into v_cleanup;

  insert into public.services (org_id, name, default_price_cents, pricing_unit)
  values (v_org, 'Mulch install', 9, 'per_sqft')
  returning id into v_mulch;

  -- Customers and properties -------------------------------------------------
  for v_row in
    select * from (values
      ('Dana Whitfield', 'dana.whitfield@example.com', '(555) 214-8890', 'active',
       '1420 Ridgeline Dr', 'Franklin', 8400, '4417', 'Two dogs in the back yard. Latch the gate.'),
      ('Marcus Hale', 'marcus.hale@example.com', '(555) 331-2076', 'active',
       '88 Coventry Ct', 'Franklin', 6200, null, 'Sprinkler heads along the driveway edge. Stay wide.'),
      ('Priya Raman', 'priya.raman@example.com', '(555) 902-4413', 'active',
       '3307 Elmgrove Ave', 'Brentwood', 11500, '2210', 'Trailer parks on the street. Driveway is too steep.'),
      ('Bennett Household', 'bennett.home@example.com', '(555) 771-3392', 'active',
       '19 Sable Creek Rd', 'Brentwood', 15200, null, 'Beehives at the rear fence line. Do not trim past the shed.'),
      ('Sofia Reyes', 'sofia.reyes@example.com', '(555) 448-1155', 'estimate',
       '7714 Larkspur Ln', 'Franklin', 9300, null, 'New build. Sod went in last month.')
    ) as t(name, email, phone, status, address, city, lot_sqft, gate_code, notes)
  loop
    insert into public.customers (org_id, name, email, phone, status)
    values (v_org, v_row.name, v_row.email, v_row.phone, v_row.status)
    returning id into v_customer;

    insert into public.properties
      (org_id, customer_id, label, address, city, lot_sqft, gate_code, notes)
    values
      (v_org, v_customer, 'Home', v_row.address, v_row.city, v_row.lot_sqft,
       v_row.gate_code, v_row.notes)
    returning id into v_property;

    continue when v_row.status <> 'active';

    insert into public.recurring_jobs
      (org_id, property_id, service_id, frequency, day_of_week, price_cents, active, anchor_date)
    values
      (v_org, v_property, v_mow, 'weekly', extract(dow from v_today)::int,
       case v_row.lot_sqft when 15200 then 8500 when 11500 then 6500 else 5500 end,
       true, v_today)
    returning id into v_recurring;

    insert into public.jobs
      (org_id, property_id, recurring_job_id, service_id, scheduled_date, route_order,
       status, price_cents)
    values
      (v_org, v_property, v_recurring, v_mow, v_today, v_order, 'scheduled',
       case v_row.lot_sqft when 15200 then 8500 when 11500 then 6500 else 5500 end);

    v_order := v_order + 1;
  end loop;

  -- Equipment ----------------------------------------------------------------
  insert into public.equipment (org_id, name, category, engine_hours, service_interval_hours, last_service_at, last_service_hours, notes)
  values
    (v_org, 'Scag Turf Tiger', 'mower', 418, 100, now() - interval '95 days', 305, 'Blades sharpened monthly'),
    (v_org, 'Stihl FS 91 R', 'trimmer', 212, 150, now() - interval '40 days', 190, null),
    (v_org, 'Ford F-250', 'truck', 0, null, now() - interval '20 days', null, 'Oil change every 5,000 miles'),
    (v_org, '16ft Enclosed Trailer', 'trailer', 0, null, null, null, 'Check tire pressure before long routes');

  -- A pending estimate so the dashboard has something to show ---------------
  select id into v_customer from public.customers
   where org_id = v_org and status = 'estimate' limit 1;

  if v_customer is not null then
    insert into public.estimates (org_id, customer_id, status, line_items, total_cents, sent_at, viewed_at)
    values (
      v_org, v_customer, 'viewed',
      jsonb_build_array(
        jsonb_build_object('service_id', v_cleanup, 'description', 'Spring cleanup', 'qty', 1, 'price_cents', 32500),
        jsonb_build_object('service_id', v_mulch, 'description', 'Mulch install, 300 sq ft', 'qty', 300, 'price_cents', 9)
      ),
      32500 + (300 * 9),
      now() - interval '5 days',
      now() - interval '4 days'
    );
  end if;

  raise notice 'Seed complete for org %', v_org;
end;
$$;
