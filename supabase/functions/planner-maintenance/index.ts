import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const supabase = createClient(requireEnv("SUPABASE_URL"), getAdminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: authorized, error: authError } = await supabase.rpc("validate_planner_maintenance_token", { request_token: body.token });
    if (authError || !authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    let removed = 0;
    // Bounded work: at most 1,000 objects per invocation; retry safely if a batch fails.
    for (let batch = 0; batch < 10; batch++) {
      const { data, error } = await supabase.rpc("expired_planner_exports", { batch_size: 100 });
      if (error) throw error;
      const paths = (data ?? []).map((item: { name: string }) => item.name);
      if (!paths.length) return Response.json({ ok: true, removed, hasMore: false });
      const { error: removeError } = await supabase.storage.from("line-schedule-exports").remove(paths);
      if (removeError) throw removeError;
      removed += paths.length;
    }
    return Response.json({ ok: true, removed, hasMore: true });
  } catch (error) {
    console.error("planner-maintenance failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Planner maintenance failed" }, { status: 500 });
  }
});

function getAdminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const map = JSON.parse(raw) as Record<string, string>;
    if (map.default) return Deno.env.get(map.default) ?? map.default;
  }
  throw new Error("Supabase admin secret is not configured");
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

