alter table public.unavailability_requests
  add column if not exists share_token text;

alter table public.unavailability_requests
  drop constraint if exists unavailability_requests_share_token_check;

alter table public.unavailability_requests
  add constraint unavailability_requests_share_token_check
  check (share_token is null or char_length(share_token) >= 32);

create or replace function public.create_unavailability_request(
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
    share_token,
    status
  ) values (
    target_organization_id,
    target_month,
    target_expires_on,
    encode(extensions.digest(request_token, 'sha256'), 'hex'),
    request_token,
    'open'
  )
  on conflict (organization_id, request_month) do update
  set expires_on = excluded.expires_on,
      token_hash = case
        when unavailability_requests.share_token is null then excluded.token_hash
        else unavailability_requests.token_hash
      end,
      share_token = coalesce(
        unavailability_requests.share_token,
        excluded.share_token
      ),
      status = 'open',
      updated_at = now()
  returning id into created_request_id;

  return created_request_id;
end;
$$;

alter table public.line_unavailability_broadcasts
  add column if not exists announce_at timestamptz;

update public.line_unavailability_broadcasts
set announce_at = created_at
where announce_at is null;

alter table public.line_unavailability_broadcasts
  alter column announce_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.line_unavailability_broadcasts'::regclass
      and conname = 'line_unavailability_broadcasts_reminder_order_check'
  ) then
    alter table public.line_unavailability_broadcasts
      add constraint line_unavailability_broadcasts_reminder_order_check
      check (reminder_at is null or reminder_at >= announce_at);
  end if;
end;
$$;

create index if not exists line_unavailability_broadcasts_due_idx
  on public.line_unavailability_broadcasts (status, announce_at, reminder_at);
