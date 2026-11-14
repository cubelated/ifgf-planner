import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const db = new PGlite({ extensions: { pgcrypto } });
const org = "00000000-0000-4000-8000-000000000001";
const otherOrg = "00000000-0000-4000-8000-000000000002";
const user = "00000000-0000-4000-8000-000000000003";
const event = "00000000-0000-4000-8000-000000000004";
const section = "00000000-0000-4000-8000-000000000005";
const volunteer = "00000000-0000-4000-8000-000000000006";
const connection = "00000000-0000-4000-8000-000000000007";

before(async () => {
  // Supabase extension interfaces are mocked; application SQL and RLS execute in Postgres.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to public;
    create table storage.objects (id uuid default gen_random_uuid(),bucket_id text,name text,created_at timestamptz default now(),updated_at timestamptz default now());
    create schema vault; create table vault.secrets(id uuid default gen_random_uuid(),name text unique,secret text);
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(secret text,name text) returns uuid language sql as $$ insert into vault.secrets(secret,name) values ($1,$2) returning id $$;
    create schema net; create table net.requests(headers jsonb,body jsonb); create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 1000) returns bigint language sql as $$ insert into net.requests values ($4,$2); select 1::bigint $$;
    create schema cron; create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text);
    create table cron.job_run_details(runid bigint primary key,jobid bigint,status text,start_time timestamptz,end_time timestamptz);
    create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
  `);
  await db.exec(await readFile(new URL("./fixtures/planner-schema.sql", import.meta.url), "utf8"));
  // These existing partial indexes support the public form's atomic resubmission path.
  await db.exec(`create unique index unavailability_volunteer_date_unique on public.unavailability(organization_id,volunteer_id,unavailable_date) where volunteer_id is not null;
    create unique index unavailability_request_name_date_unique on public.unavailability(request_id,lower(btrim(submitted_name)),unavailable_date) where volunteer_id is null and request_id is not null;`);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.startsWith("20261114")).sort()) {
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.exec(`
    insert into auth.users values ('${user}');
    insert into public.profiles(id,full_name) values ('${user}','Test coordinator');
    insert into public.organizations(id,name,slug,timezone) values ('${org}','Test','test','Asia/Taipei'),('${otherOrg}','Other','other','America/New_York');
    insert into public.organization_members(organization_id,user_id,role) values ('${org}','${user}','coordinator');
    insert into public.event_groups(id,organization_id,name,weekday,start_time,duration_minutes) values ('${event}','${org}','Service',0,'09:00',120);
    insert into public.service_sections(id,organization_id,name) values ('${section}','${org}','Music');
    insert into public.volunteers(id,organization_id,full_name) values ('${volunteer}','${org}','Test volunteer');
    insert into public.line_group_connections(id,event_id,line_group_id) values ('${connection}','${event}','test-group');
  `);
});
after(async () => { await db.close(); });
async function transaction(fn) { await db.exec("begin"); try { await fn(); } finally { await db.exec("rollback"); } }
async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }

// Date predicates are deliberately half-open UTC ranges computed from the organization timezone.
test("monthly reads include local month boundaries and retain old records", () => transaction(async () => {
  await db.exec(`insert into public.event_occurrences(organization_id,event_group_id,starts_at,ends_at) values
    ('${org}','${event}','2026-01-31T15:59:59Z','2026-01-31T16:30:00Z'),
    ('${org}','${event}','2026-01-31T16:00:00Z','2026-01-31T17:00:00Z'),
    ('${org}','${event}','2026-02-28T15:59:59Z','2026-02-28T16:30:00Z'),
    ('${org}','${event}','2026-02-28T16:00:00Z','2026-02-28T17:00:00Z');`);
  const month = await scalar("select public.get_planner_month($1,'2026-02-01')", [org]);
  assert.equal(month.occurrences.length, 2);
  assert.equal(await scalar("select count(*)::int from public.event_occurrences"), 4);
  await assert.rejects(db.query("select public.get_planner_month($1,'2026-02-02')", [org]), /first day/);
}));

test("monthly reads handle a DST transition without dropping the last hour", () => transaction(async () => {
  const e = await scalar(`insert into public.event_groups(organization_id,name,weekday,start_time,duration_minutes) values ('${otherOrg}','DST',0,'09:00',60) returning id`);
  await db.query(`insert into public.event_occurrences(organization_id,event_group_id,starts_at,ends_at) values
    ($1,$2,'2026-03-01T05:00Z','2026-03-01T06:00Z'),
    ($1,$2,'2026-04-01T03:59:59Z','2026-04-01T05:00Z'),
    ($1,$2,'2026-04-01T04:00Z','2026-04-01T05:00Z')`, [otherOrg,e]);
  assert.equal((await scalar("select public.get_planner_month($1,'2026-03-01')", [otherOrg])).occurrences.length, 2);
}));

test("monthly JSON aggregation does not truncate assignments at the REST row limit", () => transaction(async () => {
  const occurrence = await scalar(`insert into public.event_occurrences(organization_id,event_group_id,starts_at,ends_at) values ('${org}','${event}','2026-02-01T01:00Z','2026-02-01T03:00Z') returning id`);
  await db.query(`with v as (insert into public.volunteers(organization_id,full_name) select $1,'Volunteer '||n from generate_series(1,1005) n returning id)
    insert into public.assignments(organization_id,occurrence_id,section_id,volunteer_id) select $1,$2,$3,id from v`, [org,occurrence,section]);
  assert.equal((await scalar("select public.get_planner_month($1,'2026-02-01')", [org])).assignments.length, 1005);
}));

test("monthly and metadata RPCs preserve RLS and maintenance RPCs reject ordinary users", () => transaction(async () => {
  await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);`);
  assert.ok(await scalar("select public.get_planner_month($1,'2026-02-01')", [org]));
  await assert.rejects(db.query("select public.get_planner_month($1,'2026-02-01')", [otherOrg]), /Organization is unavailable/);
}));

test("ordinary authenticated users cannot invoke housekeeping or obtain Storage object paths", () => transaction(async () => {
  await db.exec("set local role authenticated");
  await assert.rejects(db.query("select public.expired_planner_exports(100)"), /permission denied/);
}));

test("unread counts include submissions from unloaded historical months and clear durably", () => transaction(async () => {
  const request = await scalar(`insert into public.unavailability_requests(organization_id,request_month,token_hash,expires_on) values ('${org}','2026-02-01',repeat('a',64),'2026-02-28') returning id`);
  await db.query(`insert into public.unavailability(organization_id,request_id,submitted_name,unavailable_date) values ($1,$2,'Test Person','2026-02-03'),($1,$2,'Test Person','2026-02-04')`, [org,request]);
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',true);`);
  assert.equal((await scalar("select public.get_planner_metadata($1)", [org])).unreadCount, 1);
  await db.exec(`insert into public.unavailability_read_states(organization_id,user_id,last_seen_at) values ('${org}','${user}',now()+interval '1 second');`);
  assert.equal((await scalar("select public.get_planner_metadata($1)", [org])).unreadCount, 0);
}));

test("cron retention is bounded and preserves current and unfinished executions", () => transaction(async () => {
  await db.exec(`insert into cron.job_run_details(runid,status,end_time) values
    (1,'succeeded',now()-interval '31 days'),(2,'failed',now()-interval '31 days'),
    (3,'succeeded',now()-interval '29 days'),(4,'running',null);`);
  assert.equal(await scalar("select private.prune_planner_cron_history(1)"), 1);
  assert.equal(await scalar("select private.prune_planner_cron_history(5000)"), 1);
  assert.equal(await scalar("select count(*)::int from cron.job_run_details"), 2);
}));

test("operational retention preserves retries, in-progress deliveries, and church history", () => transaction(async () => {
  await db.exec(`insert into public.line_group_connection_codes(event_id,code_hash,expires_at) values
    ('${event}',repeat('a',64),now()-interval '31 days'),('${event}',repeat('b',64),now()-interval '29 days');
    insert into public.line_message_deliveries(event_id,line_group_connection_id,occurrence_key,reminder_type,scheduled_for,status,attempt_count,updated_at) values
    ('${event}','${connection}','old-sent','test',now()-interval '91 days','sent',1,now()-interval '91 days'),
    ('${event}','${connection}','old-terminal','test',now()-interval '91 days','failed',3,now()-interval '91 days'),
    ('${event}','${connection}','old-retry','test',now()-interval '91 days','failed',2,now()-interval '91 days'),
    ('${event}','${connection}','old-processing','test',now()-interval '91 days','processing',1,now()-interval '91 days');`);
  const result = await scalar("select private.prune_planner_operations()");
  assert.deepEqual(result, { connectionCodes: 1, deliveries: 2, broadcasts: 0 });
  assert.equal(await scalar("select count(*)::int from public.volunteers"), 1);
  assert.equal(await scalar("select count(*)::int from public.line_message_deliveries"), 2);
}));

test("export cleanup lists only old objects in the temporary export bucket", () => transaction(async () => {
  await db.exec(`insert into storage.objects(bucket_id,name,created_at,updated_at) values
    ('line-schedule-exports','old.png',now()-interval '31 days',now()-interval '31 days'),
    ('line-schedule-exports','recent.png',now()-interval '29 days',now()-interval '29 days'),
    ('line-schedule-exports','updated.png',now()-interval '31 days',now()),
    ('another-bucket','keep.png',now()-interval '31 days',now()-interval '31 days');`);
  assert.deepEqual((await db.query("select * from public.expired_planner_exports(100)")).rows, [{ name: "old.png" }]);
  assert.equal(await scalar("select count(*)::int from storage.objects"), 4);
}));

test("idle reminder dispatch stops without reading missing Vault configuration", () => transaction(async () => {
  assert.equal(await scalar("select private.planner_line_work_due()"), false);
  assert.equal(await scalar("select private.dispatch_due_line_reminders()"), null);
}));

test("reminder gate requires a shared month and excludes sent or exhausted deliveries", () => transaction(async () => {
  const occurrence = await scalar(`insert into public.event_occurrences(organization_id,event_group_id,starts_at,ends_at) values ('${org}','${event}',now()+interval '24 hours',now()+interval '26 hours') returning id`);
  await db.query(`insert into public.assignments(organization_id,occurrence_id,section_id,volunteer_id) values ($1,$2,$3,$4)`, [org,occurrence,section,volunteer]);
  await db.exec(`insert into public.line_event_reminder_settings(event_id,enabled,reminder_minutes_before) values ('${event}',true,1440);`);
  assert.equal(await scalar("select private.planner_line_work_due()"), false);
  await db.exec(`insert into public.schedule_shares(organization_id,event_group_id,share_month,token_hash) values ('${org}','${event}',date_trunc('month',(now()+interval '24 hours') at time zone 'Asia/Taipei')::date,repeat('a',64));`);
  assert.equal(await scalar("select private.planner_line_work_due()"), true);
  await db.query(`insert into public.line_message_deliveries(event_id,line_group_connection_id,occurrence_key,reminder_type,scheduled_for,status,attempt_count) values ($1,$2,$3,'before_start:1440',now(),'sent',1)`, [event,connection,occurrence]);
  assert.equal(await scalar("select private.planner_line_work_due()"), false);
  await db.exec("update public.line_message_deliveries set status='failed',attempt_count=3");
  assert.equal(await scalar("select private.planner_line_work_due()"), false);
  await db.exec("update public.line_message_deliveries set status='failed',attempt_count=1");
  assert.equal(await scalar("select private.planner_line_work_due()"), true);
  assert.equal(await scalar("select private.planner_line_work_due(now()+interval '16 minutes')"), false);
}));


test("scheduled workers send gateway authorization plus a separate maintenance credential", () => transaction(async () => {
  await db.exec(`insert into vault.secrets(name,secret) values ('line_reminder_project_url','https://test.invalid'),('line_reminder_publishable_key','test-jwt');
    insert into storage.objects(bucket_id,name,created_at,updated_at) values ('line-schedule-exports','old.png',now()-interval '31 days',now()-interval '31 days');`);
  await db.exec("select private.dispatch_planner_maintenance(true)");
  const request = (await db.query("select * from net.requests")).rows[0];
  assert.equal(request.headers.Authorization, "Bearer test-jwt");
  assert.equal(request.headers.apikey, "test-jwt");
  assert.match(request.body.token, /^[0-9a-f]{64}$/);
  assert.equal(await scalar("select public.validate_planner_maintenance_token($1)", [request.body.token]), true);
  assert.equal(await scalar("select public.validate_planner_maintenance_token(repeat('0',64))"), false);
}));


const formToken = "test-event-date-form-token-".padEnd(40,"x");
async function createEventDateForm() {
  await db.query(`insert into public.unavailability_requests(organization_id,request_month,expires_on,token_hash)
    values($1,'2099-02-01','2099-02-28',encode(extensions.digest($2,'sha256'),'hex'))`, [org,formToken]);
  await db.exec(`update public.event_groups set week_occurrences=array[1,3]::smallint[] where id='${event}';
    insert into public.event_group_volunteers(event_group_id,volunteer_id) values ('${event}','${volunteer}');`);
}
async function submitEventDates(name, id, dates) {
  return scalar("select private.save_unavailability_form($1,$2,$3,$4::date[],'')", [formToken,name,id,dates]);
}

test("form exposes membership dates before assignments and includes recurrence for ungenerated months", () => transaction(async () => {
  await createEventDateForm();
  const otherEvent = await scalar(`insert into public.event_groups(organization_id,name,weekday,start_time) values ('${org}','Monday team',1,'09:00') returning id`);
  const form = await scalar("select private.load_unavailability_form($1)", [formToken]);
  assert.deepEqual(form.eventDates, ["2099-02-01","2099-02-02","2099-02-09","2099-02-15","2099-02-16","2099-02-23"]);
  assert.deepEqual(form.volunteers.find((v) => v.id === volunteer).eventDates, ["2099-02-01","2099-02-15"]);
  assert.equal(await scalar("select count(*)::int from public.event_occurrences"), 0);
  assert.ok(otherEvent);
}));

test("saved dates override recurrence and canceled or inactive events cannot be selected", () => transaction(async () => {
  await createEventDateForm();
  await db.exec(`insert into public.event_occurrences(organization_id,event_group_id,starts_at,ends_at,status) values
    ('${org}','${event}','2099-02-14T01:00Z','2099-02-14T03:00Z','scheduled'),
    ('${org}','${event}','2099-02-21T01:00Z','2099-02-21T03:00Z','cancelled');`);
  assert.deepEqual(await scalar("select to_jsonb(private.unavailability_event_dates($1,'2099-02-01',$2))",[org,volunteer]), ["2099-02-14"]);
  await db.exec(`update public.event_groups set is_active=false where id='${event}'`);
  assert.deepEqual(await scalar("select to_jsonb(private.unavailability_event_dates($1,'2099-02-01',null))",[org]), []);
}));

test("event eligibility uses local calendar boundaries and excludes other organizations", () => transaction(async () => {
  await createEventDateForm();
  await db.exec(`insert into public.event_occurrences(organization_id,event_group_id,starts_at,ends_at) values
    ('${org}','${event}','2099-01-31T16:00Z','2099-01-31T18:00Z'),
    ('${org}','${event}','2099-02-28T16:00Z','2099-02-28T18:00Z');
    insert into public.event_groups(organization_id,name,weekday,start_time) values ('${otherOrg}','Other organization Tuesday',2,'09:00');`);
  assert.deepEqual(await scalar("select to_jsonb(private.unavailability_event_dates($1,'2099-02-01',$2))",[org,volunteer]), ["2099-02-01"]);
}));

test("selected volunteers with no event membership have no eligible dates", () => transaction(async () => {
  await createEventDateForm();
  await db.exec("delete from public.event_group_volunteers");
  const form = await scalar("select private.load_unavailability_form($1)", [formToken]);
  assert.deepEqual(form.volunteers.find((v) => v.id === volunteer).eventDates, []);
  await assert.rejects(submitEventDates("Test volunteer",volunteer,["2099-02-01"]), /Pilih hanya tanggal kegiatan/);
}));

test("invalid submissions cannot overwrite an existing valid response", () => transaction(async () => {
  await createEventDateForm();
  await submitEventDates("Test volunteer",volunteer,["2099-02-01"]);
  await db.exec("savepoint invalid_dates");
  await assert.rejects(submitEventDates("Test volunteer",volunteer,["2099-02-01","2099-02-02"]), /Pilih hanya tanggal kegiatan/);
  await db.exec("rollback to savepoint invalid_dates");
  assert.equal(await scalar("select count(*)::int from public.unavailability"), 1);
  assert.equal(await scalar("select unavailable_date::text from public.unavailability"), "2099-02-01");
}));

test("new names can choose organization event dates, and omitting an existing volunteer ID cannot bypass restrictions", () => transaction(async () => {
  await createEventDateForm();
  await db.exec(`insert into public.event_groups(organization_id,name,weekday,start_time) values ('${org}','Monday team',1,'09:00')`);
  await submitEventDates("New person",null,["2099-02-02"]);
  assert.equal(await scalar("select volunteer_id from public.unavailability where submitted_name='New person'"), null);
  await db.exec("savepoint missing_id");
  await assert.rejects(submitEventDates(" test VOLUNTEER ",null,["2099-02-02"]), /Pilih hanya tanggal kegiatan/);
  await db.exec("rollback to savepoint missing_id");
  await submitEventDates(" test VOLUNTEER ",null,["2099-02-01"]);
  assert.equal(await scalar("select volunteer_id from public.unavailability where submitted_name='Test volunteer'"), volunteer);
}));

test("public clients cannot directly call privileged form date functions", () => transaction(async () => {
  await db.exec("set local role authenticated");
  await assert.rejects(db.query("select to_jsonb(private.unavailability_event_dates($1,'2099-02-01',null))",[org]), /permission denied/);
}));
