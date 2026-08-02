-- Exercises the role rules after the migrations have run.
--
-- Each block acts as a real signed in user: the authenticated Postgres role
-- plus the request setting auth.uid() reads. That is the same combination
-- Supabase produces, so what passes here is what the policies actually do.

\set ON_ERROR_STOP on

-- Supabase grants table privileges to authenticated by default. A plain
-- Postgres does not, so grant them before testing the policies themselves.
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- --- Seed three accounts -----------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@blairlawn.test',
   '{"name": "Sam Blair", "role": "admin"}'),
  ('22222222-2222-2222-2222-222222222222', 'manager@blairlawn.test',
   '{"name": "Alex Manager", "role": "manager"}'),
  ('33333333-3333-3333-3333-333333333333', 'staff@blairlawn.test',
   '{"name": "Jo Staff", "role": "staff"}');

-- The first account must be admin no matter what metadata says, and the org
-- must have been created with the real company name.
select 'first user is admin'   as check,
       (select role from public.profiles
         where id = '11111111-1111-1111-1111-111111111111') = 'admin' as pass;
select 'second user is manager' as check,
       (select role from public.profiles
         where id = '22222222-2222-2222-2222-222222222222') = 'manager' as pass;
select 'third user is staff'    as check,
       (select role from public.profiles
         where id = '33333333-3333-3333-3333-333333333333') = 'staff' as pass;
select 'org named Blair Lawn'   as check,
       (select name from public.orgs limit 1) = 'Blair Lawn' as pass;

-- An account created with no role, or a junk role, lands on staff.
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'nobody@blairlawn.test', '{}'),
  ('55555555-5555-5555-5555-555555555555', 'sneaky@blairlawn.test',
   '{"role": "superuser"}');

select 'no role defaults to staff'   as check,
       (select role from public.profiles
         where id = '44444444-4444-4444-4444-444444444444') = 'staff' as pass;
select 'junk role defaults to staff' as check,
       (select role from public.profiles
         where id = '55555555-5555-5555-5555-555555555555') = 'staff' as pass;

-- --- Business data to test against -------------------------------------------

insert into public.services (org_id, name, default_price_cents)
select id, 'Weekly mow', 5500 from public.orgs limit 1;

insert into public.customers (org_id, name, status)
select id, 'Dana Whitfield', 'active' from public.orgs limit 1;

insert into public.properties (org_id, customer_id, address)
select o.id, c.id, '1420 Ridgeline Dr' from public.orgs o, public.customers c limit 1;

insert into public.jobs (org_id, property_id, service_id, scheduled_date, price_cents)
select o.id, p.id, s.id, current_date, 8500
  from public.orgs o, public.properties p, public.services s limit 1;

-- --- Admin ------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select 'admin has full access'   as check, public.has_full_access() as pass;
select 'admin reads services'    as check, count(*) = 1 as pass from public.services;
select 'admin reads jobs'        as check, count(*) = 1 as pass from public.jobs;
select 'admin reads estimates'   as check, count(*) = 0 as pass from public.estimates;

-- --- Manager ----------------------------------------------------------------

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select 'manager has no full access' as check, public.has_full_access() = false as pass;
select 'manager cannot read services'  as check, count(*) = 0 as pass from public.services;
select 'manager cannot read estimates' as check, count(*) = 0 as pass from public.estimates;
select 'manager cannot read recurring' as check, count(*) = 0 as pass from public.recurring_jobs;
select 'manager cannot read qbo cache' as check, count(*) = 0 as pass from public.qbo_sync_state;
select 'manager sees the route'        as check, count(*) = 1 as pass from public.jobs;

-- Manager may move a job along.
update public.jobs set status = 'in_progress';
select 'manager can advance a job' as check,
       (select status from public.jobs) = 'in_progress' as pass;

-- Manager may not touch the money on it.
do $$
begin
  update public.jobs set price_cents = 1;
  raise exception 'FAIL: manager repriced a job';
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
    -- The guard trigger fired, which is the expected outcome.
end;
$$;
select 'manager cannot reprice a job' as check, true as pass;

-- --- Staff ------------------------------------------------------------------

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select 'staff has no full access'  as check, public.has_full_access() = false as pass;
select 'staff cannot read services' as check, count(*) = 0 as pass from public.services;
select 'staff sees the route'       as check, count(*) = 1 as pass from public.jobs;

do $$
begin
  update public.jobs set price_cents = 1;
  raise exception 'FAIL: staff repriced a job';
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
end;
$$;
select 'staff cannot reprice a job' as check, true as pass;

-- A non admin must not be able to promote themselves.
do $$
begin
  update public.profiles set role = 'admin'
   where id = '33333333-3333-3333-3333-333333333333';
  if (select role from public.profiles
       where id = '33333333-3333-3333-3333-333333333333') = 'admin' then
    raise exception 'FAIL: staff promoted themselves to admin';
  end if;
end;
$$;
select 'staff cannot self promote' as check,
       (select role from public.profiles
         where id = '33333333-3333-3333-3333-333333333333') = 'staff' as pass;

reset role;
