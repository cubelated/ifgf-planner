import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(requireEnv("SUPABASE_URL"), getAdminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405);

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new RequestError("Sesi tidak valid.", 401);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authorization.slice(7),
    );
    if (userError || !userData.user) throw new RequestError("Sesi tidak valid.", 401);

    const body = await request.json() as Record<string, unknown>;
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(eventId)) {
      throw new RequestError("Kegiatan tidak valid.", 400);
    }

    const { data: eventGroup } = await supabaseAdmin
      .from("event_groups")
      .select("id, organization_id, name")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventGroup) throw new RequestError("Kegiatan tidak ditemukan.", 404);

    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", eventGroup.organization_id)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .in("role", ["owner", "coordinator"])
      .maybeSingle();
    if (!membership) throw new RequestError("Anda tidak memiliki izin untuk menghubungkan LINE.", 403);

    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const randomPart = Array.from(bytes, (byte) => characters[byte % characters.length]).join("");
    const connectionCode = `IFGF-${randomPart}`;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error } = await supabaseAdmin.from("line_group_connection_codes").insert({
      event_id: eventId,
      code_hash: await sha256(connectionCode),
      created_by: userData.user.id,
      expires_at: expiresAt,
    });
    if (error) throw new Error(`Kode tidak dapat disimpan: ${error.message}`);

    return json({
      connectionCode,
      command: `/connect ${connectionCode}`,
      eventName: eventGroup.name,
      expiresAt,
    });
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("create-line-connection-code failed", error);
    return json({ error: "Kode koneksi LINE tidak dapat dibuat." }, 500);
  }
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getAdminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const map = JSON.parse(raw) as Record<string, string>;
    if (map.default) return Deno.env.get(map.default) ?? map.default;
  }
  throw new Error("Supabase admin secret is unavailable.");
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
