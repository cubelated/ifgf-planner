import assert from "node:assert/strict";
import { test } from "node:test";
import { retainPlannerMonths, validatePlannerMonth } from "../lib/planner-month-cache.ts";

test("month cache stays bounded and keeps current/next month while browsing history", () => {
  const pinned = ["2026-11", "2026-12"];
  let cache = { "2026-11": 11, "2026-12": 12 };
  for (let month = 1; month <= 10; month++) cache = retainPlannerMonths(cache, `2026-${String(month).padStart(2,"0")}`, month, pinned);
  assert.equal(Object.keys(cache).length, 6);
  assert.equal(cache["2026-11"], 11);
  assert.equal(cache["2026-12"], 12);
  assert.equal(cache["2026-10"], 10);
  assert.equal(cache["2026-01"], undefined);
});

test("refreshing a month replaces its cached data and invalid months are rejected", () => {
  const original = { "2026-11": [1] };
  const updated = retainPlannerMonths(original,"2026-11",[2],["2026-11","2026-12"]);
  assert.deepEqual(original["2026-11"],[1]);
  assert.deepEqual(updated["2026-11"],[2]);
  assert.equal(validatePlannerMonth("2026-12"),"2026-12-01");
  for (const value of ["2026-00","2026-13","2026-1","2026-11-01","bad"]) assert.throws(() => validatePlannerMonth(value));
});
