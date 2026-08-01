import assert from "node:assert/strict";
import test from "node:test";

import {
  isDateAfterExpiry,
  lastDateOfMonth,
} from "../lib/unavailability.ts";

test("uses the final calendar date as the default expiry", () => {
  assert.equal(lastDateOfMonth("2026-08"), "2026-08-31");
  assert.equal(lastDateOfMonth("2028-02"), "2028-02-29");
});

test("keeps a form open through its expiry date", () => {
  assert.equal(isDateAfterExpiry("2026-08-20", "2026-08-20"), false);
  assert.equal(isDateAfterExpiry("2026-08-21", "2026-08-20"), true);
});
