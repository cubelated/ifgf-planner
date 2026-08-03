create table if not exists public.line_group_connections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_groups(id) on delete cascade,
  line_group_id text not null unique,
  group_name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  connected_at timestamptz not null default now()
);

create index if not exists line_group_connections_event_id_idx
  on public.line_group_connections (event_id);

create table if not exists public.line_group_connection_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_groups(id) on delete cascade,
  code_hash text not null unique check (length(code_hash) = 64),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists line_group_connection_codes_active_idx
  on public.line_group_connection_codes (code_hash, expires_at)
  where used_at is null;
create index if not exists line_group_connection_codes_event_id_idx
  on public.line_group_connection_codes (event_id);
create index if not exists line_group_connection_codes_created_by_idx
  on public.line_group_connection_codes (created_by);

create table if not exists public.line_webhook_events (
  webhook_event_id text primary key,
  event_type text not null,
  source_type text,
  processed_at timestamptz not null default now()
);

create table if not exists public.line_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_groups(id) on delete cascade,
  line_group_connection_id uuid not null
    references public.line_group_connections(id) on delete cascade,
  occurrence_key text not null,
  reminder_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
  attempt_count integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_group_connection_id, occurrence_key, reminder_type)
);

create index if not exists line_message_deliveries_event_id_idx
  on public.line_message_deliveries (event_id);
create index if not exists line_message_deliveries_status_idx
  on public.line_message_deliveries (status, scheduled_for);

create table if not exists public.line_event_reminder_settings (
  event_id uuid primary key references public.event_groups(id) on delete cascade,
  enabled boolean not null default false,
  reminder_minutes_before integer not null default 1440
    check (reminder_minutes_before between 1 and 10080),
  arrival_minutes_before integer not null default 30
    check (arrival_minutes_before between 0 and 240),
  custom_message text check (custom_message is null or char_length(custom_message) <= 500),
  require_published_schedule boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_event_reminder_settings_created_by_idx
  on public.line_event_reminder_settings (created_by);

alter table public.line_group_connections enable row level security;
alter table public.line_group_connection_codes enable row level security;
alter table public.line_webhook_events enable row level security;
alter table public.line_message_deliveries enable row level security;
alter table public.line_event_reminder_settings enable row level security;

revoke all on public.line_group_connection_codes from anon, authenticated;
revoke all on public.line_webhook_events from anon, authenticated;
revoke all on public.line_message_deliveries from anon, authenticated;

grant select on public.line_group_connections to authenticated;
grant select, insert, update, delete on public.line_event_reminder_settings to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'line_event_reminder_settings'
      and policyname = 'Coordinators can read LINE reminder settings'
  ) then
    create policy "Coordinators can read LINE reminder settings"
    on public.line_event_reminder_settings for select to authenticated
    using (
      exists (
        select 1 from public.event_groups event_group
        join public.organization_members member
          on member.organization_id = event_group.organization_id
        where event_group.id = line_event_reminder_settings.event_id
          and member.user_id = (select auth.uid())
          and member.status = 'active'
          and member.role in ('owner', 'coordinator')
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'line_event_reminder_settings'
      and policyname = 'Coordinators can create LINE reminder settings'
  ) then
    create policy "Coordinators can create LINE reminder settings"
    on public.line_event_reminder_settings for insert to authenticated
    with check (
      exists (
        select 1 from public.event_groups event_group
        join public.organization_members member
          on member.organization_id = event_group.organization_id
        where event_group.id = line_event_reminder_settings.event_id
          and member.user_id = (select auth.uid())
          and member.status = 'active'
          and member.role in ('owner', 'coordinator')
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'line_event_reminder_settings'
      and policyname = 'Coordinators can update LINE reminder settings'
  ) then
    create policy "Coordinators can update LINE reminder settings"
    on public.line_event_reminder_settings for update to authenticated
    using (
      exists (
        select 1 from public.event_groups event_group
        join public.organization_members member
          on member.organization_id = event_group.organization_id
        where event_group.id = line_event_reminder_settings.event_id
          and member.user_id = (select auth.uid())
          and member.status = 'active'
          and member.role in ('owner', 'coordinator')
      )
    )
    with check (
      exists (
        select 1 from public.event_groups event_group
        join public.organization_members member
          on member.organization_id = event_group.organization_id
        where event_group.id = line_event_reminder_settings.event_id
          and member.user_id = (select auth.uid())
          and member.status = 'active'
          and member.role in ('owner', 'coordinator')
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'line_event_reminder_settings'
      and policyname = 'Coordinators can delete LINE reminder settings'
  ) then
    create policy "Coordinators can delete LINE reminder settings"
    on public.line_event_reminder_settings for delete to authenticated
    using (
      exists (
        select 1 from public.event_groups event_group
        join public.organization_members member
          on member.organization_id = event_group.organization_id
        where event_group.id = line_event_reminder_settings.event_id
          and member.user_id = (select auth.uid())
          and member.status = 'active'
          and member.role in ('owner', 'coordinator')
      )
    );
  end if;
end
$$;
