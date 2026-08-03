import assert from "node:assert/strict";
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
