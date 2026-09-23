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

test("assignment dialog warns about cross-event double booking on the same day", () => {
  assert.match(plannerSource, /function sameDayOtherEventAssignments/);
  assert.match(
    plannerSource,
    /occurrence\.event_group_id === target\.occurrence\.event_group_id/,
  );
  assert.match(
    plannerSource,
    /localDateKey\(occurrence\.starts_at, data\.organization\.timezone\)/,
  );
  assert.match(
    plannerSource,
    /sameDayConflicts\.get\(volunteer\.id\) \?\? \[\]/,
  );
  assert.match(plannerSource, /Hari yang sama:/);
  assert.match(plannerSource, /tetap dapat ditambahkan/);
  assert.doesNotMatch(plannerSource, /!sameDayConflicts\.has\(volunteer\.id\)/);
});
