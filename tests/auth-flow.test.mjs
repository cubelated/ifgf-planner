import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = await readFile(
  new URL("../app/planner-app.tsx", import.meta.url),
  "utf8",
);

test("uses password sign-in as the default authentication mode", () => {
  assert.match(plannerSource, /auth\.signInWithPassword\(\{/);
  assert.match(plannerSource, /autoComplete="current-password"/);
});

test("disables account creation and removes passwordless email-link login", () => {
  assert.match(
    plannerSource,
    /<button\s+type="button"\s+disabled\s+aria-disabled="true"[\s\S]*?Buat akun\s*<\/button>/,
  );
  assert.doesNotMatch(plannerSource, /auth\.signUp\(/);
  assert.doesNotMatch(plannerSource, /auth\.signInWithOtp\(/);
  assert.doesNotMatch(plannerSource, /magic-link/);
});

test("lets signed-in users change their password without an email flow", () => {
  assert.match(plannerSource, /auth\.signInWithPassword\(\{\s*email,\s*password:\s*currentPassword/s);
  assert.match(plannerSource, /auth\.updateUser\(\{\s*password:\s*newPassword/s);
  assert.doesNotMatch(plannerSource, /ChangePasswordDialog[\s\S]*?auth\.reauthenticate\(/);
  assert.match(plannerSource, /Kata sandi berhasil diperbarui\./);
});
