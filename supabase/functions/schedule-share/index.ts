import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;
  throw new Error("Supabase admin key is unavailable.");
}

async function loadSchedule(token: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("Supabase URL is unavailable.");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_shared_schedule`, {
    method: "POST",
    headers: {
      apikey: adminKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ share_token: token }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "message" in result
      ? String(result.message)
      : "Database request failed.";
    throw new RequestError(message, response.status >= 500 ? 500 : 400);
  }
  return result;
}

function readToken(value: unknown) {
  if (typeof value !== "string" || value.length < 32 || value.length > 128) {
    throw new RequestError("Tautan jadwal tidak valid atau sudah tidak tersedia.", 400);
  }
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4_096) return json({ error: "Permintaan terlalu besar." }, 413);

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestError("Permintaan jadwal tidak valid.", 400);
    }

    const token = readToken((body as Record<string, unknown>).token);
    const schedule = await loadSchedule(token);
    return json(schedule);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("Shared schedule request failed", error);
    return json({ error: "Jadwal tidak dapat dibuka sekarang." }, 500);
  }
});
