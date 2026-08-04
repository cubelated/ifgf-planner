drop policy if exists unavailability_requests_insert
  on public.unavailability_requests;
drop policy if exists unavailability_requests_update
  on public.unavailability_requests;
drop policy if exists "Coordinators can create LINE form broadcasts"
  on public.line_unavailability_broadcasts;
drop policy if exists schedule_shares_insert
  on public.schedule_shares;

drop index if exists public.unavailability_requests_created_by_idx;

alter table public.unavailability_requests
  drop column if exists created_by;
alter table public.line_unavailability_broadcasts
  drop column if exists created_by;
alter table public.line_group_connection_codes
  drop column if exists created_by;

create policy unavailability_requests_insert
on public.unavailability_requests
for insert
to authenticated
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

create policy unavailability_requests_update
on public.unavailability_requests
for update
to authenticated
using (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
)
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

create policy "Coordinators can create LINE form broadcasts"
on public.line_unavailability_broadcasts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.event_groups event_group
    join public.unavailability_requests request
      on request.id = line_unavailability_broadcasts.request_id
     and request.organization_id = event_group.organization_id
    join public.organization_members member
      on member.organization_id = event_group.organization_id
    where event_group.id = line_unavailability_broadcasts.event_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'coordinator')
  )
);

create policy schedule_shares_insert
on public.schedule_shares
for insert
to authenticated
with check (
  private.has_org_role(organization_id, array['owner', 'coordinator'])
);

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

create or replace function public.create_schedule_share(
  target_organization_id uuid,
  target_event_group_id uuid,
  target_month date,
  share_token text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_share_id uuid;
begin
  if not private.has_org_role(target_organization_id, array['owner', 'coordinator']) then
    raise exception 'Only coordinators can share a schedule.' using errcode = '42501';
  end if;
  if target_month <> date_trunc('month', target_month)::date then
    raise exception 'Share month must be the first day of a month.' using errcode = '23514';
  end if;
  if char_length(share_token) < 32 or char_length(share_token) > 128 then
    raise exception 'Share token length is invalid.' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.event_groups event_group
    where event_group.id = target_event_group_id
      and event_group.organization_id = target_organization_id
  ) then
    raise exception 'Event does not belong to this organization.' using errcode = '23514';
  end if;

  insert into public.schedule_shares (
    organization_id,
    event_group_id,
    share_month,
    token_hash
  ) values (
    target_organization_id,
    target_event_group_id,
    target_month,
    encode(extensions.digest(share_token, 'sha256'), 'hex')
  )
  returning id into created_share_id;

  return created_share_id;
end;
$$;
