import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scheduleSource = await readFile(
  new URL("../app/pages/schedule.tsx", import.meta.url),
  "utf8",
);
const plannerSource = await readFile(
  new URL("../app/planner-app.tsx", import.meta.url),
  "utf8",
);

test("schedule filters are restored from user-scoped browser storage", () => {
  assert.match(scheduleSource, /ifgf-planner:schedule-filters/);
  assert.match(scheduleSource, /window\.localStorage\.getItem/);
  assert.match(scheduleSource, /window\.localStorage\.setItem/);
  assert.match(scheduleSource, /data\.organization\.id, userId/);
  assert.match(plannerSource, /userId=\{user\.id\}/);
});

test("assignment dialog filters volunteers by name", () => {
  assert.match(plannerSource, /placeholder="Cari nama pelayan\.\.\."/);
  assert.match(plannerSource, /type="search"/);
  assert.match(plannerSource, /visibleCandidates = candidates\.filter/);
  assert.match(plannerSource, /visibleBlocked = blocked\.filter/);
});
