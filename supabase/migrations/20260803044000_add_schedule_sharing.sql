create table if not exists public.schedule_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_group_id uuid not null references public.event_groups(id) on delete cascade,
  share_month date not null check (
    share_month = date_trunc('month', share_month)::date
  ),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists schedule_shares_event_month_idx
  on public.schedule_shares(event_group_id, share_month desc);

alter table public.schedule_shares enable row level security;

drop policy if exists schedule_shares_select on public.schedule_shares;
create policy schedule_shares_select
on public.schedule_shares for select to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

drop policy if exists schedule_shares_insert on public.schedule_shares;
create policy schedule_shares_insert
on public.schedule_shares for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
);

drop policy if exists schedule_shares_delete on public.schedule_shares;
create policy schedule_shares_delete
on public.schedule_shares for delete to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

grant select, insert, update, delete on public.schedule_shares to authenticated;
grant all on public.schedule_shares to service_role;
revoke all on public.schedule_shares from anon;

create or replace function public.create_schedule_share(
  target_organization_id uuid,
  target_event_group_id uuid,
  target_month date,
  share_token text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  created_share_id uuid;
begin
  if not private.has_org_role(
    target_organization_id,
    array['owner', 'coordinator']
  ) then
    raise exception 'Only coordinators can share a schedule.'
      using errcode = '42501';
  end if;

  if target_month <> date_trunc('month', target_month)::date then
    raise exception 'Share month must be the first day of a month.'
      using errcode = '23514';
  end if;

  if char_length(share_token) < 32 or char_length(share_token) > 128 then
    raise exception 'Share token length is invalid.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.event_groups event_group
    where event_group.id = target_event_group_id
      and event_group.organization_id = target_organization_id
  ) then
    raise exception 'Event does not belong to this organization.'
      using errcode = '23514';
  end if;

  insert into public.schedule_shares (
    organization_id,
    event_group_id,
    share_month,
    token_hash,
    created_by
  ) values (
    target_organization_id,
    target_event_group_id,
    target_month,
    encode(extensions.digest(share_token, 'sha256'), 'hex'),
    (select auth.uid())
  )
  returning id into created_share_id;

  return created_share_id;
end;
$$;

create or replace function private.load_shared_schedule(share_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  share_record record;
begin
  if char_length(share_token) < 32 or char_length(share_token) > 128 then
    return null;
  end if;

  select
    schedule_share.id,
    schedule_share.organization_id,
    schedule_share.event_group_id,
    schedule_share.share_month,
    organization.name as organization_name,
    organization.timezone,
    event_group.name as event_name
  into share_record
  from public.schedule_shares schedule_share
  join public.organizations organization
    on organization.id = schedule_share.organization_id
  join public.event_groups event_group
    on event_group.id = schedule_share.event_group_id
   and event_group.organization_id = schedule_share.organization_id
  where schedule_share.token_hash =
    encode(extensions.digest(share_token, 'sha256'), 'hex');

  if share_record.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'organizationName', share_record.organization_name,
    'eventName', share_record.event_name,
    'month', to_char(share_record.share_month, 'YYYY-MM'),
    'timezone', share_record.timezone,
    'occurrences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'startsAt', occurrence.starts_at,
          'endsAt', occurrence.ends_at,
          'status', occurrence.status
        )
        order by occurrence.starts_at, occurrence.id
      )
      from public.event_occurrences occurrence
      where occurrence.event_group_id = share_record.event_group_id
        and occurrence.organization_id = share_record.organization_id
        and (occurrence.starts_at at time zone share_record.timezone)::date
          >= share_record.share_month
        and (occurrence.starts_at at time zone share_record.timezone)::date
          < (share_record.share_month + interval '1 month')::date
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', section.name,
          'neededCount', requirement.needed_count,
          'volunteersByOccurrence', coalesce((
            select jsonb_agg(
              coalesce((
                select jsonb_agg(
                  volunteer.full_name
                  order by lower(volunteer.full_name), volunteer.id
                )
                from public.assignments assignment
                join public.volunteers volunteer
                  on volunteer.id = assignment.volunteer_id
                where assignment.occurrence_id = occurrence.id
                  and assignment.section_id = section.id
                  and assignment.organization_id = share_record.organization_id
                  and assignment.status <> 'declined'
              ), '[]'::jsonb)
              order by occurrence.starts_at, occurrence.id
            )
            from public.event_occurrences occurrence
            where occurrence.event_group_id = share_record.event_group_id
              and occurrence.organization_id = share_record.organization_id
              and (occurrence.starts_at at time zone share_record.timezone)::date
                >= share_record.share_month
              and (occurrence.starts_at at time zone share_record.timezone)::date
                < (share_record.share_month + interval '1 month')::date
          ), '[]'::jsonb)
        )
        order by section.sort_order, lower(section.name), section.id
      )
      from public.staffing_requirements requirement
      join public.service_sections section
        on section.id = requirement.section_id
      where requirement.event_group_id = share_record.event_group_id
        and section.organization_id = share_record.organization_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_shared_schedule(share_token text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.load_shared_schedule(share_token);
$$;

revoke all on function public.create_schedule_share(uuid, uuid, date, text)
from public, anon;
grant execute on function public.create_schedule_share(uuid, uuid, date, text)
to authenticated, service_role;

revoke all on function private.load_shared_schedule(text)
from public, anon, authenticated;
grant execute on function private.load_shared_schedule(text)
to service_role;

revoke all on function public.get_shared_schedule(text)
from public, anon, authenticated;
grant execute on function public.get_shared_schedule(text)
to service_role;
