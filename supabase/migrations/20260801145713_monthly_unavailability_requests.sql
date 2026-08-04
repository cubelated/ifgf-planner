create table public.unavailability_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_month date not null,
  token_hash text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_month),
  check (request_month = date_trunc('month', request_month)::date),
  check (token_hash ~ '^[0-9a-f]{64}$')
);

create index unavailability_requests_org_month_idx
  on public.unavailability_requests(organization_id, request_month desc);

create trigger unavailability_requests_set_updated_at
before update on public.unavailability_requests
for each row execute function public.set_updated_at();

alter table public.unavailability
  add column request_id uuid references public.unavailability_requests(id) on delete set null,
  add column submitted_name text;

alter table public.unavailability
  alter column volunteer_id drop not null,
  alter column occurrence_id drop not null;

alter table public.unavailability
  drop constraint if exists unavailability_volunteer_id_occurrence_id_key;

alter table public.unavailability
  add constraint unavailability_identity_required check (
    volunteer_id is not null
    or char_length(btrim(submitted_name)) between 2 and 120
  ),
  add constraint unavailability_source_required check (
    occurrence_id is not null or request_id is not null
  );

create unique index unavailability_volunteer_date_unique
  on public.unavailability(organization_id, volunteer_id, unavailable_date)
  where volunteer_id is not null;

create unique index unavailability_request_name_date_unique
  on public.unavailability(request_id, lower(btrim(submitted_name)), unavailable_date)
  where volunteer_id is null and request_id is not null;

create index unavailability_request_idx
  on public.unavailability(request_id)
  where request_id is not null;

create or replace function private.validate_unavailability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  occurrence_organization_id uuid;
  volunteer_organization_id uuid;
  occurrence_date date;
  request_organization_id uuid;
  request_month date;
begin
  if new.volunteer_id is not null then
    select volunteer.organization_id, volunteer.full_name
    into volunteer_organization_id, new.submitted_name
    from public.volunteers volunteer
    where volunteer.id = new.volunteer_id;

    if volunteer_organization_id is null then
      raise exception 'Volunteer does not exist.' using errcode = '23514';
    end if;
    if volunteer_organization_id <> new.organization_id then
      raise exception 'Volunteer belongs to another organization.' using errcode = '23514';
    end if;
  elsif new.submitted_name is null
    or char_length(btrim(new.submitted_name)) not between 2 and 120 then
    raise exception 'A respondent name between 2 and 120 characters is required.' using errcode = '23514';
  else
    new.submitted_name = btrim(new.submitted_name);
  end if;

  if new.occurrence_id is not null then
    select
      occurrence.organization_id,
      (occurrence.starts_at at time zone organization.timezone)::date
    into occurrence_organization_id, occurrence_date
    from public.event_occurrences occurrence
    join public.organizations organization on organization.id = occurrence.organization_id
    where occurrence.id = new.occurrence_id;

    if occurrence_organization_id is null then
      raise exception 'Occurrence does not exist.' using errcode = '23514';
    end if;
    if occurrence_organization_id <> new.organization_id then
      raise exception 'Occurrence belongs to another organization.' using errcode = '23514';
    end if;
    new.unavailable_date = occurrence_date;
  end if;

  if new.request_id is not null then
    select request.organization_id, request.request_month
    into request_organization_id, request_month
    from public.unavailability_requests request
    where request.id = new.request_id;

    if request_organization_id is null then
      raise exception 'Unavailability request does not exist.' using errcode = '23514';
    end if;
    if request_organization_id <> new.organization_id then
      raise exception 'Request belongs to another organization.' using errcode = '23514';
    end if;
    if new.unavailable_date < request_month
      or new.unavailable_date >= (request_month + interval '1 month')::date then
      raise exception 'Unavailable date is outside the requested month.' using errcode = '23514';
    end if;
  end if;

  if new.unavailable_date is null then
    raise exception 'Unavailable date is required.' using errcode = '23514';
  end if;

  new.reason = nullif(btrim(new.reason), '');
  return new;
end;
$$;

create or replace function private.validate_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  occurrence_organization_id uuid;
  occurrence_event_group_id uuid;
  occurrence_date date;
  volunteer_organization_id uuid;
  volunteer_status text;
begin
  select
    occurrence.organization_id,
    occurrence.event_group_id,
    (occurrence.starts_at at time zone organization.timezone)::date
  into occurrence_organization_id, occurrence_event_group_id, occurrence_date
  from public.event_occurrences occurrence
  join public.organizations organization on organization.id = occurrence.organization_id
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
      and (
        absence.occurrence_id = new.occurrence_id
        or absence.unavailable_date = occurrence_date
      )
  ) then
    raise exception 'Volunteer is unavailable for this date.' using errcode = '23514';
  end if;

  return new;
end;
$$;

alter table public.unavailability_requests enable row level security;

create policy unavailability_requests_select
on public.unavailability_requests for select to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

create policy unavailability_requests_insert
on public.unavailability_requests for insert to authenticated
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

create policy unavailability_requests_update
on public.unavailability_requests for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']))
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

create policy unavailability_requests_delete
on public.unavailability_requests for delete to authenticated
using (private.has_org_role(organization_id, array['owner', 'coordinator']));

grant select, insert, update, delete on public.unavailability_requests to authenticated;
revoke all on public.unavailability_requests from anon;

create or replace function public.create_unavailability_request(
  target_organization_id uuid,
  target_month date,
  request_token text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_request_id uuid;
begin
  if not private.has_org_role(target_organization_id, array['owner', 'coordinator']) then
    raise exception 'Only coordinators can create an unavailability request.' using errcode = '42501';
  end if;
  if target_month <> date_trunc('month', target_month)::date then
    raise exception 'Request month must be the first day of a month.' using errcode = '23514';
  end if;
  if char_length(request_token) < 32 then
    raise exception 'Request token is too short.' using errcode = '23514';
  end if;

  insert into public.unavailability_requests (
    organization_id,
    request_month,
    token_hash,
    status,
  ) values (
    target_organization_id,
    target_month,
    encode(extensions.digest(request_token, 'sha256'), 'hex'),
    'open',
  )
  on conflict (organization_id, request_month) do update
  set token_hash = excluded.token_hash,
      status = 'open',
      updated_at = now()
  returning id into created_request_id;

  return created_request_id;
end;
$$;

create or replace function private.load_unavailability_form(request_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_record record;
begin
  if char_length(request_token) < 32 then
    return null;
  end if;

  select request.id, request.organization_id, request.request_month,
         organization.name as organization_name, organization.timezone
  into request_record
  from public.unavailability_requests request
  join public.organizations organization on organization.id = request.organization_id
  where request.token_hash = encode(extensions.digest(request_token, 'sha256'), 'hex')
    and request.status = 'open';

  if request_record.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'organizationName', request_record.organization_name,
    'month', to_char(request_record.request_month, 'YYYY-MM'),
    'timezone', request_record.timezone,
    'volunteers', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', volunteer.id, 'name', volunteer.full_name)
        order by lower(volunteer.full_name), volunteer.id
      )
      from public.volunteers volunteer
      where volunteer.organization_id = request_record.organization_id
        and volunteer.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_unavailability_form(request_token text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.load_unavailability_form(request_token);
$$;

create or replace function private.save_unavailability_form(
  request_token text,
  respondent_name text,
  selected_volunteer_id uuid,
  unavailable_dates date[],
  response_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record record;
  canonical_name text;
  normalized_dates date[];
  unavailable_date date;
begin
  if char_length(request_token) < 32 then
    raise exception 'This request link is invalid or closed.' using errcode = '22023';
  end if;

  select request.id, request.organization_id, request.request_month
  into request_record
  from public.unavailability_requests request
  where request.token_hash = encode(extensions.digest(request_token, 'sha256'), 'hex')
    and request.status = 'open';

  if request_record.id is null then
    raise exception 'This request link is invalid or closed.' using errcode = '22023';
  end if;

  select array_agg(distinct requested_date order by requested_date)
  into normalized_dates
  from unnest(unavailable_dates) requested_date
  where requested_date is not null;

  if coalesce(cardinality(normalized_dates), 0) = 0 then
    raise exception 'Select at least one unavailable date.' using errcode = '23514';
  end if;
  if cardinality(normalized_dates) > 31 then
    raise exception 'Too many unavailable dates were selected.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from unnest(normalized_dates) selected_date
    where selected_date < request_record.request_month
       or selected_date >= (request_record.request_month + interval '1 month')::date
  ) then
    raise exception 'An unavailable date is outside the requested month.' using errcode = '23514';
  end if;

  if selected_volunteer_id is not null then
    select volunteer.full_name
    into canonical_name
    from public.volunteers volunteer
    where volunteer.id = selected_volunteer_id
      and volunteer.organization_id = request_record.organization_id
      and volunteer.status = 'active';

    if canonical_name is null then
      raise exception 'The selected volunteer is not available in this form.' using errcode = '23514';
    end if;
  else
    canonical_name = btrim(respondent_name);
    if canonical_name is null or char_length(canonical_name) not between 2 and 120 then
      raise exception 'Enter a name between 2 and 120 characters.' using errcode = '23514';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    request_record.id::text || ':' || coalesce(selected_volunteer_id::text, lower(canonical_name)),
    0
  ));

  if selected_volunteer_id is not null then
    delete from public.unavailability absence
    where absence.request_id = request_record.id
      and absence.volunteer_id = selected_volunteer_id;

    foreach unavailable_date in array normalized_dates loop
      insert into public.unavailability (
        organization_id,
        volunteer_id,
        occurrence_id,
        request_id,
        submitted_name,
        unavailable_date,
        reason
      ) values (
        request_record.organization_id,
        selected_volunteer_id,
        null,
        request_record.id,
        canonical_name,
        unavailable_date,
        nullif(btrim(response_reason), '')
      )
      on conflict (organization_id, volunteer_id, unavailable_date)
        where volunteer_id is not null
      do update set
        request_id = excluded.request_id,
        submitted_name = excluded.submitted_name,
        reason = excluded.reason,
        updated_at = now();
    end loop;
  else
    delete from public.unavailability absence
    where absence.request_id = request_record.id
      and absence.volunteer_id is null
      and lower(btrim(absence.submitted_name)) = lower(canonical_name);

    foreach unavailable_date in array normalized_dates loop
      insert into public.unavailability (
        organization_id,
        volunteer_id,
        occurrence_id,
        request_id,
        submitted_name,
        unavailable_date,
        reason
      ) values (
        request_record.organization_id,
        null,
        null,
        request_record.id,
        canonical_name,
        unavailable_date,
        nullif(btrim(response_reason), '')
      );
    end loop;
  end if;

  return jsonb_build_object(
    'name', canonical_name,
    'dateCount', cardinality(normalized_dates)
  );
end;
$$;

create or replace function public.submit_unavailability_form(
  request_token text,
  respondent_name text,
  selected_volunteer_id uuid,
  unavailable_dates date[],
  response_reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_unavailability_form(
    request_token,
    respondent_name,
    selected_volunteer_id,
    unavailable_dates,
    response_reason
  );
$$;

revoke all on function public.create_unavailability_request(uuid, date, text) from public, anon;
grant execute on function public.create_unavailability_request(uuid, date, text) to authenticated, service_role;

revoke all on function private.load_unavailability_form(text) from public;
grant execute on function private.load_unavailability_form(text) to anon, authenticated, service_role;
revoke all on function public.get_unavailability_form(text) from public;
grant execute on function public.get_unavailability_form(text) to anon, authenticated, service_role;

revoke all on function private.save_unavailability_form(text, text, uuid, date[], text) from public;
grant execute on function private.save_unavailability_form(text, text, uuid, date[], text) to anon, authenticated, service_role;
revoke all on function public.submit_unavailability_form(text, text, uuid, date[], text) from public;
grant execute on function public.submit_unavailability_form(text, text, uuid, date[], text) to anon, authenticated, service_role;
