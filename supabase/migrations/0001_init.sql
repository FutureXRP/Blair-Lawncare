-- TrueCut Lawn & Landscape - initial schema
--
-- Conventions:
--   * every table carries org_id so multi-tenant stays possible later
--   * every money column is `integer` cents and suffixed _cents
--   * every table has id uuid pk, created_at, updated_at
--   * RLS is on everywhere; access is scoped by the caller's org and role

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared plumbing
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- orgs
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branding jsonb not null default '{}'::jsonb,
  qbo_realm_id text,
  qbo_connected_at timestamptz,
  -- Encrypted QBO OAuth tokens. Ciphertext only, never plaintext.
  qbo_access_token_encrypted text,
  qbo_refresh_token_encrypted text,
  qbo_access_token_expires_at timestamptz,
  qbo_refresh_token_expires_at timestamptz,
  -- 'per_job' creates one invoice on each job completion.
  -- 'monthly'  batches completed jobs into one invoice per customer per month.
  invoicing_mode text not null default 'per_job'
    check (invoicing_mode in ('per_job', 'monthly')),
  weekly_revenue_target_cents integer not null default 0
    check (weekly_revenue_target_cents >= 0),
  -- MVP rain risk is a manual toggle. Phase 2 replaces it with a weather feed.
  rain_risk boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles (Supabase auth users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null default '',
  role text not null default 'crew' check (role in ('owner', 'crew')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

-- Role and org lookups used by every policy below. SECURITY DEFINER so the
-- policy on profiles does not recurse into itself.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'owner', false);
$$;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  status text not null default 'lead'
    check (status in ('lead', 'estimate', 'active', 'paused', 'churned')),
  qbo_customer_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_org_id_idx on public.customers (org_id);
create index customers_status_idx on public.customers (org_id, status);

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text not null default 'Home',
  address text not null,
  city text,
  lat double precision,
  lng double precision,
  lot_sqft integer check (lot_sqft is null or lot_sqft >= 0),
  gate_code text,
  notes text,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_org_id_idx on public.properties (org_id);
create index properties_customer_id_idx on public.properties (customer_id);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  default_price_cents integer not null default 0 check (default_price_cents >= 0),
  pricing_unit text not null default 'per_visit'
    check (pricing_unit in ('flat', 'per_visit', 'per_sqft')),
  qbo_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_org_id_idx on public.services (org_id);

-- ---------------------------------------------------------------------------
-- recurring_jobs
-- ---------------------------------------------------------------------------

create table public.recurring_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_week integer not null check (day_of_week between 0 and 6),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  season_start date,
  season_end date,
  -- Anchor for biweekly cadence so "every other Tuesday" stays on the same
  -- Tuesday no matter when the generator runs.
  anchor_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_jobs_org_id_idx on public.recurring_jobs (org_id);
create index recurring_jobs_property_id_idx on public.recurring_jobs (property_id);
create index recurring_jobs_active_idx on public.recurring_jobs (org_id, active);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  recurring_job_id uuid references public.recurring_jobs (id) on delete set null,
  service_id uuid not null references public.services (id) on delete restrict,
  scheduled_date date not null,
  route_order integer not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'en_route', 'in_progress', 'complete', 'skipped', 'rain_delay')),
  price_cents integer not null default 0 check (price_cents >= 0),
  assigned_crew uuid[] not null default '{}'::uuid[],
  started_at timestamptz,
  completed_at timestamptz,
  completion_notes text,
  photos jsonb not null default '[]'::jsonb,
  qbo_invoice_id text,
  qbo_invoice_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_org_date_idx on public.jobs (org_id, scheduled_date);
create index jobs_property_idx on public.jobs (property_id);
create index jobs_status_idx on public.jobs (org_id, status);
create index jobs_qbo_invoice_idx on public.jobs (org_id, qbo_invoice_id)
  where qbo_invoice_id is not null;

-- The generator's idempotency guarantee: one generated job per recurring job
-- per calendar date, no matter how many times the generator runs.
create unique index jobs_recurring_date_unique
  on public.jobs (recurring_job_id, scheduled_date)
  where recurring_job_id is not null;

-- ---------------------------------------------------------------------------
-- estimates
-- ---------------------------------------------------------------------------

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'accepted', 'declined')),
  line_items jsonb not null default '[]'::jsonb,
  total_cents integer not null default 0 check (total_cents >= 0),
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  qbo_estimate_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index estimates_org_id_idx on public.estimates (org_id);
create index estimates_status_idx on public.estimates (org_id, status);

-- ---------------------------------------------------------------------------
-- equipment + maintenance
-- ---------------------------------------------------------------------------

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  category text not null default 'other'
    check (category in ('mower', 'trimmer', 'blower', 'truck', 'trailer', 'other')),
  engine_hours numeric not null default 0 check (engine_hours >= 0),
  last_service_at timestamptz,
  last_service_hours numeric,
  service_interval_hours integer check (service_interval_hours is null or service_interval_hours > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index equipment_org_id_idx on public.equipment (org_id);

create table public.maintenance_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  performed_at timestamptz not null default now(),
  description text not null,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_log_equipment_idx on public.maintenance_log (equipment_id);

-- ---------------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------------

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activity_log_org_created_idx on public.activity_log (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- qbo_sync_state
--
-- Cached QuickBooks reads. Everything here is a snapshot with an explicit
-- synced_at, and the UI always shows that timestamp next to the number.
-- ---------------------------------------------------------------------------

create table public.qbo_sync_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.orgs (id) on delete cascade,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'error')),
  last_sync_error text,
  -- Last successful snapshot, kept so a failed sync shows last-good data with a
  -- warning rather than nothing or, worse, an invented number.
  last_good_sync_at timestamptz,
  cursor jsonb not null default '{}'::jsonb,
  -- AR aging buckets in cents, sourced from QBO.
  ar_current_cents integer,
  ar_1_30_cents integer,
  ar_31_60_cents integer,
  ar_61_90_cents integer,
  ar_90_plus_cents integer,
  ar_total_cents integer,
  -- Open invoice detail: [{ qbo_invoice_id, doc_number, customer_name,
  --                        qbo_customer_id, balance_cents, total_cents,
  --                        due_date, days_overdue }]
  open_invoices jsonb not null default '[]'::jsonb,
  -- Monthly revenue rollup by service item:
  -- { "2026-08": [{ item_name, qbo_item_id, amount_cents }] }
  revenue_by_item jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'orgs', 'profiles', 'customers', 'properties', 'services', 'recurring_jobs',
    'jobs', 'estimates', 'equipment', 'maintenance_log', 'activity_log', 'qbo_sync_state'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      target || '_set_updated_at', target
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Enforcement matrix:
--   owner  full read and write inside their org
--   crew   read customers, properties, equipment and their own job route;
--          update only the operational fields on a job. No access at all to
--          estimates, services pricing, recurring pricing, maintenance costs,
--          or the QuickBooks sync cache, which is what the financial screens
--          are built from.
--
-- A crew member is also blocked by trigger from writing price_cents or
-- qbo_invoice_id on a job, so the invoice amount can only ever come from the
-- schedule the owner set.
-- ---------------------------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.properties enable row level security;
alter table public.services enable row level security;
alter table public.recurring_jobs enable row level security;
alter table public.jobs enable row level security;
alter table public.estimates enable row level security;
alter table public.equipment enable row level security;
alter table public.maintenance_log enable row level security;
alter table public.activity_log enable row level security;
alter table public.qbo_sync_state enable row level security;

-- orgs
-- Everyone in the org reads the org row, because the header and the route need
-- the name and the rain flag. The QuickBooks token columns live here too, but
-- they hold AES-256-GCM ciphertext and the key is never in the database, so a
-- crew read of this row yields nothing usable.
create policy orgs_select on public.orgs
  for select to authenticated
  using (id = public.current_org_id());

create policy orgs_update on public.orgs
  for update to authenticated
  using (id = public.current_org_id() and public.is_owner())
  with check (id = public.current_org_id() and public.is_owner());

-- profiles
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or org_id = public.current_org_id());

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy profiles_insert_owner on public.profiles
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.is_owner());

-- Read-mostly operational tables: everyone in the org reads, owner writes.
create policy customers_select on public.customers
  for select to authenticated using (org_id = public.current_org_id());
create policy customers_write on public.customers
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy properties_select on public.properties
  for select to authenticated using (org_id = public.current_org_id());
create policy properties_write on public.properties
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy equipment_select on public.equipment
  for select to authenticated using (org_id = public.current_org_id());
create policy equipment_write on public.equipment
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy activity_log_select on public.activity_log
  for select to authenticated
  using (org_id = public.current_org_id() and public.is_owner());
create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (org_id = public.current_org_id());

-- Financial tables: owner only, all operations.
create policy services_owner_only on public.services
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy recurring_jobs_owner_only on public.recurring_jobs
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy estimates_owner_only on public.estimates
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy maintenance_log_owner_only on public.maintenance_log
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy qbo_sync_state_owner_only on public.qbo_sync_state
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

-- jobs: owner sees everything, crew sees the route they are on.
create policy jobs_select_owner on public.jobs
  for select to authenticated
  using (org_id = public.current_org_id() and public.is_owner());

create policy jobs_select_crew on public.jobs
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and not public.is_owner()
    and (assigned_crew = '{}'::uuid[] or auth.uid() = any (assigned_crew))
  );

create policy jobs_write_owner on public.jobs
  for all to authenticated
  using (org_id = public.current_org_id() and public.is_owner())
  with check (org_id = public.current_org_id() and public.is_owner());

create policy jobs_update_crew on public.jobs
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and not public.is_owner()
    and (assigned_crew = '{}'::uuid[] or auth.uid() = any (assigned_crew))
  )
  with check (org_id = public.current_org_id());

-- Crew may move a job through its statuses. They may not touch money.
create or replace function public.guard_job_financial_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_owner() then
    return new;
  end if;

  if new.price_cents is distinct from old.price_cents
     or new.qbo_invoice_id is distinct from old.qbo_invoice_id
     or new.org_id is distinct from old.org_id
     or new.property_id is distinct from old.property_id
     or new.service_id is distinct from old.service_id
     or new.assigned_crew is distinct from old.assigned_crew then
    raise exception 'Crew members cannot change job pricing or assignment';
  end if;

  return new;
end;
$$;

create trigger jobs_guard_financial_columns
  before update on public.jobs
  for each row execute function public.guard_job_financial_columns();

-- The browser-facing anon role never reads business data. Sessions are always
-- authenticated, and the service role bypasses RLS for server-side sync work.
revoke all on all tables in schema public from anon;
