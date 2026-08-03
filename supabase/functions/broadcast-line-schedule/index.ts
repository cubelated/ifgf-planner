import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const BUCKET = "line-schedule-exports";
const MAX_IMAGE_BYTES = 9_500_000;

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
    if (!authorization?.startsWith("Bearer ")) {
      throw new RequestError("Sesi tidak valid.", 401);
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authorization.slice(7),
    );
    if (userError || !userData.user) throw new RequestError("Sesi tidak valid.", 401);

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 13_000_000) throw new RequestError("Gambar jadwal terlalu besar.", 413);

    const body = await request.json() as Record<string, unknown>;
    const eventId = readUuid(body.eventId, "Kegiatan tidak valid.");
    const month = readMonth(body.month);
    const imageBytes = decodePng(body.imageDataUrl);
    const customMessage = typeof body.message === "string" ? body.message.trim() : "";
    if (customMessage.length > 1000) throw new RequestError("Pesan terlalu panjang.", 400);

    const { data: eventGroup, error: eventError } = await supabaseAdmin
      .from("event_groups")
      .select("id, organization_id, name")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError || !eventGroup) throw new RequestError("Kegiatan tidak ditemukan.", 404);

    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", eventGroup.organization_id)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .in("role", ["owner", "coordinator"])
      .maybeSingle();
    if (!membership) throw new RequestError("Anda tidak memiliki izin untuk mengirim jadwal.", 403);

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("line_group_connections")
      .select("id, line_group_id, group_name")
      .eq("event_id", eventId)
      .eq("status", "active")
      .maybeSingle();
    if (connectionError || !connection) {
      throw new RequestError("Kegiatan ini belum terhubung ke grup LINE.", 409);
    }

    const objectPath = `${eventId}/${month}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, imageBytes, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(`Gambar tidak dapat diunggah: ${uploadError.message}`);

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 24 * 60 * 60);
    if (signedError || !signedData?.signedUrl) {
      await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
      throw new Error("Tautan gambar sementara tidak dapat dibuat.");
    }

    const now = new Date().toISOString();
    const occurrenceKey = `schedule-export:${month}:${crypto.randomUUID()}`;
    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("line_message_deliveries")
      .insert({
        event_id: eventId,
        line_group_connection_id: connection.id,
        occurrence_key: occurrenceKey,
        reminder_type: "schedule_export",
        scheduled_for: now,
        status: "processing",
        attempt_count: 1,
        updated_at: now,
      })
      .select("id")
      .single();
    if (deliveryError) {
      await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
      throw new Error(`Pengiriman tidak dapat dicatat: ${deliveryError.message}`);
    }

    const monthLabel = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00Z`));
    const text = customMessage || [
      "📅 Jadwal Pelayanan",
      "",
      eventGroup.name,
      monthLabel,
      "",
      "Silakan periksa jadwal pada gambar berikut.",
    ].join("\n");

    try {
      const response = await fetch(LINE_PUSH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": delivery.id,
        },
        body: JSON.stringify({
          to: connection.line_group_id,
          messages: [
            { type: "text", text },
            {
              type: "image",
              originalContentUrl: signedData.signedUrl,
              previewImageUrl: signedData.signedUrl,
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`LINE API ${response.status}: ${(await response.text()).slice(0, 1000)}`);
      }

      await supabaseAdmin.from("line_message_deliveries").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pengiriman LINE gagal.";
      await supabaseAdmin.from("line_message_deliveries").update({
        status: "failed",
        last_error: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.id);
      await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
      throw error;
    }

    return json({ ok: true, groupName: connection.group_name });
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("broadcast-line-schedule failed", error);
    return json({ error: error instanceof Error ? error.message : "Jadwal tidak dapat dikirim." }, 500);
  }
});

function decodePng(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value.startsWith("data:image/png;base64,")) {
    throw new RequestError("Data gambar PNG tidak valid.", 400);
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(value.slice("data:image/png;base64,".length));
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new RequestError("Data gambar PNG tidak valid.", 400);
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new RequestError("Gambar jadwal terlalu besar.", 413);
  }
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
    throw new RequestError("Berkas bukan gambar PNG yang valid.", 400);
  }
  return bytes;
}

function readUuid(value: unknown, message: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
    throw new RequestError(message, 400);
  }
  return value;
}

function readMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    throw new RequestError("Bulan jadwal tidak valid.", 400);
  }
  return value;
}

function getAdminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const map = JSON.parse(raw) as Record<string, string>;
    if (map.default) return Deno.env.get(map.default) ?? map.default;
  }
  throw new Error("Supabase admin key is unavailable.");
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
