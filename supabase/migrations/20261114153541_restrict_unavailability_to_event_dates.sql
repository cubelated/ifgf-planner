-- Dates are computed without generating or storing extra event occurrences.
-- Saved month occurrences override recurrence, including explicit cancellations.
create or replace function private.unavailability_event_dates(target_organization_id uuid, target_month date, target_volunteer_id uuid)
returns date[] language sql stable security invoker set search_path = ''
as $dates$
  with bounds as (
    select o.timezone,
      target_month::timestamp at time zone o.timezone as starts_at,
      (target_month + interval '1 month')::timestamp at time zone o.timezone as ends_at
    from public.organizations o where o.id = target_organization_id
  ), events as (
    select e.* from public.event_groups e where e.organization_id = target_organization_id and e.is_active
      and (target_volunteer_id is null or exists (
        select 1 from public.event_group_volunteers m join public.volunteers v on v.id = m.volunteer_id
        where m.event_group_id = e.id and m.volunteer_id = target_volunteer_id
          and v.organization_id = target_organization_id and v.status = 'active'
      ))
  ), saved as (
    select o.event_group_id, (o.starts_at at time zone b.timezone)::date as event_date, o.status
    from public.event_occurrences o cross join bounds b
    where o.organization_id = target_organization_id and o.starts_at >= b.starts_at and o.starts_at < b.ends_at
  ), dates as (
    select s.event_date from saved s join events e on e.id = s.event_group_id where s.status <> 'cancelled'
    union
    select day::date from events e
    cross join generate_series(target_month::timestamp,
      (target_month + interval '1 month' - interval '1 day')::timestamp, interval '1 day') day
    where not exists (select 1 from saved s where s.event_group_id = e.id)
      and extract(dow from day)::integer = e.weekday
      and ((extract(day from day)::integer - 1) / 7 + 1) = any(e.week_occurrences)
  )
  select coalesce(array_agg(distinct event_date order by event_date), array[]::date[]) from dates;
$dates$;

revoke all on function private.unavailability_event_dates(uuid, date, uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.load_unavailability_form(request_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'eventDates', to_jsonb(private.unavailability_event_dates(request_record.organization_id, request_record.request_month, null)),
    'volunteers', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', volunteer.id, 'name', volunteer.full_name,
          'eventDates', to_jsonb(private.unavailability_event_dates(request_record.organization_id, request_record.request_month, volunteer.id)))
        order by lower(volunteer.full_name), volunteer.id
      )
      from public.volunteers volunteer
      where volunteer.organization_id = request_record.organization_id
        and volunteer.status = 'active'
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.save_unavailability_form(request_token text, respondent_name text, selected_volunteer_id uuid, unavailable_dates date[], response_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_record record;
  canonical_name text;
  normalized_dates date[];
  date_to_save date;
  allowed_event_dates date[];
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

  -- Match the browser's exact-name behavior; a null ID must not bypass membership restrictions.
  if selected_volunteer_id is null then
    select volunteer.id into selected_volunteer_id
    from public.volunteers volunteer
    where volunteer.organization_id = request_record.organization_id and volunteer.status = 'active'
      and lower(btrim(volunteer.full_name)) = lower(btrim(respondent_name))
    order by lower(volunteer.full_name), volunteer.id limit 1;
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

  allowed_event_dates := private.unavailability_event_dates(
    request_record.organization_id, request_record.request_month, selected_volunteer_id
  );
  if not normalized_dates <@ allowed_event_dates then
    raise exception 'Pilih hanya tanggal kegiatan yang tersedia untuk nama ini.'
      using errcode = '23514';
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
$function$
;

revoke all on function private.load_unavailability_form(text) from public, anon, authenticated;
grant execute on function private.load_unavailability_form(text) to service_role;
revoke all on function private.save_unavailability_form(text, text, uuid, date[], text) from public, anon, authenticated;
grant execute on function private.save_unavailability_form(text, text, uuid, date[], text) to service_role;
