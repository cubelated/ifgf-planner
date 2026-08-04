import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const GRACE_PERIOD_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const supabase = createClient(requireEnv("SUPABASE_URL"), getAdminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const lineAccessToken = requireEnv("LINE_CHANNEL_ACCESS_TOKEN");

type ReminderSetting = {
  event_id: string;
  reminder_minutes_before: number;
  arrival_minutes_before: number;
  custom_message: string | null;
  require_published_schedule: boolean;
};
type EventGroup = { id: string; organization_id: string; name: string };
type LineConnection = { id: string; event_id: string; line_group_id: string };
type Occurrence = { id: string; event_group_id: string; starts_at: string };
type FormBroadcast = {
  id: string;
  request_id: string;
  event_id: string;
  share_url: string;
  announce_at: string;
  reminder_at: string | null;
  announced_at: string | null;
  reminder_sent_at: string | null;
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const [eventReminders, formBroadcasts] = await Promise.all([
      processEventReminders(),
      processFormBroadcasts(),
    ]);
    return json({ ok: true, eventReminders, formBroadcasts });
  } catch (error) {
    console.error("send-line-reminders failed", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

async function processEventReminders() {
  const now = new Date();
  const { data: settingsData, error: settingsError } = await supabase
    .from("line_event_reminder_settings")
    .select("event_id, reminder_minutes_before, arrival_minutes_before, custom_message, require_published_schedule")
    .eq("enabled", true);
  if (settingsError) throw new Error(`Could not load reminder settings: ${settingsError.message}`);
  const settings = (settingsData ?? []) as ReminderSetting[];
  if (!settings.length) return { due: 0, sent: 0, failed: 0, skipped: 0 };

  const eventIds = settings.map((setting) => setting.event_id);
  const maxLead = Math.max(...settings.map((setting) => setting.reminder_minutes_before));
  const [eventsResult, connectionsResult, occurrencesResult] = await Promise.all([
    supabase.from("event_groups").select("id, organization_id, name").in("id", eventIds).eq("is_active", true),
    supabase.from("line_group_connections").select("id, event_id, line_group_id").in("event_id", eventIds).eq("status", "active"),
    supabase.from("event_occurrences").select("id, event_group_id, starts_at")
      .in("event_group_id", eventIds).eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", new Date(now.getTime() + maxLead * 60_000 + GRACE_PERIOD_MS).toISOString())
      .order("starts_at"),
  ]);
  const loadError = eventsResult.error || connectionsResult.error || occurrencesResult.error;
  if (loadError) throw new Error(`Could not load reminder data: ${loadError.message}`);

  const events = (eventsResult.data ?? []) as EventGroup[];
  const connections = (connectionsResult.data ?? []) as LineConnection[];
  const occurrences = (occurrencesResult.data ?? []) as Occurrence[];
  const organizationIds = [...new Set(events.map((event) => event.organization_id))];
  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations").select("id, timezone").in("id", organizationIds);
  if (organizationsError) throw new Error(`Could not load timezones: ${organizationsError.message}`);
  const timezoneByOrganization = new Map(
    (organizations ?? []).map((organization) => [organization.id, organization.timezone || "Asia/Taipei"]),
  );
  const eventById = new Map(events.map((event) => [event.id, event]));
  const connectionsByEvent = groupBy(connections, (connection) => connection.event_id);

  let due = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const setting of settings) {
    const event = eventById.get(setting.event_id);
    if (!event) continue;
    for (const occurrence of occurrences.filter((item) => item.event_group_id === event.id)) {
      const reminderAt = new Date(new Date(occurrence.starts_at).getTime() - setting.reminder_minutes_before * 60_000);
      const lateness = now.getTime() - reminderAt.getTime();
      if (lateness < 0 || lateness > GRACE_PERIOD_MS) continue;
      for (const connection of connectionsByEvent.get(event.id) ?? []) {
        due += 1;
        let deliveryId: string | null = null;
        try {
          const message = await buildEventMessage(setting, event, occurrence, timezoneByOrganization.get(event.organization_id) ?? "Asia/Taipei");
          if (!message) { skipped += 1; continue; }
          const delivery = await claimDelivery({
            eventId: event.id,
            connectionId: connection.id,
            occurrenceKey: occurrence.id,
            reminderType: `before_start:${setting.reminder_minutes_before}`,
            scheduledFor: reminderAt.toISOString(),
          });
          if (!delivery) { skipped += 1; continue; }
          deliveryId = delivery.id;
          await deliver(connection.line_group_id, [{ type: "text", text: message }], delivery.id);
          await markDeliverySent(delivery.id);
          sent += 1;
        } catch (error) {
          if (deliveryId) await markDeliveryFailed(deliveryId, error);
          console.error(`Event reminder failed for ${occurrence.id}`, error);
          failed += 1;
        }
      }
    }
  }
  return { due, sent, failed, skipped };
}

async function processFormBroadcasts() {
  const now = new Date();
  const { data, error } = await supabase.from("line_unavailability_broadcasts")
    .select("id, request_id, event_id, share_url, announce_at, reminder_at, announced_at, reminder_sent_at")
    .eq("status", "scheduled")
    .or(`announce_at.lte.${now.toISOString()},reminder_at.lte.${now.toISOString()}`);
  if (error) throw new Error(`Could not load form broadcasts: ${error.message}`);
  const broadcasts = (data ?? []) as FormBroadcast[];
  if (!broadcasts.length) return { due: 0, sent: 0, failed: 0, skipped: 0 };

  const requestIds = [...new Set(broadcasts.map((item) => item.request_id))];
  const eventIds = [...new Set(broadcasts.map((item) => item.event_id))];
  const [requestsResult, eventsResult, connectionsResult] = await Promise.all([
    supabase.from("unavailability_requests").select("id, request_month, expires_on, status, organization_id").in("id", requestIds),
    supabase.from("event_groups").select("id, organization_id, name").in("id", eventIds),
    supabase.from("line_group_connections").select("id, event_id, line_group_id").in("event_id", eventIds).eq("status", "active"),
  ]);
  const loadError = requestsResult.error || eventsResult.error || connectionsResult.error;
  if (loadError) throw new Error(`Could not prepare form broadcasts: ${loadError.message}`);
  const requests = new Map((requestsResult.data ?? []).map((item) => [item.id, item]));
  const events = new Map((eventsResult.data ?? []).map((item) => [item.id, item as EventGroup]));
  const connectionsByEvent = groupBy((connectionsResult.data ?? []) as LineConnection[], (item) => item.event_id);
  const organizationIds = [...new Set((eventsResult.data ?? []).map((item) => item.organization_id))];
  const { data: organizations } = await supabase.from("organizations").select("id, name, timezone").in("id", organizationIds);
  const organizationById = new Map((organizations ?? []).map((item) => [item.id, item]));

  let due = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const broadcast of broadcasts) {
    const request = requests.get(broadcast.request_id);
    const event = events.get(broadcast.event_id);
    if (!request || !event || request.organization_id !== event.organization_id) { skipped += 1; continue; }
    const organization = organizationById.get(event.organization_id);
    const timezone = organization?.timezone || "Asia/Taipei";
    const today = localDateKey(now, timezone);
    if (request.status !== "open" || today > request.expires_on) {
      await supabase.from("line_unavailability_broadcasts").update({ status: "cancelled", updated_at: now.toISOString() }).eq("id", broadcast.id);
      skipped += 1;
      continue;
    }

    const jobs: Array<{ type: "unavailability_announcement" | "unavailability_expiry"; scheduledFor: string }> = [];
    if (!broadcast.announced_at && new Date(broadcast.announce_at) <= now) {
      jobs.push({ type: "unavailability_announcement", scheduledFor: broadcast.announce_at });
    }
    if (broadcast.reminder_at && !broadcast.reminder_sent_at && new Date(broadcast.reminder_at) <= now) {
      jobs.push({ type: "unavailability_expiry", scheduledFor: broadcast.reminder_at });
    }

    let broadcastFailed = false;
    let announcementSent = Boolean(broadcast.announced_at);
    let reminderSent = Boolean(broadcast.reminder_sent_at);
    const eventConnections = connectionsByEvent.get(event.id) ?? [];
    if (jobs.length && !eventConnections.length) skipped += jobs.length;
    for (const job of jobs) {
      for (const connection of eventConnections) {
        due += 1;
        const delivery = await claimDelivery({
          eventId: event.id,
          connectionId: connection.id,
          occurrenceKey: `unavailability:${broadcast.id}`,
          reminderType: job.type,
          scheduledFor: job.scheduledFor,
        });
        if (!delivery) { skipped += 1; continue; }
        try {
          const monthLabel = formatMonth(request.request_month, timezone);
          const message = job.type === "unavailability_announcement"
            ? [
                "📝 Formulir Ketidakhadiran",
                "",
                `${organization?.name ?? "Pelayanan"} • ${monthLabel}`,
                `Mohon isi tanggal ketika Anda tidak dapat melayani sebelum ${formatDate(request.expires_on, timezone)}.`,
                "",
                broadcast.share_url,
              ].join("\n")
            : [
                "⏳ Pengingat Terakhir",
                "",
                `Hari ini adalah hari terakhir untuk mengisi formulir ketidakhadiran ${monthLabel}.`,
                "",
                broadcast.share_url,
              ].join("\n");
          await deliver(connection.line_group_id, [{ type: "text", text: message }], delivery.id);
          await markDeliverySent(delivery.id);
          const update = job.type === "unavailability_announcement"
            ? { announced_at: new Date().toISOString() }
            : { reminder_sent_at: new Date().toISOString() };
          await supabase.from("line_unavailability_broadcasts").update({ ...update, updated_at: new Date().toISOString() }).eq("id", broadcast.id);
          if (job.type === "unavailability_announcement") announcementSent = true;
          else reminderSent = true;
          sent += 1;
        } catch (error) {
          broadcastFailed = true;
          await markDeliveryFailed(delivery.id, error);
          console.error(`Form broadcast ${job.type} failed`, error);
          failed += 1;
        }
      }
    }

    if (announcementSent && (!broadcast.reminder_at || reminderSent) && !broadcastFailed) {
      const { error: deleteError } = await supabase
        .from("line_unavailability_broadcasts")
        .delete()
        .eq("id", broadcast.id);
      if (deleteError) {
        throw new Error(`Could not remove completed form broadcast: ${deleteError.message}`);
      }
    }
  }
  return { due, sent, failed, skipped };
}

async function buildEventMessage(setting: ReminderSetting, event: EventGroup, occurrence: Occurrence, timezone: string) {
  let query = supabase.from("assignments")
    .select("section_id, volunteer_id, status, schedule_version_id")
    .eq("occurrence_id", occurrence.id).neq("status", "declined");
  if (setting.require_published_schedule) query = query.not("schedule_version_id", "is", null);
  const { data: assignments, error } = await query;
  if (error) throw new Error(`Could not load assignments: ${error.message}`);
  if (!assignments?.length) return null;
  const sectionIds = [...new Set(assignments.map((item) => item.section_id))];
  const volunteerIds = [...new Set(assignments.map((item) => item.volunteer_id))];
  const [sectionsResult, volunteersResult] = await Promise.all([
    supabase.from("service_sections").select("id, name, sort_order").in("id", sectionIds),
    supabase.from("volunteers").select("id, full_name").in("id", volunteerIds),
  ]);
  const relatedError = sectionsResult.error || volunteersResult.error;
  if (relatedError) throw new Error(`Could not load names: ${relatedError.message}`);
  const sectionById = new Map((sectionsResult.data ?? []).map((item) => [item.id, item]));
  const volunteerById = new Map((volunteersResult.data ?? []).map((item) => [item.id, item.full_name]));
  const grouped = new Map<string, string[]>();
  for (const assignment of assignments) {
    const name = volunteerById.get(assignment.volunteer_id);
    if (!name) continue;
    grouped.set(assignment.section_id, [...(grouped.get(assignment.section_id) ?? []), name]);
  }
  const sectionLines = [...grouped.entries()]
    .sort(([left], [right]) => (sectionById.get(left)?.sort_order ?? 2147483647) - (sectionById.get(right)?.sort_order ?? 2147483647))
    .map(([sectionId, names]) => `${sectionById.get(sectionId)?.name ?? "Pelayanan"}: ${names.sort().join(", ")}`);
  if (!sectionLines.length) return null;
  const startsAt = new Date(occurrence.starts_at);
  return [
    "⏰ Pengingat Pelayanan",
    "",
    event.name,
    `${new Intl.DateTimeFormat("id-ID", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(startsAt)} • ${new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startsAt)}`,
    "",
    ...sectionLines,
    "",
    setting.arrival_minutes_before > 0 ? `Mohon hadir ${setting.arrival_minutes_before} menit lebih awal.` : null,
    setting.custom_message?.trim() || null,
  ].filter((line): line is string => line !== null).join("\n");
}

async function claimDelivery(input: { eventId: string; connectionId: string; occurrenceKey: string; reminderType: string; scheduledFor: string }) {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("line_message_deliveries").insert({
    event_id: input.eventId,
    line_group_connection_id: input.connectionId,
    occurrence_key: input.occurrenceKey,
    reminder_type: input.reminderType,
    scheduled_for: input.scheduledFor,
    status: "processing",
    attempt_count: 1,
    updated_at: now,
  }).select("id").single();
  if (!error) return data as { id: string };
  if (error.code !== "23505") throw new Error(`Could not claim delivery: ${error.message}`);
  const { data: existing, error: existingError } = await supabase.from("line_message_deliveries")
    .select("id, status, attempt_count, updated_at")
    .eq("line_group_connection_id", input.connectionId)
    .eq("occurrence_key", input.occurrenceKey)
    .eq("reminder_type", input.reminderType).maybeSingle();
  if (existingError) throw new Error(`Could not inspect delivery: ${existingError.message}`);
  if (!existing || existing.status !== "failed" || existing.attempt_count >= MAX_ATTEMPTS) return null;
  const { data: retried, error: retryError } = await supabase.from("line_message_deliveries").update({
    status: "processing",
    attempt_count: existing.attempt_count + 1,
    last_error: null,
    updated_at: now,
  }).eq("id", existing.id).eq("status", "failed").eq("attempt_count", existing.attempt_count)
    .eq("updated_at", existing.updated_at).select("id").maybeSingle();
  if (retryError) throw new Error(`Could not retry delivery: ${retryError.message}`);
  return retried as { id: string } | null;
}

async function deliver(groupId: string, messages: Array<Record<string, unknown>>, retryKey: string) {
  const response = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineAccessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({ to: groupId, messages }),
  });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${(await response.text()).slice(0, 1000)}`);
}

async function markDeliverySent(id: string) {
  const { error } = await supabase.from("line_message_deliveries").update({
    status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`Could not record sent delivery: ${error.message}`);
}

async function markDeliveryFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown LINE send error";
  await supabase.from("line_message_deliveries").update({
    status: "failed", last_error: message.slice(0, 2000), updated_at: new Date().toISOString(),
  }).eq("id", id);
}

function localDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatMonth(value: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: timezone, month: "long", year: "numeric" }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    result.set(key, [...(result.get(key) ?? []), value]);
  }
  return result;
}

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
