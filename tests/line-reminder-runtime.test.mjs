import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const raw = await readFile(new URL("../supabase/functions/send-line-reminders/index.ts", import.meta.url), "utf8");
const source = ts.transpileModule(raw.replace(/^import .*;$/gm, "") + "\nglobalThis.testing = { deliver, buildEventMessage, processFormBroadcasts, claimDelivery };", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup(tables = {}, fetchImpl = async () => new Response("{}")) {
  const requests = [];
  const client = {
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const query = { table, action: "select", filters: [], payload: null, singular: false, columns: "*" };
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        insert(payload) { query.action = "insert"; query.payload = payload; return chain; },
        update(payload) { query.action = "update"; query.payload = payload; return chain; },
        eq(key, value) { query.filters.push([key, value]); return chain; },
        in(key, values) { query.filters.push([key, values]); return chain; },
        or() { return chain; }, neq() { return chain; }, order() { return chain; },
        gte() { return chain; }, gt() { return chain; }, lte() { return chain; }, limit() { return chain; },
        single() { query.singular = true; return chain; }, maybeSingle() { query.singular = true; return chain; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            requests.push(structuredClone(query));
            const rows = tables[table] ??= [];
            const matches = (row) => query.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
            if (query.action === "insert") {
              if (rows.some((row) => row.line_group_connection_id === query.payload.line_group_connection_id && row.occurrence_key === query.payload.occurrence_key && row.reminder_type === query.payload.reminder_type)) return { data: null, error: { code: "23505" } };
              const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...query.payload };
              rows.push(row);
              return { data: query.singular ? structuredClone(row) : [structuredClone(row)], error: null };
            }
            const selected = rows.filter(matches);
            if (query.action === "update") for (const row of selected) Object.assign(row, query.payload);
            return { data: query.singular ? structuredClone(selected[0] ?? null) : structuredClone(selected), error: null };
          }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  let handler;
  const context = { createClient: () => client, Deno: { env: { get: () => "test-only" }, serve: (fn) => { handler = fn; } }, fetch: fetchImpl,
    Response, Request, Intl, Date, Map, Set, console: { error() {} } };
  vm.runInNewContext(source, context);
  return { ...context.testing, handler, tables, requests };
}

test("LINE accepted retries are successful only with an accepted-request header", async () => {
  await setup({}, async () => new Response("{}", { status: 409, headers: { "x-line-accepted-request-id": "accepted" } })).deliver("group", [], "key");
  await assert.rejects(setup({}, async () => new Response("{}", { status: 409 })).deliver("group", [], "key"), /LINE API 409/);
});

test("reminder worker rejects an unauthenticated invocation before loading church data", async () => {
  const worker = setup();
  const response = await worker.handler(new Request("https://test.invalid", { method: "POST", body: "{}" }));
  assert.equal(response.status, 401);
  assert.equal(worker.requests.length, 0);
});

test("shared schedule publication uses the local month and no legacy assignment column", async () => {
  const tables = {
    schedule_shares: [{ id: "share", event_group_id: "event", organization_id: "org", share_month: "2026-02-01" }],
    assignments: [{ occurrence_id: "occurrence", section_id: "section", volunteer_id: "volunteer", status: "assigned" }],
    service_sections: [{ id: "section", name: "Music", sort_order: 1 }],
    volunteers: [{ id: "volunteer", full_name: "Test Person" }],
  };
  const worker = setup(tables);
  const message = await worker.buildEventMessage({ require_published_schedule: true, arrival_minutes_before: 30 }, { id: "event", organization_id: "org", name: "Service" }, { id: "occurrence", starts_at: "2026-01-31T16:00Z" }, "Asia/Taipei");
  assert.match(message, /Music: Test Person/);
  assert.ok(worker.requests.every((query) => !query.columns.includes("schedule_version_id")));
  tables.schedule_shares = [];
  assert.equal(await worker.buildEventMessage({ require_published_schedule: true }, { id: "event", organization_id: "org" }, { id: "occurrence", starts_at: "2026-01-31T16:00Z" }, "Asia/Taipei"), null);
});

test("broadcast completion waits for every LINE group, and retries preserve the delivery key", async () => {
  const tables = {
    line_unavailability_broadcasts: [{ id: "broadcast", request_id: "request", event_id: "event", share_url: "https://test.invalid/form#token=test", status: "scheduled", announce_at: new Date(Date.now()-60_000).toISOString(), reminder_at: null, announced_at: null, reminder_sent_at: null }],
    unavailability_requests: [{ id: "request", request_month: "2027-01-01", expires_on: "2099-01-31", status: "open", organization_id: "org" }],
    event_groups: [{ id: "event", organization_id: "org", name: "Service" }],
    line_group_connections: [{ id: "connection1", event_id: "event", line_group_id: "group1", status: "active" }, { id: "connection2", event_id: "event", line_group_id: "group2", status: "active" }],
    organizations: [{ id: "org", timezone: "Asia/Taipei", name: "Test" }],
  };
  const sends = [];
  let failSecond = true;
  const worker = setup(tables, async (_url, options) => {
    const to = JSON.parse(options.body).to;
    sends.push({ to, retryKey: options.headers["X-Line-Retry-Key"] });
    return new Response("{}", { status: to === "group2" && failSecond ? 500 : 200 });
  });
  await worker.processFormBroadcasts();
  assert.equal(tables.line_unavailability_broadcasts[0].announced_at, null);
  assert.equal(tables.line_unavailability_broadcasts[0].status, "scheduled");
  failSecond = false;
  await worker.processFormBroadcasts();
  assert.equal(tables.line_unavailability_broadcasts[0].status, "completed");
  assert.equal(sends.filter((send) => send.to === "group1").length, 1);
  const retries = sends.filter((send) => send.to === "group2");
  assert.equal(retries.length, 2);
  assert.equal(retries[0].retryKey, retries[1].retryKey);
});
