import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  defaultUnavailabilityExpiry,
  isDateAfterExpiry,
  lastDateOfMonth,
} from "../lib/unavailability.ts";

test("finds the final calendar date of a month", () => {
  assert.equal(lastDateOfMonth("2026-08"), "2026-08-31");
  assert.equal(lastDateOfMonth("2028-02"), "2028-02-29");
});

test("defaults new forms to the previous month's fifteenth", () => {
  assert.equal(defaultUnavailabilityExpiry("2026-08"), "2026-07-15");
  assert.equal(defaultUnavailabilityExpiry("2027-01"), "2026-12-15");
});

test("keeps a form open through its expiry date", () => {
  assert.equal(isDateAfterExpiry("2026-08-20", "2026-08-20"), false);
  assert.equal(isDateAfterExpiry("2026-08-21", "2026-08-20"), true);
});

test("republishing a form preserves its existing share token", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260804084133_record_unavailability_request_creator.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /share_token = coalesce\(\s*unavailability_requests\.share_token,\s*excluded\.share_token\s*\)/,
  );
  assert.match(
    migration,
    /when unavailability_requests\.share_token is null then excluded\.token_hash/,
  );
  assert.doesNotMatch(migration, /created_by/);
});

test("the form UI creates or updates before offering a separate copy action", async () => {
  const source = await readFile(
    new URL("../app/planner-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /\? "Perbarui"\s*:\s*"Buat"/);
  assert.match(source, /aria-label="Salin tautan"/);
  assert.doesNotMatch(
    source.match(/async function createLink\(\)[\s\S]*?async function copyLink/)?.[0] ?? "",
    /clipboard\?\.writeText/,
  );
});

test("LINE scheduling restores announce_at without storing a creator", async () => {
  const [migration, removalMigration, plannerData] = await Promise.all([
    readFile(
      new URL(
        "../supabase/migrations/20260804083641_stabilize_unavailability_links_and_line_broadcasts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260804091739_remove_created_by_columns.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/planner-data.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /add column if not exists announce_at timestamptz/);
  assert.match(migration, /alter column announce_at set not null/);
  assert.match(
    removalMigration,
    /alter table public\.line_unavailability_broadcasts\s+drop column if exists created_by/,
  );
  assert.match(
    removalMigration,
    /alter table public\.unavailability_requests\s+drop column if exists created_by/,
  );
  assert.match(
    removalMigration,
    /alter table public\.line_group_connection_codes\s+drop column if exists created_by/,
  );
  const schedulingFunction = plannerData.match(
    /export async function scheduleUnavailabilityLineBroadcast[\s\S]*?\n}\n/,
  )?.[0] ?? "";
  assert.doesNotMatch(schedulingFunction, /created_by|auth\.getUser/);
});

test("the unavailability page restores and displays saved LINE scheduling", async () => {
  const source = await readFile(
    new URL("../app/planner-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /broadcast\.request_id === initialRequest\.id[\s\S]*?broadcast\.status !== "cancelled"/,
  );
  assert.match(source, /setSendToLine\(Boolean\(nextLineBroadcast\)\)/);
  assert.match(source, /Konfigurasi LINE tersimpan/);
  assert.match(source, /Pengumuman dijadwalkan/);
  assert.match(source, /Pengingat dijadwalkan/);
});

test("the unavailability page persists the latest selected month per user and organization", async () => {
  const source = await readFile(
    new URL("../app/planner-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /ifgf-planner:unavailability-month:\$\{data\.organization\.id\}:\$\{data\.user\.id\}/,
  );
  assert.match(source, /window\.localStorage\.getItem\(monthStorageKey\)/);
  assert.match(
    source,
    /window\.localStorage\.setItem\(monthStorageKey, nextMonth\)/,
  );
  assert.match(source, /\^\\d\{4\}-\\d\{2\}\$/);
});

test("completed LINE unavailability broadcasts are deleted after every configured message is sent", async () => {
  const source = await readFile(
    new URL(
      "../supabase/functions/send-line-reminders/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /announcementSent && \(!broadcast\.reminder_at \|\| reminderSent\) && !broadcastFailed/,
  );
  assert.match(
    source,
    /from\("line_unavailability_broadcasts"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", broadcast\.id\)/,
  );
  assert.doesNotMatch(
    source,
    /update\(\{ status: "completed"/,
  );
});

test("schedule sharing no longer references a creator column", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260804091739_remove_created_by_columns.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /create or replace function public\.create_schedule_share/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.create_schedule_share[\s\S]*?\$\$;/)?.[0] ?? "",
    /created_by/,
  );
});
