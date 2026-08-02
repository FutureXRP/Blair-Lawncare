-- Harness for testing the migrations against a plain Postgres.
--
-- Supabase provides the auth schema, auth.uid() and the anon / authenticated /
-- service_role roles. This file stubs just enough of them that the migrations
-- and their RLS policies can be exercised locally.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Supabase reads the signed in user from the request JWT. Tests set the same
-- setting directly to act as a given user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
