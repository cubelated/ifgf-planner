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
  assert.match(migration, /created_by\s*\) values \([\s\S]*?\(select auth\.uid\(\)\)/);
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

test("LINE scheduling restores announce_at and records the coordinator", async () => {
  const [migration, plannerData] = await Promise.all([
    readFile(
      new URL(
        "../supabase/migrations/20260804083641_stabilize_unavailability_links_and_line_broadcasts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/planner-data.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /add column if not exists announce_at timestamptz/);
  assert.match(migration, /alter column announce_at set not null/);
  assert.match(plannerData, /created_by: userResult\.user\.id/);
});
