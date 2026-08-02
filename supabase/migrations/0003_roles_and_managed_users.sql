-- Roles become admin / manager / staff, and accounts are created by an admin
-- rather than by public signup.
--
-- Two changes in one migration because they are the same change: who can get
-- into this app, and what they can do once they are in.
--
--   admin    full access, including everything financial. Adds other users
--   manager  operations only for now
--   staff    operations only for now
--
-- Access control is deliberately still two tier. Manager and staff currently
-- get exactly what the old crew role got. When the real permission matrix is
-- decided, public.has_full_access() below is the single place that decides who
-- sees financial data, and it is the only function these policies call.

-- ---------------------------------------------------------------------------
-- 1. Drop every policy that depends on the old is_owner() predicate
-- ---------------------------------------------------------------------------

drop policy if exists orgs_update on public.orgs;
drop policy if exists profiles_update_owner on public.profiles;
drop policy if exists profiles_insert_owner on public.profiles;
drop policy if exists customers_write on public.customers;
drop policy if exists properties_write on public.properties;
drop policy if exists equipment_write on public.equipment;
drop policy if exists activity_log_select on public.activity_log;
drop policy if exists services_owner_only on public.services;
drop policy if exists recurring_jobs_owner_only on public.recurring_jobs;
drop policy if exists estimates_owner_only on public.estimates;
drop policy if exists maintenance_log_owner_only on public.maintenance_log;
drop policy if exists qbo_sync_state_owner_only on public.qbo_sync_state;
drop policy if exists jobs_select_owner on public.jobs;
drop policy if exists jobs_select_crew on public.jobs;
drop policy if exists jobs_write_owner on public.jobs;
drop policy if exists jobs_update_crew on public.jobs;

drop trigger if exists jobs_guard_financial_columns on public.jobs;
drop function if exists public.guard_job_financial_columns();
drop function if exists public.is_owner();

-- ---------------------------------------------------------------------------
-- 2. Migrate the role values
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'admin' where role = 'owner';
update public.profiles set role = 'staff' where role = 'crew';

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'manager', 'staff'));

alter table public.profiles alter column role set default 'staff';

-- ---------------------------------------------------------------------------
-- 3. The single access predicate
-- ---------------------------------------------------------------------------

-- Who can see money and change the shape of the business. Widen this when the
-- real role matrix is defined; every policy below goes through it.
create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'admin',
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Recreate the policies against has_full_access()
-- ---------------------------------------------------------------------------

create policy orgs_update on public.orgs
  for update to authenticated
  using (id = public.current_org_id() and public.has_full_access())
  with check (id = public.current_org_id() and public.has_full_access());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (org_id = public.current_org_id() and public.has_full_access());

create policy customers_write on public.customers
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy properties_write on public.properties
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy equipment_write on public.equipment
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy activity_log_select on public.activity_log
  for select to authenticated
  using (org_id = public.current_org_id() and public.has_full_access());

create policy services_admin_only on public.services
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy recurring_jobs_admin_only on public.recurring_jobs
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy estimates_admin_only on public.estimates
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy maintenance_log_admin_only on public.maintenance_log
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy qbo_sync_state_admin_only on public.qbo_sync_state
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy jobs_select_admin on public.jobs
  for select to authenticated
  using (org_id = public.current_org_id() and public.has_full_access());

create policy jobs_select_assigned on public.jobs
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and not public.has_full_access()
    and (assigned_crew = '{}'::uuid[] or auth.uid() = any (assigned_crew))
  );

create policy jobs_write_admin on public.jobs
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_full_access())
  with check (org_id = public.current_org_id() and public.has_full_access());

create policy jobs_update_assigned on public.jobs
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and not public.has_full_access()
    and (assigned_crew = '{}'::uuid[] or auth.uid() = any (assigned_crew))
  )
  with check (org_id = public.current_org_id());

-- Anyone without full access may move a job through its statuses but may not
-- touch money or reassign the work.
create or replace function public.guard_job_financial_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_full_access() then
    return new;
  end if;

  if new.price_cents is distinct from old.price_cents
     or new.qbo_invoice_id is distinct from old.qbo_invoice_id
     or new.org_id is distinct from old.org_id
     or new.property_id is distinct from old.property_id
     or new.service_id is distinct from old.service_id
     or new.assigned_crew is distinct from old.assigned_crew then
    raise exception 'Only an admin can change job pricing or assignment';
  end if;

  return new;
end;
$$;

create trigger jobs_guard_financial_columns
  before update on public.jobs
  for each row execute function public.guard_job_financial_columns();

-- ---------------------------------------------------------------------------
-- 5. New accounts come from an admin, not from public signup
-- ---------------------------------------------------------------------------

-- The role is chosen by the admin creating the account and arrives in the
-- user's metadata. The very first account is always an admin, because
-- otherwise there would be nobody able to add anyone else.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org_id uuid;
  requested_role text;
  new_role text;
  display_name text;
begin
  select id into existing_org_id from public.orgs order by created_at asc limit 1;

  requested_role := nullif(new.raw_user_meta_data ->> 'role', '');

  if existing_org_id is null then
    insert into public.orgs (name, invoicing_mode, weekly_revenue_target_cents)
    values ('Blair Lawn', 'per_job', 0)
    returning id into existing_org_id;

    insert into public.qbo_sync_state (org_id) values (existing_org_id);

    -- First account in, so it has to be able to add the others.
    new_role := 'admin';
  elsif requested_role in ('admin', 'manager', 'staff') then
    new_role := requested_role;
  else
    -- An account created outside the Team screen gets the least privilege.
    new_role := 'staff';
  end if;

  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, org_id, name, role)
  values (new.id, existing_org_id, display_name, new_role);

  return new;
end;
$$;

-- The org created before this migration carried the placeholder working name.
update public.orgs
   set name = 'Blair Lawn'
 where name in ('TrueCut Lawn & Landscape', 'TrueCut');
