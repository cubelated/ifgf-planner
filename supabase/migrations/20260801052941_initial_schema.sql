create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Taipei',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'coordinator', 'volunteer')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.service_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  status text not null default 'active' check (status in ('active', 'resting', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, user_id)
);

create table public.volunteer_section_eligibility (
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  section_id uuid not null references public.service_sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (volunteer_id, section_id)
);

create table public.event_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 1440),
  recurrence_pattern text not null default 'every_week'
    check (recurrence_pattern in ('every_week', 'weeks_1_3', 'weeks_2_4', 'except_5', 'custom')),
  week_occurrences smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.event_group_volunteers (
  event_group_id uuid not null references public.event_groups(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_group_id, volunteer_id)
);

create table public.staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  event_group_id uuid not null references public.event_groups(id) on delete cascade,
  section_id uuid not null references public.service_sections(id) on delete cascade,
  needed_count integer not null default 1 check (needed_count between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_group_id, section_id)
);

create table public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_group_id uuid not null references public.event_groups(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_group_id, starts_at),
  check (ends_at > starts_at)
);

create table public.unavailability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  occurrence_id uuid not null references public.event_occurrences(id) on delete cascade,
  unavailable_date date not null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (volunteer_id, occurrence_id)
);

create table public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_version_id uuid references public.schedule_versions(id) on delete set null,
  occurrence_id uuid not null references public.event_occurrences(id) on delete cascade,
  section_id uuid not null references public.service_sections(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'confirmed', 'declined')),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, section_id, volunteer_id)
);

create index organization_members_user_idx on public.organization_members(user_id);
create index service_sections_org_idx on public.service_sections(organization_id);
create index volunteers_org_idx on public.volunteers(organization_id);
create index volunteers_user_idx on public.volunteers(user_id) where user_id is not null;
create index event_groups_org_idx on public.event_groups(organization_id);
create index event_occurrences_org_starts_idx on public.event_occurrences(organization_id, starts_at);
create index event_occurrences_group_idx on public.event_occurrences(event_group_id);
create index unavailability_org_date_idx on public.unavailability(organization_id, unavailable_date);
create index assignments_occurrence_idx on public.assignments(occurrence_id);
create index assignments_volunteer_idx on public.assignments(volunteer_id);
create index assignments_organization_idx on public.assignments(organization_id);
create index assignments_schedule_version_idx on public.assignments(schedule_version_id)
  where schedule_version_id is not null;
create index assignments_section_idx on public.assignments(section_id);
create unique index assignments_occurrence_volunteer_unique
  on public.assignments(occurrence_id, volunteer_id);
create index event_group_volunteers_volunteer_idx on public.event_group_volunteers(volunteer_id);
create index event_groups_created_by_idx on public.event_groups(created_by);
create index organizations_created_by_idx on public.organizations(created_by);
create index schedule_versions_created_by_idx on public.schedule_versions(created_by);
create index schedule_versions_organization_idx on public.schedule_versions(organization_id);
create index staffing_requirements_section_idx on public.staffing_requirements(section_id);
create index unavailability_occurrence_idx on public.unavailability(occurrence_id);
create index volunteer_eligibility_section_idx on public.volunteer_section_eligibility(section_id);
create unique index schedule_versions_period_unique
  on public.schedule_versions(organization_id, period_start, period_end);

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_org_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any (allowed_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, text[]) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_org_role(uuid, text[]) to authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger service_sections_set_updated_at before update on public.service_sections
for each row execute function public.set_updated_at();
create trigger volunteers_set_updated_at before update on public.volunteers
for each row execute function public.set_updated_at();
create trigger event_groups_set_updated_at before update on public.event_groups
for each row execute function public.set_updated_at();
create trigger staffing_requirements_set_updated_at before update on public.staffing_requirements
for each row execute function public.set_updated_at();
create trigger event_occurrences_set_updated_at before update on public.event_occurrences
for each row execute function public.set_updated_at();
create trigger unavailability_set_updated_at before update on public.unavailability
for each row execute function public.set_updated_at();
create trigger schedule_versions_set_updated_at before update on public.schedule_versions
for each row execute function public.set_updated_at();
create trigger assignments_set_updated_at before update on public.assignments
for each row execute function public.set_updated_at();

create or replace function private.validate_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  occurrence_organization_id uuid;
  occurrence_event_group_id uuid;
  volunteer_organization_id uuid;
  volunteer_status text;
begin
  select occurrence.organization_id, occurrence.event_group_id
  into occurrence_organization_id, occurrence_event_group_id
  from public.event_occurrences occurrence
  where occurrence.id = new.occurrence_id;

  select volunteer.organization_id, volunteer.status
  into volunteer_organization_id, volunteer_status
  from public.volunteers volunteer
  where volunteer.id = new.volunteer_id;

  if occurrence_organization_id is null or volunteer_organization_id is null then
    raise exception 'Occurrence or volunteer does not exist.' using errcode = '23514';
  end if;
  if new.organization_id <> occurrence_organization_id or new.organization_id <> volunteer_organization_id then
    raise exception 'Assignment resources must belong to the same organization.' using errcode = '23514';
  end if;
  if volunteer_status <> 'active' then
    raise exception 'Only active volunteers can be assigned.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.staffing_requirements requirement
    where requirement.event_group_id = occurrence_event_group_id
      and requirement.section_id = new.section_id
  ) then
    raise exception 'This section is not required for the selected event.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.volunteer_section_eligibility eligibility
    where eligibility.volunteer_id = new.volunteer_id
      and eligibility.section_id = new.section_id
  ) then
    raise exception 'Volunteer is not eligible for this section.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.event_group_volunteers membership
    where membership.volunteer_id = new.volunteer_id
      and membership.event_group_id = occurrence_event_group_id
  ) then
    raise exception 'Volunteer is not assigned to this event group.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.unavailability absence
    where absence.volunteer_id = new.volunteer_id
      and absence.occurrence_id = new.occurrence_id
  ) then
    raise exception 'Volunteer is unavailable for this occurrence.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger assignments_validate
before insert or update on public.assignments
for each row execute function private.validate_assignment();

create or replace function private.validate_unavailability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  occurrence_organization_id uuid;
  volunteer_organization_id uuid;
  occurrence_date date;
begin
  select
    occurrence.organization_id,
    (occurrence.starts_at at time zone organization.timezone)::date
  into occurrence_organization_id, occurrence_date
  from public.event_occurrences occurrence
  join public.organizations organization on organization.id = occurrence.organization_id
  where occurrence.id = new.occurrence_id;

  select volunteer.organization_id
  into volunteer_organization_id
  from public.volunteers volunteer
  where volunteer.id = new.volunteer_id;

  if occurrence_organization_id is null or volunteer_organization_id is null then
    raise exception 'Occurrence or volunteer does not exist.' using errcode = '23514';
  end if;
  if new.organization_id <> occurrence_organization_id or new.organization_id <> volunteer_organization_id then
    raise exception 'Unavailability resources must belong to the same organization.' using errcode = '23514';
  end if;

  new.unavailable_date = occurrence_date;
  return new;
end;
$$;

create trigger unavailability_validate
before insert or update on public.unavailability
for each row execute function private.validate_unavailability();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Relawan'), '@', 1)),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.profiles (id, full_name, email)
select
  user_record.id,
  coalesce(nullif(user_record.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(user_record.email, 'Relawan'), '@', 1)),
  user_record.email
from auth.users user_record
on conflict (id) do update
set email = excluded.email;

with first_user as (
  select id
  from auth.users
  order by created_at
  limit 1
)
update public.profiles profile
set full_name = 'Hanssen Budisantoso Wijaya'
from first_user
where profile.id = first_user.id;

with first_user as (
  select id
  from auth.users
  order by created_at
  limit 1
)
insert into public.organizations (name, slug, timezone, created_by)
select 'IFGF Planner', 'ifgf-planner', 'Asia/Taipei', first_user.id
from first_user
on conflict (slug) do nothing;

with first_user as (
  select id
  from auth.users
  order by created_at
  limit 1
), planner_org as (
  select id
  from public.organizations
  where slug = 'ifgf-planner'
)
insert into public.organization_members (organization_id, user_id, role)
select planner_org.id, first_user.id, 'owner'
from first_user cross join planner_org
on conflict (organization_id, user_id) do update
set role = excluded.role, status = 'active';

with first_user as (
  select id, email
  from auth.users
  order by created_at
  limit 1
), planner_org as (
  select id
  from public.organizations
  where slug = 'ifgf-planner'
)
insert into public.volunteers (organization_id, user_id, full_name, email)
select planner_org.id, first_user.id, 'Hanssen Budisantoso Wijaya', first_user.email
from first_user cross join planner_org
on conflict (organization_id, user_id) do update
set full_name = excluded.full_name, email = excluded.email;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.service_sections enable row level security;
alter table public.volunteers enable row level security;
alter table public.volunteer_section_eligibility enable row level security;
alter table public.event_groups enable row level security;
alter table public.event_group_volunteers enable row level security;
alter table public.staffing_requirements enable row level security;
alter table public.event_occurrences enable row level security;
alter table public.unavailability enable row level security;
alter table public.schedule_versions enable row level security;
alter table public.assignments enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy organizations_select on public.organizations for select to authenticated
using (created_by = (select auth.uid()) or private.is_org_member(id));
create policy organizations_insert on public.organizations for insert to authenticated
with check (created_by = (select auth.uid()));
create policy organizations_update on public.organizations for update to authenticated
using (private.has_org_role(id, array['owner', 'coordinator']))
with check (private.has_org_role(id, array['owner', 'coordinator']));
create policy organizations_delete on public.organizations for delete to authenticated
using (private.has_org_role(id, array['owner']));

create policy organization_members_select on public.organization_members for select to authenticated
using (private.is_org_member(organization_id));
create policy organization_members_insert on public.organization_members for insert to authenticated
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.organizations organization
      where organization.id = organization_id
        and organization.created_by = (select auth.uid())
    )
  )
);
create policy organization_members_update on public.organization_members for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy organization_members_delete on public.organization_members for delete to authenticated
using (private.has_org_role(organization_id, array['owner']));

create policy service_sections_select on public.service_sections for select to authenticated
using (private.is_org_member(organization_id));
create policy service_sections_insert on public.service_sections for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy service_sections_update on public.service_sections for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy service_sections_delete on public.service_sections for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

create policy volunteers_select on public.volunteers for select to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or user_id = (select auth.uid())
);
create policy volunteers_insert on public.volunteers for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy volunteers_update on public.volunteers for update to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or user_id = (select auth.uid())
)
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or user_id = (select auth.uid())
);
create policy volunteers_delete on public.volunteers for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

create policy volunteer_eligibility_select on public.volunteer_section_eligibility for select to authenticated
using (
  exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and (
        private.has_org_role(volunteer.organization_id, array['owner', 'coordinator'])
        or volunteer.user_id = (select auth.uid())
      )
  )
);
create policy volunteer_eligibility_insert on public.volunteer_section_eligibility for insert to authenticated
with check (
  exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and private.has_org_role(volunteer.organization_id, array['owner', 'coordinator'])
  )
);
create policy volunteer_eligibility_delete on public.volunteer_section_eligibility for delete to authenticated
using (
  exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and private.has_org_role(volunteer.organization_id, array['owner', 'coordinator'])
  )
);

create policy event_groups_select on public.event_groups for select to authenticated
using (private.is_org_member(organization_id));
create policy event_groups_insert on public.event_groups for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
);
create policy event_groups_update on public.event_groups for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy event_groups_delete on public.event_groups for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

create policy event_group_volunteers_select on public.event_group_volunteers for select to authenticated
using (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.is_org_member(event_group.organization_id)
  )
);
create policy event_group_volunteers_insert on public.event_group_volunteers for insert to authenticated
with check (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.has_org_role(event_group.organization_id, array['owner', 'coordinator'])
  )
);
create policy event_group_volunteers_delete on public.event_group_volunteers for delete to authenticated
using (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.has_org_role(event_group.organization_id, array['owner', 'coordinator'])
  )
);

create policy staffing_requirements_select on public.staffing_requirements for select to authenticated
using (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.is_org_member(event_group.organization_id)
  )
);
create policy staffing_requirements_insert on public.staffing_requirements for insert to authenticated
with check (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.has_org_role(event_group.organization_id, array['owner', 'coordinator'])
  )
);
create policy staffing_requirements_update on public.staffing_requirements for update to authenticated
using (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.has_org_role(event_group.organization_id, array['owner', 'coordinator'])
  )
)
with check (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.has_org_role(event_group.organization_id, array['owner', 'coordinator'])
  )
);
create policy staffing_requirements_delete on public.staffing_requirements for delete to authenticated
using (
  exists (
    select 1 from public.event_groups event_group
    where event_group.id = event_group_id
      and private.has_org_role(event_group.organization_id, array['owner', 'coordinator'])
  )
);

create policy event_occurrences_select on public.event_occurrences for select to authenticated
using (private.is_org_member(organization_id));
create policy event_occurrences_insert on public.event_occurrences for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy event_occurrences_update on public.event_occurrences for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy event_occurrences_delete on public.event_occurrences for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

create policy unavailability_select on public.unavailability for select to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and volunteer.user_id = (select auth.uid())
  )
);
create policy unavailability_insert on public.unavailability for insert to authenticated
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and volunteer.user_id = (select auth.uid())
      and volunteer.organization_id = organization_id
  )
);
create policy unavailability_update on public.unavailability for update to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and volunteer.user_id = (select auth.uid())
  )
)
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and volunteer.user_id = (select auth.uid())
      and volunteer.organization_id = organization_id
  )
);
create policy unavailability_delete on public.unavailability for delete to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
  or exists (
    select 1 from public.volunteers volunteer
    where volunteer.id = volunteer_id
      and volunteer.user_id = (select auth.uid())
  )
);

create policy schedule_versions_select on public.schedule_versions for select to authenticated
using (private.is_org_member(organization_id));
create policy schedule_versions_insert on public.schedule_versions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
);
create policy schedule_versions_update on public.schedule_versions for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy schedule_versions_delete on public.schedule_versions for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

create policy assignments_select on public.assignments for select to authenticated
using (private.is_org_member(organization_id));
create policy assignments_insert on public.assignments for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy assignments_update on public.assignments for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (private.has_org_role(organization_id, array['owner', 'coordinator']));
create policy assignments_delete on public.assignments for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.service_sections to authenticated;
grant select, insert, update, delete on public.volunteers to authenticated;
grant select, insert, update, delete on public.volunteer_section_eligibility to authenticated;
grant select, insert, update, delete on public.event_groups to authenticated;
grant select, insert, update, delete on public.event_group_volunteers to authenticated;
grant select, insert, update, delete on public.staffing_requirements to authenticated;
grant select, insert, update, delete on public.event_occurrences to authenticated;
grant select, insert, update, delete on public.unavailability to authenticated;
grant select, insert, update, delete on public.schedule_versions to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

revoke all on all tables in schema public from anon;
