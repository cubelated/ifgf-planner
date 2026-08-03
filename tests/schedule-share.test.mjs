import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicScheduleShare } from "../lib/schedule-share.ts";

const validSchedule = {
  organizationName: "IFGF Taipei",
  eventName: "Sunday Service",
  month: "2026-08",
  timezone: "Asia/Taipei",
  occurrences: [
    {
      startsAt: "2026-08-02T01:00:00+00:00",
      endsAt: "2026-08-02T03:00:00+00:00",
      status: "scheduled",
    },
  ],
  sections: [
    {
      name: "Worship",
      neededCount: 2,
      volunteersByOccurrence: [["Ivy", "Hanssen"]],
    },
  ],
};

test("parses the scoped public schedule projection", () => {
  assert.deepEqual(parsePublicScheduleShare(validSchedule), validSchedule);
});

test("rejects a public schedule without its event scope", () => {
  assert.equal(
    parsePublicScheduleShare({ ...validSchedule, eventName: undefined }),
    null,
  );
});

test("drops malformed names from shared assignment cells", () => {
  const parsed = parsePublicScheduleShare({
    ...validSchedule,
    sections: [{
      ...validSchedule.sections[0],
      volunteersByOccurrence: [["Ivy", null, 12]],
    }],
  });

  assert.deepEqual(parsed?.sections[0].volunteersByOccurrence, [["Ivy"]]);
});
