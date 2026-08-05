import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/planner-app.tsx", import.meta.url), "utf8");
const data = await readFile(new URL("../lib/planner-data.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260804170000_manage_unavailability_submissions.sql", import.meta.url), "utf8");

test("coordinators can manage submitted unavailability responses", () => {
  assert.match(app, /Kelola jawaban ketidakhadiran/);
  assert.match(app, /Hubungkan ke pelayan/);
  assert.match(app, /Hapus jawaban/);
  assert.match(data, /update_unavailability_submission/);
  assert.match(data, /delete_unavailability_submission/);
  assert.match(migration, /private\.has_org_role/);
  assert.match(migration, /array\['owner', 'coordinator'\]/);
  assert.match(migration, /on conflict \(organization_id, volunteer_id, unavailable_date\)/);
});
