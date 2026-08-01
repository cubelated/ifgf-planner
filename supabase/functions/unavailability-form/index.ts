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

async function callRpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("Supabase URL is unavailable.");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: adminKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "message" in result
      ? String(result.message)
      : "Database request failed.";
    throw new RequestError(message, response.status >= 500 ? 500 : 400);
  }

  return result as T;
}

function readBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Permintaan formulir tidak valid.", 400);
  }
  return value as Record<string, unknown>;
}

function readToken(value: unknown) {
  if (typeof value !== "string" || value.length < 32 || value.length > 128) {
    throw new RequestError("Tautan formulir tidak valid atau sudah ditutup.", 400);
  }
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) return json({ error: "Permintaan terlalu besar." }, 413);

  try {
    const body = readBody(await request.json());
    const token = readToken(body.token);

    if (body.action === "load") {
      const data = await callRpc<unknown>("get_unavailability_form", {
        request_token: token,
      });
      return json(data);
    }

    if (body.action === "submit") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const volunteerId = typeof body.volunteerId === "string" ? body.volunteerId : null;
      const submittedDates = Array.isArray(body.dates) ? body.dates : [];
      const dates = submittedDates
        .filter((date): date is string => typeof date === "string");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";

      if (name.length < 2 || name.length > 120) {
        throw new RequestError("Masukkan nama antara 2 dan 120 karakter.", 400);
      }
      if (!dates.length || dates.length > 31 || dates.length !== submittedDates.length) {
        throw new RequestError("Pilih setidaknya satu tanggal yang valid.", 400);
      }
      if (reason.length > 500) {
        throw new RequestError("Catatan tidak boleh lebih dari 500 karakter.", 400);
      }

      const data = await callRpc<unknown>("submit_unavailability_form", {
        request_token: token,
        respondent_name: name,
        selected_volunteer_id: volunteerId,
        unavailable_dates: dates,
        response_reason: reason,
      });
      return json(data);
    }

    throw new RequestError("Tindakan formulir tidak dikenal.", 400);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("Unavailability form request failed", error);
    return json({ error: "Formulir tidak dapat diproses sekarang." }, 500);
  }
});
