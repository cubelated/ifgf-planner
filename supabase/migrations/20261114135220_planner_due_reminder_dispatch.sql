-- A cheap indexed existence check replaces idle Edge invocations.
create or replace function private.planner_line_work_due(check_at timestamptz default now())
returns boolean language sql stable security definer set search_path = ''
as $$
select exists (
  select 1 from public.line_event_reminder_settings s
  join public.event_groups e on e.id = s.event_id and e.is_active
  join public.organizations org on org.id = e.organization_id
  join public.line_group_connections c on c.event_id = e.id and c.status = 'active'
  join public.event_occurrences o on o.event_group_id = e.id and o.status = 'scheduled'
  left join public.line_message_deliveries d on d.line_group_connection_id = c.id
    and d.occurrence_key = o.id::text and d.reminder_type = 'before_start:' || s.reminder_minutes_before::text
  where s.enabled and o.ends_at > check_at
    and o.starts_at >= check_at + make_interval(mins => s.reminder_minutes_before) - interval '15 minutes'
    and o.starts_at <= check_at + make_interval(mins => s.reminder_minutes_before)
    and exists (select 1 from public.assignments a where a.occurrence_id = o.id and a.status <> 'declined')
    and (not s.require_published_schedule or exists (
      select 1 from public.schedule_shares sh where sh.event_group_id = e.id
        and sh.organization_id = e.organization_id
        and sh.share_month = date_trunc('month', o.starts_at at time zone org.timezone)::date
    ))
    and (d.id is null or (d.attempt_count < 3 and d.created_at > check_at - interval '23 hours' and (
      d.status = 'failed' or (d.status = 'processing' and d.updated_at < check_at - interval '5 minutes')
    )))
) or exists (
  select 1 from public.line_unavailability_broadcasts b
  join public.unavailability_requests r on r.id = b.request_id
  join public.organizations org on org.id = r.organization_id
  where b.status = 'scheduled' and (
    r.status <> 'open' or r.expires_on < (check_at at time zone org.timezone)::date
    or exists (
      select 1 from public.line_group_connections c where c.event_id = b.event_id and c.status = 'active'
      and exists (
        select 1 from (values
          ('unavailability_announcement', b.announce_at, b.announced_at),
          ('unavailability_expiry', b.reminder_at, b.reminder_sent_at)
        ) j(kind, scheduled_for, sent_at)
        left join public.line_message_deliveries d on d.line_group_connection_id = c.id
          and d.occurrence_key = 'unavailability:' || b.id::text and d.reminder_type = j.kind
        where j.sent_at is null and j.scheduled_for <= check_at and (
          -- An accepted delivery may need its broadcast state reconciled after a crash.
          d.id is null or d.status = 'sent' or (d.attempt_count < 3 and d.created_at > check_at - interval '23 hours' and (
            d.status = 'failed' or (d.status = 'processing' and d.updated_at < check_at - interval '5 minutes')
          ))
        )
      )
    )
  )
);
$$;
revoke all on function private.planner_line_work_due(timestamptz) from public, anon, authenticated, service_role;

create or replace function private.dispatch_due_line_reminders()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare request_id bigint; project_url text; publishable_key text; maintenance_token text;
begin
  if not private.planner_line_work_due() then return null; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'line_reminder_project_url';
  select decrypted_secret into publishable_key from vault.decrypted_secrets where name = 'line_reminder_publishable_key';
  select decrypted_secret into maintenance_token from vault.decrypted_secrets where name = 'planner_maintenance_token';
  if project_url is null or publishable_key is null or maintenance_token is null then
    raise exception 'LINE reminder Vault configuration is incomplete';
  end if;
  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-line-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', publishable_key),
    body := jsonb_build_object('token', maintenance_token), timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.dispatch_due_line_reminders() from public, anon, authenticated, service_role;
select cron.schedule('send-line-reminders-every-minute', '* * * * *',
  'select private.dispatch_due_line_reminders()');
