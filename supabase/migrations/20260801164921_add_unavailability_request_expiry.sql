alter table public.unavailability_requests
  add column expires_on date;

update public.unavailability_requests
set expires_on = (request_month + interval '1 month - 1 day')::date
where expires_on is null;

alter table public.unavailability_requests
  alter column expires_on set not null;

drop function public.create_unavailability_request(uuid, date, text);

create function public.create_unavailability_request(
  target_organization_id uuid,
  target_month date,
  target_expires_on date,
  request_token text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_request_id uuid;
  organization_timezone text;
  organization_today date;
begin
  if not private.has_org_role(target_organization_id, array['owner', 'coordinator']) then
    raise exception 'Only coordinators can create an unavailability request.'
      using errcode = '42501';
  end if;

  select organization.timezone
  into organization_timezone
  from public.organizations organization
  where organization.id = target_organization_id;

  if organization_timezone is null then
    raise exception 'Organization does not exist.' using errcode = '23514';
  end if;

  organization_today := (now() at time zone organization_timezone)::date;

  if target_month <> date_trunc('month', target_month)::date then
    raise exception 'Request month must be the first day of a month.'
      using errcode = '23514';
  end if;
  if target_expires_on is null
    or target_expires_on < organization_today
    or target_expires_on >= (target_month + interval '1 month')::date then
    raise exception 'Expiry must be between today and the final day of the requested month.'
      using errcode = '23514';
  end if;
  if char_length(request_token) < 32 then
    raise exception 'Request token is too short.' using errcode = '23514';
  end if;

  insert into public.unavailability_requests (
    organization_id,
    request_month,
    expires_on,
    token_hash,
    status,
  ) values (
    target_organization_id,
    target_month,
    target_expires_on,
    encode(extensions.digest(request_token, 'sha256'), 'hex'),
    'open',
  )
  on conflict (organization_id, request_month) do update
  set expires_on = excluded.expires_on,
      token_hash = excluded.token_hash,
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
  form_expired boolean;
begin
  if char_length(request_token) < 32 then
    return null;
  end if;

  select
    request.id,
    request.organization_id,
    request.request_month,
    request.expires_on,
    request.status,
    organization.name as organization_name,
    organization.timezone
  into request_record
  from public.unavailability_requests request
  join public.organizations organization
    on organization.id = request.organization_id
  where request.token_hash = encode(extensions.digest(request_token, 'sha256'), 'hex');

  if request_record.id is null then
    return null;
  end if;

  form_expired :=
    (now() at time zone request_record.timezone)::date > request_record.expires_on;

  if request_record.status <> 'open' or form_expired then
    return jsonb_build_object(
      'status', 'closed',
      'closedReason', case when form_expired then 'expired' else 'closed' end,
      'organizationName', request_record.organization_name,
      'month', to_char(request_record.request_month, 'YYYY-MM'),
      'expiresOn', request_record.expires_on
    );
  end if;

  return jsonb_build_object(
    'status', 'open',
    'organizationName', request_record.organization_name,
    'month', to_char(request_record.request_month, 'YYYY-MM'),
    'expiresOn', request_record.expires_on,
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
  date_to_save date;
begin
  if char_length(request_token) < 32 then
    raise exception 'UNAVAILABILITY_FORM_CLOSED' using errcode = '22023';
  end if;

  select
    request.id,
    request.organization_id,
    request.request_month,
    request.expires_on,
    request.status,
    organization.timezone
  into request_record
  from public.unavailability_requests request
  join public.organizations organization
    on organization.id = request.organization_id
  where request.token_hash = encode(extensions.digest(request_token, 'sha256'), 'hex');

  if request_record.id is null or request_record.status <> 'open' then
    raise exception 'UNAVAILABILITY_FORM_CLOSED' using errcode = '22023';
  end if;
  if (now() at time zone request_record.timezone)::date > request_record.expires_on then
    raise exception 'UNAVAILABILITY_FORM_EXPIRED' using errcode = '22023';
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
    from unnest(normalized_dates) requested_unavailable_date
    where requested_unavailable_date < request_record.request_month
       or requested_unavailable_date >=
          (request_record.request_month + interval '1 month')::date
  ) then
    raise exception 'An unavailable date is outside the requested month.'
      using errcode = '23514';
  end if;

  if selected_volunteer_id is not null then
    select volunteer.full_name
    into canonical_name
    from public.volunteers volunteer
    where volunteer.id = selected_volunteer_id
      and volunteer.organization_id = request_record.organization_id
      and volunteer.status = 'active';

    if canonical_name is null then
      raise exception 'The selected volunteer is not available in this form.'
        using errcode = '23514';
    end if;
  else
    canonical_name := btrim(respondent_name);
    if canonical_name is null
      or char_length(canonical_name) not between 2 and 120 then
      raise exception 'Enter a name between 2 and 120 characters.'
        using errcode = '23514';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    request_record.id::text
      || ':'
      || coalesce(selected_volunteer_id::text, lower(canonical_name)),
    0
  ));

  if selected_volunteer_id is not null then
    delete from public.unavailability absence
    where absence.request_id = request_record.id
      and absence.volunteer_id = selected_volunteer_id;

    foreach date_to_save in array normalized_dates loop
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
        date_to_save,
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

    foreach date_to_save in array normalized_dates loop
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
        date_to_save,
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

revoke all on function public.create_unavailability_request(uuid, date, date, text)
  from public, anon;
grant execute on function public.create_unavailability_request(uuid, date, date, text)
  to authenticated, service_role;

revoke all on function private.load_unavailability_form(text)
  from public, anon, authenticated;
grant execute on function private.load_unavailability_form(text)
  to service_role;

revoke all on function private.save_unavailability_form(text, text, uuid, date[], text)
  from public, anon, authenticated;
grant execute on function private.save_unavailability_form(text, text, uuid, date[], text)
  to service_role;

revoke all on function public.get_unavailability_form(text)
  from public, anon, authenticated;
grant execute on function public.get_unavailability_form(text)
  to service_role;

revoke all on function public.submit_unavailability_form(text, text, uuid, date[], text)
  from public, anon, authenticated;
grant execute on function public.submit_unavailability_form(text, text, uuid, date[], text)
  to service_role;
