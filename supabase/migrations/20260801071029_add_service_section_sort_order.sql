do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_sections'
      and column_name = 'sort_order'
  ) then
    alter table public.service_sections
    add column sort_order integer not null default 2147483647
    check (sort_order >= 0);

    with ranked_sections as (
      select
        id,
        row_number() over (
          partition by organization_id
          order by created_at, id
        ) - 1 as sort_order
      from public.service_sections
    )
    update public.service_sections section
    set sort_order = ranked.sort_order
    from ranked_sections ranked
    where section.id = ranked.id;
  end if;
end;
$$;

alter table public.service_sections
alter column sort_order set default 2147483647;

create index if not exists service_sections_org_sort_idx
on public.service_sections(organization_id, sort_order, created_at, id);

create or replace function public.reorder_service_sections(
  target_organization_id uuid,
  ordered_section_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  provided_count integer;
  unique_count integer;
  organization_section_count integer;
begin
  select count(*), count(distinct section_id)
  into provided_count, unique_count
  from unnest(ordered_section_ids) as section_id;

  select count(*)
  into organization_section_count
  from public.service_sections
  where organization_id = target_organization_id;

  if provided_count <> unique_count then
    raise exception 'Section order contains duplicate identifiers.' using errcode = '23514';
  end if;

  if provided_count <> organization_section_count then
    raise exception 'Section order must include every section in the organization.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(ordered_section_ids) as requested(section_id)
    left join public.service_sections section
      on section.id = requested.section_id
      and section.organization_id = target_organization_id
    where section.id is null
  ) then
    raise exception 'Section order contains an invalid identifier.' using errcode = '23514';
  end if;

  update public.service_sections section
  set sort_order = requested.position - 1
  from unnest(ordered_section_ids) with ordinality as requested(section_id, position)
  where section.id = requested.section_id
    and section.organization_id = target_organization_id;
end;
$$;

revoke all on function public.reorder_service_sections(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_service_sections(uuid, uuid[]) to authenticated, service_role;

-- Keep the table's existing unique (occurrence_id, section_id, volunteer_id)
-- constraint, while allowing the same volunteer in another section.
drop index if exists public.assignments_occurrence_volunteer_unique;
