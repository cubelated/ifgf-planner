import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/pages/schedule.tsx", import.meta.url),
  "utf8",
);

test("image exports leave unassigned service cells blank", () => {
  const imageRenderer = source.match(
    /function createScheduleImage\([\s\S]*?export default function Schedule/,
  )?.[0] ?? "";

  assert.match(
    imageRenderer,
    /name === "Belum ditugaskan" \? "" : name/,
  );
  assert.doesNotMatch(
    source.match(/function createScheduleCsv\([\s\S]*?function defaultScheduleMonth/)?.[0] ?? "",
    /name === "Belum ditugaskan" \? "" : name/,
  );
});
