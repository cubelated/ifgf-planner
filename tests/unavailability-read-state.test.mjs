import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/planner-app.tsx", import.meta.url), "utf8");
const data = await readFile(new URL("../lib/planner-data.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../supabase/migrations/20260904090000_track_unavailability_read_state.sql", import.meta.url),
  "utf8",
);

test("unavailability badge uses durable coordinator read state", () => {
  assert.doesNotMatch(app, /key === "schedule" && unfilled/);
  assert.match(app, /markUnavailabilitySeen/);
  assert.match(app, /view !== "unavailability"/);
  assert.match(data, /unavailability_read_states/);
  assert.match(migration, /primary key \(organization_id, user_id\)/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
});

test("unavailability submissions show seen and unseen highlights", () => {
  assert.match(app, /group\.unseen \? "Baru" : "Dilihat"/);
  assert.match(css, /\.monthly-absence-item\.unseen/);
  assert.match(css, /\.monthly-absence-item\.seen/);
});
