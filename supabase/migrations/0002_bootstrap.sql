-- Single tenant bootstrap.
--
-- The first person to sign up creates the org and becomes its owner. Everyone
-- after that joins the same org as crew, and the owner can promote them from
-- Settings. When the app goes multi-tenant this trigger is the only thing that
-- has to change; every table is already scoped by org_id.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org_id uuid;
  new_role text;
  display_name text;
begin
  select id into existing_org_id from public.orgs order by created_at asc limit 1;

  if existing_org_id is null then
    insert into public.orgs (name, invoicing_mode, weekly_revenue_target_cents)
    values ('TrueCut Lawn & Landscape', 'per_job', 0)
    returning id into existing_org_id;

    insert into public.qbo_sync_state (org_id) values (existing_org_id);

    new_role := 'owner';
  else
    new_role := 'crew';
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
