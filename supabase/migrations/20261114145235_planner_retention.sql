-- Operational records only. Never delete schedules, assignments, responses, or share links.
create or replace function private.prune_planner_cron_history(batch_size integer default 5000)
returns integer language plpgsql security definer set search_path = ''
as $$
declare removed integer;
begin
  if batch_size < 1 or batch_size > 10000 then raise exception 'Invalid batch size'; end if;
  delete from cron.job_run_details where runid in (
    select runid from cron.job_run_details
    where end_time < now() - interval '30 days' and status in ('succeeded', 'failed')
    order by end_time, runid limit batch_size
  );
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function private.prune_planner_cron_history(integer) from public, anon, authenticated, service_role;

create or replace function private.prune_planner_operations(batch_size integer default 1000)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare codes integer; deliveries integer; broadcasts integer;
begin
  if batch_size < 1 or batch_size > 10000 then raise exception 'Invalid batch size'; end if;
  delete from public.line_group_connection_codes where id in (
    select id from public.line_group_connection_codes
    where expires_at < now() - interval '30 days' order by expires_at, id limit batch_size
  );
  get diagnostics codes = row_count;
  delete from public.line_message_deliveries where id in (
    select d.id from public.line_message_deliveries d
    where (d.status = 'sent' or (d.status = 'failed' and d.attempt_count >= 3))
      and d.updated_at < now() - interval '90 days'
      and d.scheduled_for < now() - interval '90 days'
      and not exists (select 1 from public.event_occurrences o
        where o.id::text = d.occurrence_key and o.ends_at >= now() - interval '90 days')
      and not exists (select 1 from public.line_unavailability_broadcasts b
        where 'unavailability:' || b.id::text = d.occurrence_key and b.status = 'scheduled')
    order by d.updated_at, d.id limit batch_size
  );
  get diagnostics deliveries = row_count;
  delete from public.line_unavailability_broadcasts where id in (
    select b.id from public.line_unavailability_broadcasts b
    join public.unavailability_requests r on r.id = b.request_id
    join public.organizations o on o.id = r.organization_id
    where b.status in ('completed', 'cancelled') and b.updated_at < now() - interval '90 days'
      and r.expires_on < (now() at time zone o.timezone)::date
    order by b.updated_at, b.id limit batch_size
  );
  get diagnostics broadcasts = row_count;
  return jsonb_build_object('connectionCodes', codes, 'deliveries', deliveries, 'broadcasts', broadcasts);
end;
$$;
revoke all on function private.prune_planner_operations(integer) from public, anon, authenticated, service_role;

-- A random maintenance credential stays in Vault; it never reaches the browser or Git.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'planner_maintenance_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'planner_maintenance_token');
  end if;
end;
$$;

create or replace function public.validate_planner_maintenance_token(request_token text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select char_length(request_token) = 64 and exists (
    select 1 from vault.decrypted_secrets where name = 'planner_maintenance_token'
    and extensions.digest(request_token, 'sha256') = extensions.digest(decrypted_secret, 'sha256')
  );
$$;
revoke all on function public.validate_planner_maintenance_token(text) from public, anon, authenticated;
grant execute on function public.validate_planner_maintenance_token(text) to service_role;

-- Read metadata through SQL; delete actual objects exclusively through the Storage API.
create or replace function public.expired_planner_exports(batch_size integer default 100)
returns table(name text) language sql stable security definer set search_path = ''
as $$
  select o.name from storage.objects o where o.bucket_id = 'line-schedule-exports'
    and o.created_at < now() - interval '30 days' and o.updated_at < now() - interval '30 days'
  order by o.created_at, o.name limit least(greatest(batch_size, 1), 100);
$$;
revoke all on function public.expired_planner_exports(integer) from public, anon, authenticated;
grant execute on function public.expired_planner_exports(integer) to service_role;

create or replace function private.dispatch_planner_maintenance(force_run boolean default false)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare request_id bigint; project_url text; publishable_key text; maintenance_token text;
begin
  -- 19:15 UTC is 03:15 the next day in Taiwan, including the month boundary.
  if force_run or extract(day from now() at time zone 'Asia/Taipei') = 1 then
    perform private.prune_planner_operations(1000);
  end if;
  -- Retry failed/partial Storage cleanup on the next daily check, without idle HTTP calls.
  if not exists (select 1 from storage.objects where bucket_id = 'line-schedule-exports'
    and created_at < now() - interval '30 days' and updated_at < now() - interval '30 days') then
    return null;
  end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'line_reminder_project_url';
  select decrypted_secret into publishable_key from vault.decrypted_secrets where name = 'line_reminder_publishable_key';
  select decrypted_secret into maintenance_token from vault.decrypted_secrets where name = 'planner_maintenance_token';
  if project_url is null or publishable_key is null or maintenance_token is null then
    raise exception 'Planner maintenance Vault configuration is incomplete';
  end if;
  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/planner-maintenance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', publishable_key),
    body := jsonb_build_object('token', maintenance_token), timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.dispatch_planner_maintenance(boolean) from public, anon, authenticated, service_role;

select cron.schedule('planner-cron-history-retention', '5 19 * * *',
  'select private.prune_planner_cron_history(5000)');
select cron.schedule('planner-monthly-housekeeping', '15 19 * * *',
  'select private.dispatch_planner_maintenance()');
