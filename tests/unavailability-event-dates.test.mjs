import assert from "node:assert/strict";
import test from "node:test";
import { allowedUnavailabilityDates, retainEligibleDates, parseEventDates } from "../lib/unavailability-event-dates.ts";
const form = { eventDates: ["2099-02-01","2099-02-02"], volunteers: [
  { id:"sunday", eventDates:["2099-02-01"] }, { id:"monday", eventDates:["2099-02-02"] }, { id:"none", eventDates:[] },
] };
test("existing volunteers use membership dates and unknown names use organization dates", () => {
  assert.deepEqual(allowedUnavailabilityDates(form,"sunday"),["2099-02-01"]);
  assert.deepEqual(allowedUnavailabilityDates(form,null),form.eventDates);
  assert.deepEqual(allowedUnavailabilityDates(form,"none"),[]);
  assert.deepEqual(allowedUnavailabilityDates(form,"invalid-id"),[]);
});
test("changing names removes selections that do not belong to the new volunteer", () => {
  assert.deepEqual(retainEligibleDates(form.eventDates,allowedUnavailabilityDates(form,"monday")),["2099-02-02"]);
  assert.deepEqual(retainEligibleDates(["2099-02-01"],allowedUnavailabilityDates(form,"none")),[]);
});
test("event-date payload parsing fails closed and deduplicates date keys", () => {
  assert.equal(parseEventDates(undefined,"2099-02"),null);
  assert.equal(parseEventDates(["2099-02-31"],"2099-02"),null);
  assert.equal(parseEventDates(["2099-03-01"],"2099-02"),null);
  assert.deepEqual(parseEventDates(["2099-02-02","2099-02-01","2099-02-01"],"2099-02"),form.eventDates);
  assert.deepEqual(parseEventDates([],"2099-02"),[]);
});
