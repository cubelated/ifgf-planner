import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = await readFile(
  new URL("../app/planner-app.tsx", import.meta.url),
  "utf8",
);

test("uses password sign-in as the default authentication mode", () => {
  assert.match(
    plannerSource,
    /useState<\s*"sign-in" \| "sign-up" \| "magic-link"\s*>\("sign-in"\)/,
  );
  assert.match(plannerSource, /auth\.signInWithPassword\(\{/);
});

test("supports password account creation with an email confirmation redirect", () => {
  assert.match(plannerSource, /auth\.signUp\(\{/);
  assert.match(plannerSource, /emailRedirectTo:\s*window\.location\.origin/);
});

test("keeps magic-link sign-in from creating accounts", () => {
  assert.match(plannerSource, /auth\.signInWithOtp\(\{/);
  assert.match(plannerSource, /shouldCreateUser:\s*false/);
});

test("lets signed-in users change their password without an email flow", () => {
  assert.match(plannerSource, /auth\.signInWithPassword\(\{\s*email,\s*password:\s*currentPassword/s);
  assert.match(plannerSource, /auth\.updateUser\(\{\s*password:\s*newPassword/s);
  assert.doesNotMatch(plannerSource, /ChangePasswordDialog[\s\S]*?auth\.reauthenticate\(/);
  assert.match(plannerSource, /Kata sandi berhasil diperbarui\./);
});
