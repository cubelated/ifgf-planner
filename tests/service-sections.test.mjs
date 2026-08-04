import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsSource = await readFile(
  new URL("../app/pages/settings.tsx", import.meta.url),
  "utf8",
);
const dataSource = await readFile(
  new URL("../lib/planner-data.ts", import.meta.url),
  "utf8",
);

test("service sections can be assigned to several events when created or edited", () => {
  assert.match(settingsSource, /Kegiatan yang menggunakan bagian ini/);
  assert.match(settingsSource, /type="checkbox"/);
  assert.match(dataSource, /eventGroupIds: string\[\]/);
  assert.match(dataSource, /from\("staffing_requirements"\)\.insert\(/);
  assert.match(dataSource, /updateServiceSection/);
});

test("service section removal is confirmed and scoped to its organization", () => {
  assert.match(settingsSource, /window\.confirm\(/);
  assert.match(settingsSource, /Tindakan ini tidak dapat dibatalkan/);
  assert.match(dataSource, /deleteServiceSection/);
  assert.match(
    dataSource,
    /\.from\("service_sections"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", input\.id\)[\s\S]*?\.eq\("organization_id", input\.organizationId\)/,
  );
});

test("an event cannot be removed from a service while assignments still exist", () => {
  assert.match(dataSource, /removedEventGroupIds/);
  assert.match(dataSource, /Hapus penugasannya terlebih dahulu/);
});
