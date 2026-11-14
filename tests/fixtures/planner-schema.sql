-- Minimal production schema snapshot for isolated optimization tests (2026-11-14).
-- Contains schema and permissions only, never production records or credentials.
create schema private;
grant usage on schema private to authenticated, service_role;
create table public.line_event_reminder_settings (event_id uuid not null, enabled boolean not null default false, reminder_minutes_before integer not null default 1440, arrival_minutes_before integer not null default 30, custom_message text, require_published_schedule boolean not null default true, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.schedule_shares (id uuid not null default gen_random_uuid(), organization_id uuid not null, event_group_id uuid not null, share_month date not null, token_hash text not null, created_at timestamp with time zone not null default now());
create table public.line_group_connections (id uuid not null default gen_random_uuid(), event_id uuid not null, line_group_id text not null, group_name text, status text not null default 'active'::text, connected_at timestamp with time zone not null default now());
create table public.unavailability_read_states (organization_id uuid not null, user_id uuid not null, last_seen_at timestamp with time zone not null default now());
create table public.line_unavailability_broadcasts (id uuid not null default gen_random_uuid(), request_id uuid not null, event_id uuid not null, share_url text not null, reminder_at timestamp with time zone, status text not null default 'scheduled'::text, announced_at timestamp with time zone, reminder_sent_at timestamp with time zone, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), announce_at timestamp with time zone not null);
create table public.line_group_connection_codes (id uuid not null default gen_random_uuid(), event_id uuid not null, code_hash text not null, expires_at timestamp with time zone not null, used_at timestamp with time zone, created_at timestamp with time zone not null default now());
create table public.line_webhook_events (webhook_event_id text not null, event_type text not null, source_type text, processed_at timestamp with time zone not null default now());
create table public.service_sections (id uuid not null default gen_random_uuid(), organization_id uuid not null, name text not null, color text not null default 'blue'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), sort_order integer not null default 2147483647);
create table public.profiles (id uuid not null, full_name text not null, email text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.organizations (id uuid not null default gen_random_uuid(), name text not null, slug text not null, timezone text not null default 'Asia/Taipei'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.organization_members (organization_id uuid not null, user_id uuid not null, role text not null, status text not null default 'active'::text, created_at timestamp with time zone not null default now());
create table public.volunteers (id uuid not null default gen_random_uuid(), organization_id uuid not null, user_id uuid, full_name text not null, email text, status text not null default 'active'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.volunteer_section_eligibility (volunteer_id uuid not null, section_id uuid not null, created_at timestamp with time zone not null default now());
create table public.event_groups (id uuid not null default gen_random_uuid(), organization_id uuid not null, name text not null, weekday smallint not null, start_time time without time zone not null, duration_minutes integer not null default 120, recurrence_pattern text not null default 'every_week'::text, week_occurrences smallint[] not null default ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint], is_active boolean not null default true, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.line_message_deliveries (id uuid not null default gen_random_uuid(), event_id uuid not null, line_group_connection_id uuid not null, occurrence_key text not null, reminder_type text not null, scheduled_for timestamp with time zone not null, status text not null default 'processing'::text, attempt_count integer not null default 0, sent_at timestamp with time zone, last_error text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.unavailability_requests (id uuid not null default gen_random_uuid(), organization_id uuid not null, request_month date not null, token_hash text not null, status text not null default 'open'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), expires_on date not null, share_token text);
create table public.event_group_volunteers (event_group_id uuid not null, volunteer_id uuid not null, created_at timestamp with time zone not null default now());
create table public.staffing_requirements (id uuid not null default gen_random_uuid(), event_group_id uuid not null, section_id uuid not null, needed_count integer not null default 1, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.event_occurrences (id uuid not null default gen_random_uuid(), organization_id uuid not null, event_group_id uuid not null, starts_at timestamp with time zone not null, ends_at timestamp with time zone not null, status text not null default 'scheduled'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.assignments (id uuid not null default gen_random_uuid(), organization_id uuid not null, occurrence_id uuid not null, section_id uuid not null, volunteer_id uuid not null, status text not null default 'assigned'::text, is_locked boolean not null default false, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.unavailability (id uuid not null default gen_random_uuid(), organization_id uuid not null, volunteer_id uuid, occurrence_id uuid, unavailable_date date not null, reason text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), request_id uuid, submitted_name text);

alter table profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table organizations add constraint organizations_slug_key UNIQUE (slug);
alter table organization_members add constraint organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'coordinator'::text, 'volunteer'::text])));
alter table organization_members add constraint organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
alter table organization_members add constraint organization_members_pkey PRIMARY KEY (organization_id, user_id);
alter table service_sections add constraint service_sections_pkey PRIMARY KEY (id);
alter table service_sections add constraint service_sections_organization_id_name_key UNIQUE (organization_id, name);
alter table volunteers add constraint volunteers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resting'::text, 'inactive'::text])));
alter table volunteers add constraint volunteers_pkey PRIMARY KEY (id);
alter table volunteer_section_eligibility add constraint volunteer_section_eligibility_pkey PRIMARY KEY (volunteer_id, section_id);
alter table event_groups add constraint event_groups_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)));
alter table event_groups add constraint event_groups_duration_minutes_check CHECK (((duration_minutes >= 15) AND (duration_minutes <= 1440)));
alter table event_groups add constraint event_groups_recurrence_pattern_check CHECK ((recurrence_pattern = ANY (ARRAY['every_week'::text, 'weeks_1_3'::text, 'weeks_2_4'::text, 'except_5'::text, 'custom'::text])));
alter table event_groups add constraint event_groups_pkey PRIMARY KEY (id);
alter table event_groups add constraint event_groups_organization_id_name_key UNIQUE (organization_id, name);
alter table event_group_volunteers add constraint event_group_volunteers_pkey PRIMARY KEY (event_group_id, volunteer_id);
alter table staffing_requirements add constraint staffing_requirements_needed_count_check CHECK (((needed_count >= 1) AND (needed_count <= 50)));
alter table staffing_requirements add constraint staffing_requirements_pkey PRIMARY KEY (id);
alter table staffing_requirements add constraint staffing_requirements_event_group_id_section_id_key UNIQUE (event_group_id, section_id);
alter table event_occurrences add constraint event_occurrences_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text])));
alter table event_occurrences add constraint event_occurrences_check CHECK ((ends_at > starts_at));
alter table event_occurrences add constraint event_occurrences_pkey PRIMARY KEY (id);
alter table event_occurrences add constraint event_occurrences_event_group_id_starts_at_key UNIQUE (event_group_id, starts_at);
alter table unavailability add constraint unavailability_reason_check CHECK ((char_length(reason) <= 500));
alter table unavailability add constraint unavailability_pkey PRIMARY KEY (id);
alter table assignments add constraint assignments_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'confirmed'::text, 'declined'::text])));
alter table assignments add constraint assignments_pkey PRIMARY KEY (id);
alter table assignments add constraint assignments_occurrence_id_section_id_volunteer_id_key UNIQUE (occurrence_id, section_id, volunteer_id);
alter table service_sections add constraint service_sections_sort_order_check CHECK ((sort_order >= 0));
alter table unavailability_requests add constraint unavailability_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
alter table unavailability_requests add constraint unavailability_requests_request_month_check CHECK ((request_month = (date_trunc('month'::text, (request_month)::timestamp with time zone))::date));
alter table unavailability_requests add constraint unavailability_requests_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text));
alter table unavailability_requests add constraint unavailability_requests_pkey PRIMARY KEY (id);
alter table unavailability_requests add constraint unavailability_requests_token_hash_key UNIQUE (token_hash);
alter table unavailability_requests add constraint unavailability_requests_organization_id_request_month_key UNIQUE (organization_id, request_month);
alter table unavailability add constraint unavailability_identity_required CHECK (((volunteer_id IS NOT NULL) OR ((char_length(btrim(submitted_name)) >= 2) AND (char_length(btrim(submitted_name)) <= 120))));
alter table unavailability add constraint unavailability_source_required CHECK (((occurrence_id IS NOT NULL) OR (request_id IS NOT NULL)));
alter table line_unavailability_broadcasts add constraint line_unavailability_broadcasts_pkey PRIMARY KEY (id);
alter table schedule_shares add constraint schedule_shares_share_month_check CHECK ((share_month = (date_trunc('month'::text, (share_month)::timestamp with time zone))::date));
alter table schedule_shares add constraint schedule_shares_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text));
alter table schedule_shares add constraint schedule_shares_pkey PRIMARY KEY (id);
alter table schedule_shares add constraint schedule_shares_token_hash_key UNIQUE (token_hash);
alter table line_group_connections add constraint line_group_connections_pkey PRIMARY KEY (id);
alter table line_group_connections add constraint line_group_connections_line_group_id_key UNIQUE (line_group_id);
alter table line_group_connection_codes add constraint line_group_connection_codes_code_hash_check CHECK ((length(code_hash) = 64));
alter table line_group_connection_codes add constraint line_group_connection_codes_pkey PRIMARY KEY (id);
alter table line_group_connection_codes add constraint line_group_connection_codes_code_hash_key UNIQUE (code_hash);
alter table line_webhook_events add constraint line_webhook_events_pkey PRIMARY KEY (webhook_event_id);
alter table line_message_deliveries add constraint line_message_deliveries_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'sent'::text, 'failed'::text])));
alter table line_message_deliveries add constraint line_message_deliveries_pkey PRIMARY KEY (id);
alter table line_message_deliveries add constraint line_message_deliveries_line_group_connection_id_occurrence_key UNIQUE (line_group_connection_id, occurrence_key, reminder_type);
alter table line_event_reminder_settings add constraint line_event_reminder_settings_reminder_minutes_before_check CHECK (((reminder_minutes_before >= 1) AND (reminder_minutes_before <= 10080)));
alter table line_event_reminder_settings add constraint line_event_reminder_settings_arrival_minutes_before_check CHECK (((arrival_minutes_before >= 0) AND (arrival_minutes_before <= 240)));
alter table line_event_reminder_settings add constraint line_event_reminder_settings_custom_message_check CHECK (((custom_message IS NULL) OR (char_length(custom_message) <= 500)));
alter table line_event_reminder_settings add constraint line_event_reminder_settings_pkey PRIMARY KEY (event_id);
alter table line_unavailability_broadcasts add constraint line_unavailability_broadcasts_share_url_check CHECK (((char_length(share_url) >= 40) AND (char_length(share_url) <= 2048)));
alter table line_unavailability_broadcasts add constraint line_unavailability_broadcasts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])));
alter table unavailability_requests add constraint unavailability_requests_share_token_check CHECK (((share_token IS NULL) OR (char_length(share_token) >= 32)));
alter table line_unavailability_broadcasts add constraint line_unavailability_broadcasts_reminder_order_check CHECK (((reminder_at IS NULL) OR (reminder_at >= announce_at)));
alter table unavailability_read_states add constraint unavailability_read_states_pkey PRIMARY KEY (organization_id, user_id);

alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table organization_members add constraint organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table organization_members add constraint organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table service_sections add constraint service_sections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table volunteers add constraint volunteers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table volunteers add constraint volunteers_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table volunteer_section_eligibility add constraint volunteer_section_eligibility_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE;
alter table volunteer_section_eligibility add constraint volunteer_section_eligibility_section_id_fkey FOREIGN KEY (section_id) REFERENCES service_sections(id) ON DELETE CASCADE;
alter table event_groups add constraint event_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table event_group_volunteers add constraint event_group_volunteers_event_group_id_fkey FOREIGN KEY (event_group_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table event_group_volunteers add constraint event_group_volunteers_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE;
alter table staffing_requirements add constraint staffing_requirements_event_group_id_fkey FOREIGN KEY (event_group_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table staffing_requirements add constraint staffing_requirements_section_id_fkey FOREIGN KEY (section_id) REFERENCES service_sections(id) ON DELETE CASCADE;
alter table event_occurrences add constraint event_occurrences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table event_occurrences add constraint event_occurrences_event_group_id_fkey FOREIGN KEY (event_group_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table unavailability add constraint unavailability_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table unavailability add constraint unavailability_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE;
alter table unavailability add constraint unavailability_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES event_occurrences(id) ON DELETE CASCADE;
alter table assignments add constraint assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table assignments add constraint assignments_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES event_occurrences(id) ON DELETE CASCADE;
alter table assignments add constraint assignments_section_id_fkey FOREIGN KEY (section_id) REFERENCES service_sections(id) ON DELETE CASCADE;
alter table assignments add constraint assignments_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE;
alter table line_message_deliveries add constraint line_message_deliveries_event_id_fkey FOREIGN KEY (event_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table line_message_deliveries add constraint line_message_deliveries_line_group_connection_id_fkey FOREIGN KEY (line_group_connection_id) REFERENCES line_group_connections(id) ON DELETE CASCADE;
alter table line_unavailability_broadcasts add constraint line_unavailability_broadcasts_request_id_fkey FOREIGN KEY (request_id) REFERENCES unavailability_requests(id) ON DELETE CASCADE;
alter table unavailability_requests add constraint unavailability_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table unavailability add constraint unavailability_request_id_fkey FOREIGN KEY (request_id) REFERENCES unavailability_requests(id) ON DELETE SET NULL;
alter table schedule_shares add constraint schedule_shares_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table schedule_shares add constraint schedule_shares_event_group_id_fkey FOREIGN KEY (event_group_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table line_group_connections add constraint line_group_connections_event_id_fkey FOREIGN KEY (event_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table line_group_connection_codes add constraint line_group_connection_codes_event_id_fkey FOREIGN KEY (event_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table line_event_reminder_settings add constraint line_event_reminder_settings_event_id_fkey FOREIGN KEY (event_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table line_unavailability_broadcasts add constraint line_unavailability_broadcasts_event_id_fkey FOREIGN KEY (event_id) REFERENCES event_groups(id) ON DELETE CASCADE;
alter table unavailability_read_states add constraint unavailability_read_states_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table unavailability_read_states add constraint unavailability_read_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION private.has_org_role(target_organization_id uuid, allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any (allowed_roles)
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_org_member(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


;
alter table public.line_event_reminder_settings enable row level security;
alter table public.schedule_shares enable row level security;
alter table public.line_group_connections enable row level security;
alter table public.unavailability_read_states enable row level security;
alter table public.line_unavailability_broadcasts enable row level security;
alter table public.line_group_connection_codes enable row level security;
alter table public.line_webhook_events enable row level security;
alter table public.service_sections enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.volunteers enable row level security;
alter table public.volunteer_section_eligibility enable row level security;
alter table public.event_groups enable row level security;
alter table public.line_message_deliveries enable row level security;
alter table public.unavailability_requests enable row level security;
alter table public.event_group_volunteers enable row level security;
alter table public.staffing_requirements enable row level security;
alter table public.event_occurrences enable row level security;
alter table public.assignments enable row level security;
alter table public.unavailability enable row level security;

create policy profiles_select on public.profiles as PERMISSIVE for SELECT to authenticated using ((id = ( SELECT auth.uid() AS uid)));
create policy profiles_update on public.profiles as PERMISSIVE for UPDATE to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));
create policy event_groups_delete on public.event_groups as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy "Coordinators can read LINE form broadcasts" on public.line_unavailability_broadcasts as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM ((event_groups event_group
     JOIN unavailability_requests request ON (((request.id = line_unavailability_broadcasts.request_id) AND (request.organization_id = event_group.organization_id))))
     JOIN organization_members member ON ((member.organization_id = event_group.organization_id)))
  WHERE ((event_group.id = line_unavailability_broadcasts.event_id) AND (member.user_id = ( SELECT auth.uid() AS uid)) AND (member.status = 'active'::text) AND (member.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy "Coordinators can cancel LINE form broadcasts" on public.line_unavailability_broadcasts as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM (event_groups event_group
     JOIN organization_members member ON ((member.organization_id = event_group.organization_id)))
  WHERE ((event_group.id = line_unavailability_broadcasts.event_id) AND (member.user_id = ( SELECT auth.uid() AS uid)) AND (member.status = 'active'::text) AND (member.role = ANY (ARRAY['owner'::text, 'coordinator'::text])))))) with check (((status = 'cancelled'::text) AND (EXISTS ( SELECT 1
   FROM (event_groups event_group
     JOIN organization_members member ON ((member.organization_id = event_group.organization_id)))
  WHERE ((event_group.id = line_unavailability_broadcasts.event_id) AND (member.user_id = ( SELECT auth.uid() AS uid)) AND (member.status = 'active'::text) AND (member.role = ANY (ARRAY['owner'::text, 'coordinator'::text])))))));
create policy organizations_update on public.organizations as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(id, ARRAY['owner'::text, 'coordinator'::text]));
create policy organizations_delete on public.organizations as PERMISSIVE for DELETE to authenticated using (private.has_org_role(id, ARRAY['owner'::text]));
create policy organization_members_select on public.organization_members as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy organization_members_update on public.organization_members as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy organization_members_delete on public.organization_members as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text]));
create policy service_sections_select on public.service_sections as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy service_sections_insert on public.service_sections as PERMISSIVE for INSERT to authenticated with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy service_sections_update on public.service_sections as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy service_sections_delete on public.service_sections as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy volunteers_select on public.volunteers as PERMISSIVE for SELECT to authenticated using ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (user_id = ( SELECT auth.uid() AS uid))));
create policy volunteers_insert on public.volunteers as PERMISSIVE for INSERT to authenticated with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy volunteers_update on public.volunteers as PERMISSIVE for UPDATE to authenticated using ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (user_id = ( SELECT auth.uid() AS uid)))) with check ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (user_id = ( SELECT auth.uid() AS uid))));
create policy volunteers_delete on public.volunteers as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy volunteer_eligibility_select on public.volunteer_section_eligibility as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = volunteer_section_eligibility.volunteer_id) AND (private.has_org_role(volunteer.organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (volunteer.user_id = ( SELECT auth.uid() AS uid)))))));
create policy volunteer_eligibility_insert on public.volunteer_section_eligibility as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = volunteer_section_eligibility.volunteer_id) AND private.has_org_role(volunteer.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy volunteer_eligibility_delete on public.volunteer_section_eligibility as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = volunteer_section_eligibility.volunteer_id) AND private.has_org_role(volunteer.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy event_groups_select on public.event_groups as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy event_groups_update on public.event_groups as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy event_group_volunteers_select on public.event_group_volunteers as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = event_group_volunteers.event_group_id) AND private.is_org_member(event_group.organization_id)))));
create policy event_group_volunteers_insert on public.event_group_volunteers as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = event_group_volunteers.event_group_id) AND private.has_org_role(event_group.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy event_group_volunteers_delete on public.event_group_volunteers as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = event_group_volunteers.event_group_id) AND private.has_org_role(event_group.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy staffing_requirements_select on public.staffing_requirements as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = staffing_requirements.event_group_id) AND private.is_org_member(event_group.organization_id)))));
create policy staffing_requirements_insert on public.staffing_requirements as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = staffing_requirements.event_group_id) AND private.has_org_role(event_group.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy "Coordinators can read LINE group connections" on public.line_group_connections as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (event_groups event_group
     JOIN organization_members member ON ((member.organization_id = event_group.organization_id)))
  WHERE ((event_group.id = line_group_connections.event_id) AND (member.user_id = ( SELECT auth.uid() AS uid)) AND (member.status = 'active'::text) AND (member.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy staffing_requirements_update on public.staffing_requirements as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = staffing_requirements.event_group_id) AND private.has_org_role(event_group.organization_id, ARRAY['owner'::text, 'coordinator'::text]))))) with check ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = staffing_requirements.event_group_id) AND private.has_org_role(event_group.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy staffing_requirements_delete on public.staffing_requirements as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM event_groups event_group
  WHERE ((event_group.id = staffing_requirements.event_group_id) AND private.has_org_role(event_group.organization_id, ARRAY['owner'::text, 'coordinator'::text])))));
create policy event_occurrences_select on public.event_occurrences as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy event_occurrences_insert on public.event_occurrences as PERMISSIVE for INSERT to authenticated with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy event_occurrences_update on public.event_occurrences as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy event_occurrences_delete on public.event_occurrences as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy schedule_shares_delete on public.schedule_shares as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy unavailability_select on public.unavailability as PERMISSIVE for SELECT to authenticated using ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = unavailability.volunteer_id) AND (volunteer.user_id = ( SELECT auth.uid() AS uid)))))));
create policy unavailability_insert on public.unavailability as PERMISSIVE for INSERT to authenticated with check ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = unavailability.volunteer_id) AND (volunteer.user_id = ( SELECT auth.uid() AS uid)) AND (volunteer.organization_id = volunteer.organization_id))))));
create policy unavailability_update on public.unavailability as PERMISSIVE for UPDATE to authenticated using ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = unavailability.volunteer_id) AND (volunteer.user_id = ( SELECT auth.uid() AS uid))))))) with check ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = unavailability.volunteer_id) AND (volunteer.user_id = ( SELECT auth.uid() AS uid)) AND (volunteer.organization_id = volunteer.organization_id))))));
create policy unavailability_delete on public.unavailability as PERMISSIVE for DELETE to authenticated using ((private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]) OR (EXISTS ( SELECT 1
   FROM volunteers volunteer
  WHERE ((volunteer.id = unavailability.volunteer_id) AND (volunteer.user_id = ( SELECT auth.uid() AS uid)))))));
create policy "Coordinators can read LINE reminder settings" on public.line_event_reminder_settings as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (event_groups eg
     JOIN organization_members om ON ((om.organization_id = eg.organization_id)))
  WHERE ((eg.id = line_event_reminder_settings.event_id) AND (om.user_id = ( SELECT auth.uid() AS uid)) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy "Coordinators can create LINE reminder settings" on public.line_event_reminder_settings as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM (event_groups eg
     JOIN organization_members om ON ((om.organization_id = eg.organization_id)))
  WHERE ((eg.id = line_event_reminder_settings.event_id) AND (om.user_id = ( SELECT auth.uid() AS uid)) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy "Coordinators can update LINE reminder settings" on public.line_event_reminder_settings as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM (event_groups eg
     JOIN organization_members om ON ((om.organization_id = eg.organization_id)))
  WHERE ((eg.id = line_event_reminder_settings.event_id) AND (om.user_id = ( SELECT auth.uid() AS uid)) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'coordinator'::text])))))) with check ((EXISTS ( SELECT 1
   FROM (event_groups eg
     JOIN organization_members om ON ((om.organization_id = eg.organization_id)))
  WHERE ((eg.id = line_event_reminder_settings.event_id) AND (om.user_id = ( SELECT auth.uid() AS uid)) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy "Coordinators can delete LINE reminder settings" on public.line_event_reminder_settings as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM (event_groups eg
     JOIN organization_members om ON ((om.organization_id = eg.organization_id)))
  WHERE ((eg.id = line_event_reminder_settings.event_id) AND (om.user_id = ( SELECT auth.uid() AS uid)) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy assignments_select on public.assignments as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy assignments_insert on public.assignments as PERMISSIVE for INSERT to authenticated with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy assignments_update on public.assignments as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy assignments_delete on public.assignments as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy unavailability_requests_select on public.unavailability_requests as PERMISSIVE for SELECT to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy unavailability_requests_insert on public.unavailability_requests as PERMISSIVE for INSERT to authenticated with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy unavailability_requests_delete on public.unavailability_requests as PERMISSIVE for DELETE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy schedule_shares_select on public.schedule_shares as PERMISSIVE for SELECT to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy organizations_select on public.organizations as PERMISSIVE for SELECT to authenticated using (private.is_org_member(id));
create policy unavailability_requests_update on public.unavailability_requests as PERMISSIVE for UPDATE to authenticated using (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])) with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy "Coordinators can create LINE form broadcasts" on public.line_unavailability_broadcasts as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM ((event_groups event_group
     JOIN unavailability_requests request ON (((request.id = line_unavailability_broadcasts.request_id) AND (request.organization_id = event_group.organization_id))))
     JOIN organization_members member ON ((member.organization_id = event_group.organization_id)))
  WHERE ((event_group.id = line_unavailability_broadcasts.event_id) AND (member.user_id = ( SELECT auth.uid() AS uid)) AND (member.status = 'active'::text) AND (member.role = ANY (ARRAY['owner'::text, 'coordinator'::text]))))));
create policy schedule_shares_insert on public.schedule_shares as PERMISSIVE for INSERT to authenticated with check (private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]));
create policy unavailability_read_states_select on public.unavailability_read_states as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) AND private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])));
create policy unavailability_read_states_insert on public.unavailability_read_states as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])));
create policy unavailability_read_states_update on public.unavailability_read_states as PERMISSIVE for UPDATE to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) AND private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text]))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.has_org_role(organization_id, ARRAY['owner'::text, 'coordinator'::text])));

grant INSERT on public.line_event_reminder_settings to anon;
grant SELECT on public.line_event_reminder_settings to anon;
grant UPDATE on public.line_event_reminder_settings to anon;
grant DELETE on public.line_event_reminder_settings to anon;
grant TRUNCATE on public.line_event_reminder_settings to anon;
grant REFERENCES on public.line_event_reminder_settings to anon;
grant TRIGGER on public.line_event_reminder_settings to anon;
grant INSERT on public.line_event_reminder_settings to authenticated;
grant SELECT on public.line_event_reminder_settings to authenticated;
grant UPDATE on public.line_event_reminder_settings to authenticated;
grant DELETE on public.line_event_reminder_settings to authenticated;
grant TRUNCATE on public.line_event_reminder_settings to authenticated;
grant REFERENCES on public.line_event_reminder_settings to authenticated;
grant TRIGGER on public.line_event_reminder_settings to authenticated;
grant INSERT on public.line_event_reminder_settings to service_role;
grant SELECT on public.line_event_reminder_settings to service_role;
grant UPDATE on public.line_event_reminder_settings to service_role;
grant DELETE on public.line_event_reminder_settings to service_role;
grant TRUNCATE on public.line_event_reminder_settings to service_role;
grant REFERENCES on public.line_event_reminder_settings to service_role;
grant TRIGGER on public.line_event_reminder_settings to service_role;
grant INSERT on public.schedule_shares to authenticated;
grant SELECT on public.schedule_shares to authenticated;
grant UPDATE on public.schedule_shares to authenticated;
grant DELETE on public.schedule_shares to authenticated;
grant TRUNCATE on public.schedule_shares to authenticated;
grant REFERENCES on public.schedule_shares to authenticated;
grant TRIGGER on public.schedule_shares to authenticated;
grant INSERT on public.schedule_shares to service_role;
grant SELECT on public.schedule_shares to service_role;
grant UPDATE on public.schedule_shares to service_role;
grant DELETE on public.schedule_shares to service_role;
grant TRUNCATE on public.schedule_shares to service_role;
grant REFERENCES on public.schedule_shares to service_role;
grant TRIGGER on public.schedule_shares to service_role;
grant INSERT on public.line_group_connections to anon;
grant SELECT on public.line_group_connections to anon;
grant UPDATE on public.line_group_connections to anon;
grant DELETE on public.line_group_connections to anon;
grant TRUNCATE on public.line_group_connections to anon;
grant REFERENCES on public.line_group_connections to anon;
grant TRIGGER on public.line_group_connections to anon;
grant INSERT on public.line_group_connections to authenticated;
grant SELECT on public.line_group_connections to authenticated;
grant UPDATE on public.line_group_connections to authenticated;
grant DELETE on public.line_group_connections to authenticated;
grant TRUNCATE on public.line_group_connections to authenticated;
grant REFERENCES on public.line_group_connections to authenticated;
grant TRIGGER on public.line_group_connections to authenticated;
grant INSERT on public.line_group_connections to service_role;
grant SELECT on public.line_group_connections to service_role;
grant UPDATE on public.line_group_connections to service_role;
grant DELETE on public.line_group_connections to service_role;
grant TRUNCATE on public.line_group_connections to service_role;
grant REFERENCES on public.line_group_connections to service_role;
grant TRIGGER on public.line_group_connections to service_role;
grant INSERT on public.unavailability_read_states to authenticated;
grant SELECT on public.unavailability_read_states to authenticated;
grant UPDATE on public.unavailability_read_states to authenticated;
grant DELETE on public.unavailability_read_states to authenticated;
grant TRUNCATE on public.unavailability_read_states to authenticated;
grant REFERENCES on public.unavailability_read_states to authenticated;
grant TRIGGER on public.unavailability_read_states to authenticated;
grant INSERT on public.unavailability_read_states to service_role;
grant SELECT on public.unavailability_read_states to service_role;
grant UPDATE on public.unavailability_read_states to service_role;
grant DELETE on public.unavailability_read_states to service_role;
grant TRUNCATE on public.unavailability_read_states to service_role;
grant REFERENCES on public.unavailability_read_states to service_role;
grant TRIGGER on public.unavailability_read_states to service_role;
grant INSERT on public.line_unavailability_broadcasts to anon;
grant SELECT on public.line_unavailability_broadcasts to anon;
grant UPDATE on public.line_unavailability_broadcasts to anon;
grant DELETE on public.line_unavailability_broadcasts to anon;
grant TRUNCATE on public.line_unavailability_broadcasts to anon;
grant REFERENCES on public.line_unavailability_broadcasts to anon;
grant TRIGGER on public.line_unavailability_broadcasts to anon;
grant INSERT on public.line_unavailability_broadcasts to authenticated;
grant SELECT on public.line_unavailability_broadcasts to authenticated;
grant UPDATE on public.line_unavailability_broadcasts to authenticated;
grant DELETE on public.line_unavailability_broadcasts to authenticated;
grant TRUNCATE on public.line_unavailability_broadcasts to authenticated;
grant REFERENCES on public.line_unavailability_broadcasts to authenticated;
grant TRIGGER on public.line_unavailability_broadcasts to authenticated;
grant INSERT on public.line_unavailability_broadcasts to service_role;
grant SELECT on public.line_unavailability_broadcasts to service_role;
grant UPDATE on public.line_unavailability_broadcasts to service_role;
grant DELETE on public.line_unavailability_broadcasts to service_role;
grant TRUNCATE on public.line_unavailability_broadcasts to service_role;
grant REFERENCES on public.line_unavailability_broadcasts to service_role;
grant TRIGGER on public.line_unavailability_broadcasts to service_role;
grant INSERT on public.line_group_connection_codes to service_role;
grant SELECT on public.line_group_connection_codes to service_role;
grant UPDATE on public.line_group_connection_codes to service_role;
grant DELETE on public.line_group_connection_codes to service_role;
grant TRUNCATE on public.line_group_connection_codes to service_role;
grant REFERENCES on public.line_group_connection_codes to service_role;
grant TRIGGER on public.line_group_connection_codes to service_role;
grant INSERT on public.line_webhook_events to service_role;
grant SELECT on public.line_webhook_events to service_role;
grant UPDATE on public.line_webhook_events to service_role;
grant DELETE on public.line_webhook_events to service_role;
grant TRUNCATE on public.line_webhook_events to service_role;
grant REFERENCES on public.line_webhook_events to service_role;
grant TRIGGER on public.line_webhook_events to service_role;
grant INSERT on public.service_sections to authenticated;
grant SELECT on public.service_sections to authenticated;
grant UPDATE on public.service_sections to authenticated;
grant DELETE on public.service_sections to authenticated;
grant TRUNCATE on public.service_sections to authenticated;
grant REFERENCES on public.service_sections to authenticated;
grant TRIGGER on public.service_sections to authenticated;
grant INSERT on public.service_sections to service_role;
grant SELECT on public.service_sections to service_role;
grant UPDATE on public.service_sections to service_role;
grant DELETE on public.service_sections to service_role;
grant TRUNCATE on public.service_sections to service_role;
grant REFERENCES on public.service_sections to service_role;
grant TRIGGER on public.service_sections to service_role;
grant INSERT on public.profiles to authenticated;
grant SELECT on public.profiles to authenticated;
grant UPDATE on public.profiles to authenticated;
grant DELETE on public.profiles to authenticated;
grant TRUNCATE on public.profiles to authenticated;
grant REFERENCES on public.profiles to authenticated;
grant TRIGGER on public.profiles to authenticated;
grant INSERT on public.profiles to service_role;
grant SELECT on public.profiles to service_role;
grant UPDATE on public.profiles to service_role;
grant DELETE on public.profiles to service_role;
grant TRUNCATE on public.profiles to service_role;
grant REFERENCES on public.profiles to service_role;
grant TRIGGER on public.profiles to service_role;
grant INSERT on public.organizations to authenticated;
grant SELECT on public.organizations to authenticated;
grant UPDATE on public.organizations to authenticated;
grant DELETE on public.organizations to authenticated;
grant TRUNCATE on public.organizations to authenticated;
grant REFERENCES on public.organizations to authenticated;
grant TRIGGER on public.organizations to authenticated;
grant INSERT on public.organizations to service_role;
grant SELECT on public.organizations to service_role;
grant UPDATE on public.organizations to service_role;
grant DELETE on public.organizations to service_role;
grant TRUNCATE on public.organizations to service_role;
grant REFERENCES on public.organizations to service_role;
grant TRIGGER on public.organizations to service_role;
grant INSERT on public.organization_members to authenticated;
grant SELECT on public.organization_members to authenticated;
grant UPDATE on public.organization_members to authenticated;
grant DELETE on public.organization_members to authenticated;
grant TRUNCATE on public.organization_members to authenticated;
grant REFERENCES on public.organization_members to authenticated;
grant TRIGGER on public.organization_members to authenticated;
grant INSERT on public.organization_members to service_role;
grant SELECT on public.organization_members to service_role;
grant UPDATE on public.organization_members to service_role;
grant DELETE on public.organization_members to service_role;
grant TRUNCATE on public.organization_members to service_role;
grant REFERENCES on public.organization_members to service_role;
grant TRIGGER on public.organization_members to service_role;
grant INSERT on public.volunteers to authenticated;
grant SELECT on public.volunteers to authenticated;
grant UPDATE on public.volunteers to authenticated;
grant DELETE on public.volunteers to authenticated;
grant TRUNCATE on public.volunteers to authenticated;
grant REFERENCES on public.volunteers to authenticated;
grant TRIGGER on public.volunteers to authenticated;
grant INSERT on public.volunteers to service_role;
grant SELECT on public.volunteers to service_role;
grant UPDATE on public.volunteers to service_role;
grant DELETE on public.volunteers to service_role;
grant TRUNCATE on public.volunteers to service_role;
grant REFERENCES on public.volunteers to service_role;
grant TRIGGER on public.volunteers to service_role;
grant INSERT on public.volunteer_section_eligibility to authenticated;
grant SELECT on public.volunteer_section_eligibility to authenticated;
grant UPDATE on public.volunteer_section_eligibility to authenticated;
grant DELETE on public.volunteer_section_eligibility to authenticated;
grant TRUNCATE on public.volunteer_section_eligibility to authenticated;
grant REFERENCES on public.volunteer_section_eligibility to authenticated;
grant TRIGGER on public.volunteer_section_eligibility to authenticated;
grant INSERT on public.volunteer_section_eligibility to service_role;
grant SELECT on public.volunteer_section_eligibility to service_role;
grant UPDATE on public.volunteer_section_eligibility to service_role;
grant DELETE on public.volunteer_section_eligibility to service_role;
grant TRUNCATE on public.volunteer_section_eligibility to service_role;
grant REFERENCES on public.volunteer_section_eligibility to service_role;
grant TRIGGER on public.volunteer_section_eligibility to service_role;
grant INSERT on public.event_groups to authenticated;
grant SELECT on public.event_groups to authenticated;
grant UPDATE on public.event_groups to authenticated;
grant DELETE on public.event_groups to authenticated;
grant TRUNCATE on public.event_groups to authenticated;
grant REFERENCES on public.event_groups to authenticated;
grant TRIGGER on public.event_groups to authenticated;
grant INSERT on public.event_groups to service_role;
grant SELECT on public.event_groups to service_role;
grant UPDATE on public.event_groups to service_role;
grant DELETE on public.event_groups to service_role;
grant TRUNCATE on public.event_groups to service_role;
grant REFERENCES on public.event_groups to service_role;
grant TRIGGER on public.event_groups to service_role;
grant INSERT on public.line_message_deliveries to service_role;
grant SELECT on public.line_message_deliveries to service_role;
grant UPDATE on public.line_message_deliveries to service_role;
grant DELETE on public.line_message_deliveries to service_role;
grant TRUNCATE on public.line_message_deliveries to service_role;
grant REFERENCES on public.line_message_deliveries to service_role;
grant TRIGGER on public.line_message_deliveries to service_role;
grant INSERT on public.unavailability_requests to authenticated;
grant SELECT on public.unavailability_requests to authenticated;
grant UPDATE on public.unavailability_requests to authenticated;
grant DELETE on public.unavailability_requests to authenticated;
grant TRUNCATE on public.unavailability_requests to authenticated;
grant REFERENCES on public.unavailability_requests to authenticated;
grant TRIGGER on public.unavailability_requests to authenticated;
grant INSERT on public.unavailability_requests to service_role;
grant SELECT on public.unavailability_requests to service_role;
grant UPDATE on public.unavailability_requests to service_role;
grant DELETE on public.unavailability_requests to service_role;
grant TRUNCATE on public.unavailability_requests to service_role;
grant REFERENCES on public.unavailability_requests to service_role;
grant TRIGGER on public.unavailability_requests to service_role;
grant INSERT on public.event_group_volunteers to authenticated;
grant SELECT on public.event_group_volunteers to authenticated;
grant UPDATE on public.event_group_volunteers to authenticated;
grant DELETE on public.event_group_volunteers to authenticated;
grant TRUNCATE on public.event_group_volunteers to authenticated;
grant REFERENCES on public.event_group_volunteers to authenticated;
grant TRIGGER on public.event_group_volunteers to authenticated;
grant INSERT on public.event_group_volunteers to service_role;
grant SELECT on public.event_group_volunteers to service_role;
grant UPDATE on public.event_group_volunteers to service_role;
grant DELETE on public.event_group_volunteers to service_role;
grant TRUNCATE on public.event_group_volunteers to service_role;
grant REFERENCES on public.event_group_volunteers to service_role;
grant TRIGGER on public.event_group_volunteers to service_role;
grant INSERT on public.staffing_requirements to authenticated;
grant SELECT on public.staffing_requirements to authenticated;
grant UPDATE on public.staffing_requirements to authenticated;
grant DELETE on public.staffing_requirements to authenticated;
grant TRUNCATE on public.staffing_requirements to authenticated;
grant REFERENCES on public.staffing_requirements to authenticated;
grant TRIGGER on public.staffing_requirements to authenticated;
grant INSERT on public.staffing_requirements to service_role;
grant SELECT on public.staffing_requirements to service_role;
grant UPDATE on public.staffing_requirements to service_role;
grant DELETE on public.staffing_requirements to service_role;
grant TRUNCATE on public.staffing_requirements to service_role;
grant REFERENCES on public.staffing_requirements to service_role;
grant TRIGGER on public.staffing_requirements to service_role;
grant INSERT on public.event_occurrences to authenticated;
grant SELECT on public.event_occurrences to authenticated;
grant UPDATE on public.event_occurrences to authenticated;
grant DELETE on public.event_occurrences to authenticated;
grant TRUNCATE on public.event_occurrences to authenticated;
grant REFERENCES on public.event_occurrences to authenticated;
grant TRIGGER on public.event_occurrences to authenticated;
grant INSERT on public.event_occurrences to service_role;
grant SELECT on public.event_occurrences to service_role;
grant UPDATE on public.event_occurrences to service_role;
grant DELETE on public.event_occurrences to service_role;
grant TRUNCATE on public.event_occurrences to service_role;
grant REFERENCES on public.event_occurrences to service_role;
grant TRIGGER on public.event_occurrences to service_role;
grant INSERT on public.assignments to authenticated;
grant SELECT on public.assignments to authenticated;
grant UPDATE on public.assignments to authenticated;
grant DELETE on public.assignments to authenticated;
grant TRUNCATE on public.assignments to authenticated;
grant REFERENCES on public.assignments to authenticated;
grant TRIGGER on public.assignments to authenticated;
grant INSERT on public.assignments to service_role;
grant SELECT on public.assignments to service_role;
grant UPDATE on public.assignments to service_role;
grant DELETE on public.assignments to service_role;
grant TRUNCATE on public.assignments to service_role;
grant REFERENCES on public.assignments to service_role;
grant TRIGGER on public.assignments to service_role;
grant INSERT on public.unavailability to authenticated;
grant SELECT on public.unavailability to authenticated;
grant UPDATE on public.unavailability to authenticated;
grant DELETE on public.unavailability to authenticated;
grant TRUNCATE on public.unavailability to authenticated;
grant REFERENCES on public.unavailability to authenticated;
grant TRIGGER on public.unavailability to authenticated;
grant INSERT on public.unavailability to service_role;
grant SELECT on public.unavailability to service_role;
grant UPDATE on public.unavailability to service_role;
grant DELETE on public.unavailability to service_role;
grant TRUNCATE on public.unavailability to service_role;
grant REFERENCES on public.unavailability to service_role;
grant TRIGGER on public.unavailability to service_role;
