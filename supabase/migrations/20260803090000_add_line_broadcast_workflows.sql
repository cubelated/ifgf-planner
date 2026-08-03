create table public.line_unavailability_broadcasts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.unavailability_requests(id) on delete cascade,
  event_id uuid not null references public.event_groups(id) on delete cascade,
  share_url text not null check (char_length(share_url) between 40 and 2048),
  announce_at timestamptz not null,
  reminder_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  announced_at timestamptz,
  reminder_sent_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reminder_at is null or reminder_at >= announce_at)
);

create index line_unavailability_broadcasts_due_idx
  on public.line_unavailability_broadcasts (status, announce_at, reminder_at);

create index line_unavailability_broadcasts_request_id_idx
  on public.line_unavailability_broadcasts (request_id);

create index line_unavailability_broadcasts_event_id_idx
  on public.line_unavailability_broadcasts (event_id);

create index line_unavailability_broadcasts_created_by_idx
  on public.line_unavailability_broadcasts (created_by);

alter table public.line_unavailability_broadcasts enable row level security;

create policy "Coordinators can read LINE form broadcasts"
on public.line_unavailability_broadcasts
for select
to authenticated
using (
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

create policy "Coordinators can create LINE form broadcasts"
on public.line_unavailability_broadcasts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
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

create policy "Coordinators can cancel LINE form broadcasts"
on public.line_unavailability_broadcasts
for update
to authenticated
using (
  exists (
    select 1
    from public.event_groups event_group
    join public.organization_members member
      on member.organization_id = event_group.organization_id
    where event_group.id = line_unavailability_broadcasts.event_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'coordinator')
  )
)
with check (
  status = 'cancelled'
  and exists (
    select 1
    from public.event_groups event_group
    join public.organization_members member
      on member.organization_id = event_group.organization_id
    where event_group.id = line_unavailability_broadcasts.event_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'coordinator')
  )
);

create policy "Coordinators can read LINE group connections"
on public.line_group_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.event_groups event_group
    join public.organization_members member
      on member.organization_id = event_group.organization_id
    where event_group.id = line_group_connections.event_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'coordinator')
  )
);

grant select, insert, update on public.line_unavailability_broadcasts to authenticated;
grant select on public.line_group_connections to authenticated;
grant select, insert, update, delete on public.line_event_reminder_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'line-schedule-exports',
  'line-schedule-exports',
  false,
  9500000,
  array['image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
