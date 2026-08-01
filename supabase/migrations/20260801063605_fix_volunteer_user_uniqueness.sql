alter table public.volunteers
  drop constraint if exists volunteers_organization_id_user_id_key;

create unique index if not exists volunteers_organization_user_unique
  on public.volunteers(organization_id, user_id)
  where user_id is not null;
