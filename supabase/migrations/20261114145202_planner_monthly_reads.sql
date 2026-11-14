-- Aggregate reads run as the caller: existing RLS remains the source of authorization.
create or replace function public.get_planner_month(target_organization_id uuid, target_month date)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  org_timezone text;
  range_start timestamptz;
  range_end timestamptz;
begin
  if target_month is null or target_month <> date_trunc('month', target_month)::date then
    raise exception 'Month must be the first day of a month.' using errcode = '22023';
  end if;
  select timezone into org_timezone from public.organizations where id = target_organization_id;
  if org_timezone is null then
    raise exception 'Organization is unavailable.' using errcode = '42501';
  end if;
  range_start := target_month::timestamp at time zone org_timezone;
  range_end := (target_month + interval '1 month')::timestamp at time zone org_timezone;
  return jsonb_build_object(
    'occurrences', coalesce((select jsonb_agg(to_jsonb(o) order by o.starts_at, o.id)
      from public.event_occurrences o where o.organization_id = target_organization_id
      and o.starts_at >= range_start and o.starts_at < range_end), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
      from public.assignments a join public.event_occurrences o on o.id = a.occurrence_id
      where a.organization_id = target_organization_id and o.organization_id = target_organization_id
      and o.starts_at >= range_start and o.starts_at < range_end), '[]'::jsonb),
    'unavailability', coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at desc, u.id)
      from public.unavailability u where u.organization_id = target_organization_id
      and u.unavailable_date >= target_month and u.unavailable_date < (target_month + interval '1 month')::date), '[]'::jsonb),
    'unavailabilityRequests', coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
      from public.unavailability_requests r where r.organization_id = target_organization_id
      and r.request_month = target_month), '[]'::jsonb),
    'lineUnavailabilityBroadcasts', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc, b.id)
      from public.line_unavailability_broadcasts b join public.unavailability_requests r on r.id = b.request_id
      where r.organization_id = target_organization_id and r.request_month = target_month), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_planner_metadata(target_organization_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare org_timezone text;
begin
  select timezone into org_timezone from public.organizations where id = target_organization_id;
  if org_timezone is null then
    raise exception 'Organization is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'eventMonths', coalesce((select jsonb_agg(jsonb_build_object('eventId', event_id, 'month', month) order by month, event_id)
      from (select distinct event_group_id as event_id, to_char(starts_at at time zone org_timezone, 'YYYY-MM') as month
        from public.event_occurrences where organization_id = target_organization_id) m), '[]'::jsonb),
    'requestMonths', coalesce((select jsonb_agg(month order by month desc) from (
      select to_char(request_month, 'YYYY-MM') as month from public.unavailability_requests where organization_id = target_organization_id
      union select to_char(unavailable_date, 'YYYY-MM') from public.unavailability where organization_id = target_organization_id
    ) m), '[]'::jsonb),
    'unreadCount', (select count(*) from (
      select distinct u.request_id, coalesce(u.volunteer_id::text, lower(btrim(u.submitted_name)), u.id::text) as respondent
      from public.unavailability u
      where u.organization_id = target_organization_id and u.request_id is not null
      and u.created_at > coalesce((select r.last_seen_at from public.unavailability_read_states r
        where r.organization_id = target_organization_id and r.user_id = (select auth.uid())), '-infinity'::timestamptz)
    ) unread),
    'recentAbsenceCount', (select count(*) from public.unavailability
      where organization_id = target_organization_id and created_at > now() - interval '2 days'),
    'nextOccurrences', coalesce((select jsonb_agg(to_jsonb(n) order by n.starts_at, n.id) from (
      select distinct on (event_group_id) * from public.event_occurrences
      where organization_id = target_organization_id and starts_at >= now()
      order by event_group_id, starts_at, id
    ) n), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_planner_month(uuid, date) from public, anon;
revoke all on function public.get_planner_metadata(uuid) from public, anon;
grant execute on function public.get_planner_month(uuid, date) to authenticated;
grant execute on function public.get_planner_metadata(uuid) to authenticated;

-- Cover foreign keys without adding speculative indexes to every timestamp.
create index if not exists schedule_shares_organization_idx on public.schedule_shares (organization_id);
create index if not exists unavailability_volunteer_idx on public.unavailability (volunteer_id);
create index if not exists unavailability_read_states_user_idx on public.unavailability_read_states (user_id);
-- The existing unique index (occurrence_id, section_id, volunteer_id) covers occurrence_id.
drop index if exists public.assignments_occurrence_idx;
