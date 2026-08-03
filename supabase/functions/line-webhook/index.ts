import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const lineSecret = requireEnv("LINE_CHANNEL_SECRET");
const lineToken = requireEnv("LINE_CHANNEL_ACCESS_TOKEN");
const supabase = createClient(requireEnv("SUPABASE_URL"), getAdminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type LineEvent = {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type: "user" | "group" | "room"; groupId?: string };
  message?: { type: string; text?: string };
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const signature = request.headers.get("x-line-signature");
  if (!signature) return json({ error: "Missing LINE signature" }, 401);
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!await verifySignature(rawBody, signature)) {
    return json({ error: "Invalid LINE signature" }, 401);
  }

  let events: LineEvent[];
  try {
    const body = JSON.parse(new TextDecoder().decode(rawBody)) as { events?: LineEvent[] };
    events = body.events ?? [];
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const results = await Promise.allSettled(events.map(processEvent));
  const failures = results.filter((result) => result.status === "rejected");
  for (const failure of failures) console.error("LINE webhook event failed", failure);
  return failures.length ? json({ error: "One or more events failed" }, 500) : json({ ok: true });
});

async function processEvent(event: LineEvent) {
  if (event.webhookEventId && await wasProcessed(event.webhookEventId)) return;
  if (event.type === "join") await handleJoin(event);
  else if (event.type === "leave") await handleLeave(event);
  else if (event.type === "message") await handleMessage(event);
  if (event.webhookEventId) await recordProcessed(event);
}

async function handleJoin(event: LineEvent) {
  if (event.source?.type !== "group" || !event.replyToken) return;
  await reply(event.replyToken, [
    "👋 Bot IFGF Planner telah bergabung.",
    "",
    "Untuk menghubungkan grup ini ke kegiatan, kirim:",
    "/connect KODE-ANDA",
  ].join("\n"));
}

async function handleLeave(event: LineEvent) {
  if (!event.source?.groupId) return;
  const { error } = await supabase.from("line_group_connections")
    .update({ status: "inactive" })
    .eq("line_group_id", event.source.groupId);
  if (error) throw new Error(`Could not deactivate LINE group: ${error.message}`);
}

async function handleMessage(event: LineEvent) {
  if (
    event.source?.type !== "group" ||
    !event.source.groupId ||
    !event.replyToken ||
    event.message?.type !== "text"
  ) return;
  const text = event.message.text?.trim() ?? "";
  if (!text.toLowerCase().startsWith("/connect")) return;
  const match = text.match(/^\/connect\s+([A-Z0-9-]+)$/i);
  if (!match) {
    await reply(event.replyToken, "Gunakan format:\n/connect KODE-ANDA");
    return;
  }

  const now = new Date().toISOString();
  const { data: code, error: codeError } = await supabase
    .from("line_group_connection_codes")
    .update({ used_at: now })
    .eq("code_hash", await sha256(match[1].toUpperCase()))
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id, event_id")
    .maybeSingle();
  if (codeError) throw new Error(`Could not validate connection code: ${codeError.message}`);
  if (!code) {
    await reply(event.replyToken, "❌ Kode tidak valid, kedaluwarsa, atau sudah digunakan.");
    return;
  }

  const groupName = await getGroupName(event.source.groupId);
  const { error: connectionError } = await supabase.from("line_group_connections").upsert({
    event_id: code.event_id,
    line_group_id: event.source.groupId,
    group_name: groupName,
    status: "active",
    connected_at: now,
  }, { onConflict: "line_group_id" });
  if (connectionError) {
    await supabase.from("line_group_connection_codes").update({ used_at: null }).eq("id", code.id);
    throw new Error(`Could not save LINE group: ${connectionError.message}`);
  }
  await reply(event.replyToken, [
    "✅ Grup LINE berhasil dihubungkan.",
    groupName ? `Grup: ${groupName}` : "Pengingat sekarang dapat diatur dari IFGF Planner.",
  ].join("\n"));
}

async function getGroupName(groupId: string) {
  const response = await fetch(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`,
    { headers: { Authorization: `Bearer ${lineToken}` } },
  );
  if (!response.ok) return null;
  const data = await response.json() as { groupName?: string };
  return data.groupName ?? null;
}

async function reply(replyToken: string, text: string) {
  const response = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) throw new Error(`LINE reply ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

async function wasProcessed(id: string) {
  const { data, error } = await supabase.from("line_webhook_events")
    .select("webhook_event_id").eq("webhook_event_id", id).maybeSingle();
  if (error) throw new Error(`Could not inspect webhook event: ${error.message}`);
  return data !== null;
}

async function recordProcessed(event: LineEvent) {
  const { error } = await supabase.from("line_webhook_events").insert({
    webhook_event_id: event.webhookEventId,
    event_type: event.type,
    source_type: event.source?.type ?? null,
    processed_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") throw new Error(`Could not record webhook event: ${error.message}`);
}

async function verifySignature(body: Uint8Array, signature: string) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(lineSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, signatureBytes, body);
  } catch {
    return false;
  }
}

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
    headers: { "Content-Type": "application/json" },
  });
}
