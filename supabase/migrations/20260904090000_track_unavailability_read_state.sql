create table public.unavailability_read_states (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.unavailability_read_states enable row level security;

create policy unavailability_read_states_select
on public.unavailability_read_states
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
);

create policy unavailability_read_states_insert
on public.unavailability_read_states
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
);

create policy unavailability_read_states_update
on public.unavailability_read_states
for update
to authenticated
using (
  user_id = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
)
with check (
  user_id = (select auth.uid())
  and private.has_org_role(organization_id, array['owner', 'coordinator'])
);

grant select, insert, update on public.unavailability_read_states to authenticated;
revoke all on public.unavailability_read_states from anon;
