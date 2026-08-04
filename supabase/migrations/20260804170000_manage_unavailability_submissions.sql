create or replace function public.update_unavailability_submission(
  submission_ids uuid[],
  target_volunteer_id uuid,
  respondent_name text,
  unavailable_dates date[],
  response_reason text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  source_record record;
  canonical_name text;
  normalized_dates date[];
  date_to_save date;
begin
  if coalesce(cardinality(submission_ids), 0) = 0 then
    raise exception 'Submission rows are required.' using errcode = '22023';
  end if;

  select
    min(absence.organization_id::text)::uuid as organization_id,
    min(absence.request_id::text)::uuid as request_id,
    count(*) as row_count,
    count(distinct absence.organization_id) as organization_count,
    count(distinct absence.request_id) as request_count
  into source_record
  from public.unavailability absence
  where absence.id = any(submission_ids)
    and absence.request_id is not null;

  if source_record.row_count <> cardinality(submission_ids)
    or source_record.organization_count <> 1
    or source_record.request_count <> 1 then
    raise exception 'The submission could not be found.' using errcode = '22023';
  end if;

  if not private.has_org_role(
    source_record.organization_id,
    array['owner', 'coordinator']
  ) then
    raise exception 'Only coordinators can update unavailability submissions.'
      using errcode = '42501';
  end if;

  select array_agg(distinct requested_date order by requested_date)
  into normalized_dates
  from unnest(unavailable_dates) requested_date
  where requested_date is not null;

  if coalesce(cardinality(normalized_dates), 0) = 0 then
    raise exception 'Select at least one unavailable date.' using errcode = '23514';
  end if;

  if target_volunteer_id is not null then
    select volunteer.full_name
    into canonical_name
    from public.volunteers volunteer
    where volunteer.id = target_volunteer_id
      and volunteer.organization_id = source_record.organization_id
      and volunteer.status = 'active';

    if canonical_name is null then
      raise exception 'The selected volunteer is not active in this organization.'
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

  delete from public.unavailability absence
  where absence.id = any(submission_ids);

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
      source_record.organization_id,
      target_volunteer_id,
      null,
      source_record.request_id,
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
end;
$function$;

create or replace function public.delete_unavailability_submission(
  submission_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  target_organization_id uuid;
  matched_count integer;
begin
  if coalesce(cardinality(submission_ids), 0) = 0 then
    raise exception 'Submission rows are required.' using errcode = '22023';
  end if;

  select min(absence.organization_id::text)::uuid, count(*)
  into target_organization_id, matched_count
  from public.unavailability absence
  where absence.id = any(submission_ids)
    and absence.request_id is not null;

  if matched_count <> cardinality(submission_ids) then
    raise exception 'The submission could not be found.' using errcode = '22023';
  end if;

  if not private.has_org_role(
    target_organization_id,
    array['owner', 'coordinator']
  ) then
    raise exception 'Only coordinators can delete unavailability submissions.'
      using errcode = '42501';
  end if;

  delete from public.unavailability absence
  where absence.id = any(submission_ids);
end;
$function$;

revoke all on function public.update_unavailability_submission(uuid[], uuid, text, date[], text) from public, anon;
grant execute on function public.update_unavailability_submission(uuid[], uuid, text, date[], text) to authenticated, service_role;
revoke all on function public.delete_unavailability_submission(uuid[]) from public, anon;
grant execute on function public.delete_unavailability_submission(uuid[]) to authenticated, service_role;

