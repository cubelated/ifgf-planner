import assert from "node:assert/strict";
import test from "node:test";

import {
  generateOccurrenceDatesForMonth,
  monthKeyAfter,
} from "../lib/recurrence.ts";

const base = {
  weekday: 0,
  startTime: "09:00",
  durationMinutes: 120,
  timezone: "Asia/Taipei",
  month: "2026-08",
};

function localDays(occurrences) {
  return occurrences.map((occurrence) =>
    Number(new Intl.DateTimeFormat("en-US", {
      timeZone: base.timezone,
      day: "numeric",
    }).format(new Date(occurrence.startsAt))),
  );
}

test("generates every matching weekday in one month", () => {
  const occurrences = generateOccurrenceDatesForMonth({
    ...base,
    weekOccurrences: [1, 2, 3, 4, 5],
  });

  assert.deepEqual(localDays(occurrences), [2, 9, 16, 23, 30]);
});

test("generates only first and third monthly occurrences", () => {
  const occurrences = generateOccurrenceDatesForMonth({
    ...base,
    weekOccurrences: [1, 3],
  });

  assert.deepEqual(localDays(occurrences), [2, 16]);
});

test("excludes the fifth occurrence when requested", () => {
  const occurrences = generateOccurrenceDatesForMonth({
    ...base,
    weekOccurrences: [1, 2, 3, 4],
  });

  assert.deepEqual(localDays(occurrences), [2, 9, 16, 23]);
});

test("moves across year boundaries one month at a time", () => {
  assert.equal(monthKeyAfter("2026-12"), "2027-01");
  assert.equal(monthKeyAfter("2027-01", -1), "2026-12");
});
