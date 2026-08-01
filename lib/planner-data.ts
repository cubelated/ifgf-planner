import type { User } from "@supabase/supabase-js";
import type { Tables } from "./database.types";
import {
  generateOccurrenceDatesForMonth,
  monthKeyInTimeZone,
} from "./recurrence";
import { getSupabaseBrowserClient } from "./supabase";

export { generateOccurrenceDates, monthKeyAfter, monthKeyInTimeZone } from "./recurrence";

export type Profile = Tables<"profiles">;
export type Organization = Tables<"organizations">;
export type OrganizationMember = Tables<"organization_members">;
export type ServiceSection = Tables<"service_sections">;
export type Volunteer = Tables<"volunteers">;
export type VolunteerEligibility = Tables<"volunteer_section_eligibility">;
export type EventGroup = Tables<"event_groups">;
export type EventGroupVolunteer = Tables<"event_group_volunteers">;
export type StaffingRequirement = Tables<"staffing_requirements">;
export type EventOccurrence = Tables<"event_occurrences">;
export type Unavailability = Tables<"unavailability">;
export type ScheduleVersion = Tables<"schedule_versions">;
export type Assignment = Tables<"assignments">;

export type PlannerData = {
  user: User;
  profile: Profile;
  organization: Organization;
  membership: OrganizationMember;
  currentVolunteer: Volunteer | null;
  sections: ServiceSection[];
  volunteers: Volunteer[];
  eligibilities: VolunteerEligibility[];
  events: EventGroup[];
  eventGroupVolunteers: EventGroupVolunteer[];
  requirements: StaffingRequirement[];
  occurrences: EventOccurrence[];
  unavailability: Unavailability[];
  assignments: Assignment[];
  scheduleVersions: ScheduleVersion[];
};

function fail(message: string, cause?: unknown): never {
  throw new Error(message, { cause });
}

export async function loadPlannerData(user: User): Promise<PlannerData> {
  const supabase = getSupabaseBrowserClient();
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) fail("Keanggotaan organisasi tidak dapat dimuat.", membershipError);
  if (!membership) {
    throw new Error(
      "Akun ini belum terhubung ke organisasi. Minta pemilik menambahkan Anda sebagai koordinator atau relawan.",
    );
  }

  const organizationId = membership.organization_id;
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 31);
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 550);

  const [profileResult, organizationResult, sectionsResult, volunteersResult, eventsResult, occurrencesResult, absencesResult, assignmentsResult, versionsResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("organizations").select("*").eq("id", organizationId).single(),
      supabase
        .from("service_sections")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order")
        .order("created_at")
        .order("id"),
      supabase.from("volunteers").select("*").eq("organization_id", organizationId).order("full_name"),
      supabase.from("event_groups").select("*").eq("organization_id", organizationId).order("name"),
      supabase
        .from("event_occurrences")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("starts_at", rangeStart.toISOString())
        .lte("starts_at", rangeEnd.toISOString())
        .order("starts_at"),
      supabase
        .from("unavailability")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("assignments")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at"),
      supabase
        .from("schedule_versions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

  const baseErrors = [
    profileResult.error,
    organizationResult.error,
    sectionsResult.error,
    volunteersResult.error,
    eventsResult.error,
    occurrencesResult.error,
    absencesResult.error,
    assignmentsResult.error,
    versionsResult.error,
  ].filter(Boolean);
  if (baseErrors.length) fail("Data perencana tidak dapat dimuat.", baseErrors[0]);

  const volunteers = volunteersResult.data ?? [];
  const events = eventsResult.data ?? [];
  const volunteerIds = volunteers.map((volunteer) => volunteer.id);
  const eventIds = events.map((event) => event.id);

  const [eligibilitiesResult, groupVolunteersResult, requirementsResult] = await Promise.all([
    volunteerIds.length
      ? supabase.from("volunteer_section_eligibility").select("*").in("volunteer_id", volunteerIds)
      : Promise.resolve({ data: [] as VolunteerEligibility[], error: null }),
    eventIds.length
      ? supabase.from("event_group_volunteers").select("*").in("event_group_id", eventIds)
      : Promise.resolve({ data: [] as EventGroupVolunteer[], error: null }),
    eventIds.length
      ? supabase.from("staffing_requirements").select("*").in("event_group_id", eventIds)
      : Promise.resolve({ data: [] as StaffingRequirement[], error: null }),
  ]);

  const relationError =
    eligibilitiesResult.error || groupVolunteersResult.error || requirementsResult.error;
  if (relationError) fail("Hubungan relawan dan kegiatan tidak dapat dimuat.", relationError);

  return {
    user,
    profile: profileResult.data,
    organization: organizationResult.data,
    membership,
    currentVolunteer: volunteers.find((volunteer) => volunteer.user_id === user.id) ?? null,
    sections: sectionsResult.data ?? [],
    volunteers,
    eligibilities: eligibilitiesResult.data ?? [],
    events,
    eventGroupVolunteers: groupVolunteersResult.data ?? [],
    requirements: requirementsResult.data ?? [],
    occurrences: occurrencesResult.data ?? [],
    unavailability: absencesResult.data ?? [],
    assignments: assignmentsResult.data ?? [],
    scheduleVersions: versionsResult.data ?? [],
  };
}

export async function createServiceSection(input: {
  organizationId: string;
  name: string;
  color?: string;
  sortOrder: number;
}) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("service_sections").insert({
    organization_id: input.organizationId,
    name: input.name.trim(),
    color: input.color ?? "blue",
    sort_order: input.sortOrder,
  });
  if (error) fail("Bagian pelayanan tidak dapat disimpan.", error);
}

export async function reorderServiceSections(input: {
  organizationId: string;
  sectionIds: string[];
}) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("reorder_service_sections", {
    target_organization_id: input.organizationId,
    ordered_section_ids: input.sectionIds,
  });
  if (error) fail("Urutan bagian pelayanan tidak dapat disimpan.", error);
}

export type SaveVolunteerInput = {
  id?: string;
  organizationId: string;
  fullName: string;
  email?: string;
  status: "active" | "resting" | "inactive";
  sectionIds: string[];
  eventGroupIds: string[];
};

export async function saveVolunteer(input: SaveVolunteerInput) {
  const supabase = getSupabaseBrowserClient();
  let volunteerId = input.id;
  let created = false;

  if (volunteerId) {
    const { error } = await supabase
      .from("volunteers")
      .update({
        full_name: input.fullName.trim(),
        email: input.email?.trim() || null,
        status: input.status,
      })
      .eq("id", volunteerId);
    if (error) fail("Relawan tidak dapat diperbarui.", error);
  } else {
    const { data, error } = await supabase
      .from("volunteers")
      .insert({
        organization_id: input.organizationId,
        full_name: input.fullName.trim(),
        email: input.email?.trim() || null,
        status: input.status,
      })
      .select("id")
      .single();
    if (error) fail("Relawan tidak dapat ditambahkan.", error);
    volunteerId = data.id;
    created = true;
  }

  try {
    const [eligibilityDelete, groupDelete] = await Promise.all([
      supabase.from("volunteer_section_eligibility").delete().eq("volunteer_id", volunteerId),
      supabase.from("event_group_volunteers").delete().eq("volunteer_id", volunteerId),
    ]);
    if (eligibilityDelete.error) throw eligibilityDelete.error;
    if (groupDelete.error) throw groupDelete.error;

    if (input.sectionIds.length) {
      const { error } = await supabase.from("volunteer_section_eligibility").insert(
        input.sectionIds.map((sectionId) => ({ volunteer_id: volunteerId, section_id: sectionId })),
      );
      if (error) throw error;
    }
    if (input.eventGroupIds.length) {
      const { error } = await supabase.from("event_group_volunteers").insert(
        input.eventGroupIds.map((eventGroupId) => ({
          volunteer_id: volunteerId,
          event_group_id: eventGroupId,
        })),
      );
      if (error) throw error;
    }
  } catch (error) {
    if (created && volunteerId) await supabase.from("volunteers").delete().eq("id", volunteerId);
    fail("Keahlian dan kegiatan relawan tidak dapat disimpan.", error);
  }
}

export type SaveEventGroupInput = {
  id?: string;
  existingEvent?: EventGroup;
  organizationId: string;
  userId: string;
  timezone: string;
  name: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  recurrencePattern: "every_week" | "weeks_1_3" | "weeks_2_4" | "except_5" | "custom";
  weekOccurrences: number[];
  requirements: Array<{ sectionId: string; neededCount: number }>;
};

export type CreateEventGroupInput = Omit<SaveEventGroupInput, "id" | "existingEvent">;

function validateEventGroupInput(input: SaveEventGroupInput) {
  const sectionIds = input.requirements.map((requirement) => requirement.sectionId);
  if (new Set(sectionIds).size !== sectionIds.length) {
    throw new Error("Setiap jenis pelayanan hanya boleh ditambahkan satu kali.");
  }
  if (input.requirements.some((requirement) => !Number.isInteger(requirement.neededCount) || requirement.neededCount < 1 || requirement.neededCount > 50)) {
    throw new Error("Jumlah relawan untuk setiap jenis pelayanan harus antara 1 dan 50.");
  }
}

function eventScheduleChanged(input: SaveEventGroupInput) {
  const existing = input.existingEvent;
  if (!existing) return false;
  const existingWeeks = [...existing.week_occurrences].sort().join(",");
  const nextWeeks = [...input.weekOccurrences].sort().join(",");
  return existing.weekday !== input.weekday
    || existing.start_time.slice(0, 5) !== input.startTime
    || existing.duration_minutes !== input.durationMinutes
    || existing.recurrence_pattern !== input.recurrencePattern
    || existingWeeks !== nextWeeks;
}

export async function createEventGroup(input: CreateEventGroupInput) {
  validateEventGroupInput(input);

  const supabase = getSupabaseBrowserClient();
  const { data: eventGroup, error } = await supabase
    .from("event_groups")
    .insert({
      organization_id: input.organizationId,
      created_by: input.userId,
      name: input.name.trim(),
      weekday: input.weekday,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      recurrence_pattern: input.recurrencePattern,
      week_occurrences: input.weekOccurrences,
    })
    .select("id")
    .single();
  if (error) fail("Kegiatan tidak dapat disimpan.", error);

  try {
    if (input.requirements.length) {
      const { error: requirementsError } = await supabase.from("staffing_requirements").insert(
        input.requirements.map((requirement) => ({
          event_group_id: eventGroup.id,
          section_id: requirement.sectionId,
          needed_count: requirement.neededCount,
        })),
      );
      if (requirementsError) throw requirementsError;
    }

    const generated = generateOccurrenceDatesForMonth({
      weekday: input.weekday,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      weekOccurrences: input.weekOccurrences,
      timezone: input.timezone,
      month: monthKeyInTimeZone(new Date(), input.timezone),
      notBefore: new Date(),
    });
    if (generated.length) {
      const { error: occurrencesError } = await supabase.from("event_occurrences").insert(
        generated.map((occurrence) => ({
          organization_id: input.organizationId,
          event_group_id: eventGroup.id,
          starts_at: occurrence.startsAt,
          ends_at: occurrence.endsAt,
        })),
      );
      if (occurrencesError) throw occurrencesError;
    }
  } catch (relatedError) {
    await supabase.from("event_groups").delete().eq("id", eventGroup.id);
    fail("Tanggal dan kebutuhan kegiatan tidak dapat dibuat.", relatedError);
  }
}

export async function updateEventGroup(input: SaveEventGroupInput & { id: string; existingEvent: EventGroup }) {
  validateEventGroupInput(input);
  const supabase = getSupabaseBrowserClient();
  const scheduleChanged = eventScheduleChanged(input);

  const [occurrencesResult, requirementsResult] = await Promise.all([
    supabase.from("event_occurrences").select("id, starts_at").eq("event_group_id", input.id),
    supabase.from("staffing_requirements").select("section_id").eq("event_group_id", input.id),
  ]);
  if (occurrencesResult.error || requirementsResult.error) {
    fail("Data kegiatan saat ini tidak dapat diperiksa.", occurrencesResult.error ?? requirementsResult.error);
  }

  const occurrences = occurrencesResult.data ?? [];
  const occurrenceIds = occurrences.map((occurrence) => occurrence.id);
  const futureOccurrenceIds = occurrences
    .filter((occurrence) => new Date(occurrence.starts_at) >= new Date())
    .map((occurrence) => occurrence.id);
  const nextSectionIds = new Set(input.requirements.map((requirement) => requirement.sectionId));
  const removedSectionIds = (requirementsResult.data ?? [])
    .map((requirement) => requirement.section_id)
    .filter((sectionId) => !nextSectionIds.has(sectionId));

  if (scheduleChanged && futureOccurrenceIds.length) {
    const [assignmentResult, absenceResult] = await Promise.all([
      supabase.from("assignments").select("id").in("occurrence_id", futureOccurrenceIds).limit(1),
      supabase.from("unavailability").select("id").in("occurrence_id", futureOccurrenceIds).limit(1),
    ]);
    if (assignmentResult.error || absenceResult.error) {
      fail("Jadwal mendatang tidak dapat diperiksa.", assignmentResult.error ?? absenceResult.error);
    }
    if (assignmentResult.data?.length || absenceResult.data?.length) {
      throw new Error(
        "Hari, waktu, atau pola belum dapat diubah karena sudah ada penugasan atau ketidakhadiran pada tanggal mendatang. Hapus data tersebut terlebih dahulu.",
      );
    }
  }

  if (removedSectionIds.length && occurrenceIds.length) {
    const { data: assignedRemovedSections, error } = await supabase
      .from("assignments")
      .select("id")
      .in("occurrence_id", occurrenceIds)
      .in("section_id", removedSectionIds)
      .limit(1);
    if (error) fail("Penugasan untuk kebutuhan kegiatan tidak dapat diperiksa.", error);
    if (assignedRemovedSections?.length) {
      throw new Error(
        "Jenis pelayanan yang sudah memiliki penugasan tidak dapat dihapus. Hapus penugasannya terlebih dahulu.",
      );
    }
  }

  const { error: updateError } = await supabase
    .from("event_groups")
    .update({
      name: input.name.trim(),
      weekday: input.weekday,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      recurrence_pattern: input.recurrencePattern,
      week_occurrences: input.weekOccurrences,
    })
    .eq("id", input.id);
  if (updateError) fail("Kegiatan tidak dapat diperbarui.", updateError);

  if (removedSectionIds.length) {
    const { error } = await supabase
      .from("staffing_requirements")
      .delete()
      .eq("event_group_id", input.id)
      .in("section_id", removedSectionIds);
    if (error) fail("Kebutuhan pelayanan yang dihapus tidak dapat disimpan.", error);
  }

  if (input.requirements.length) {
    const { error } = await supabase.from("staffing_requirements").upsert(
      input.requirements.map((requirement) => ({
        event_group_id: input.id,
        section_id: requirement.sectionId,
        needed_count: requirement.neededCount,
      })),
      { onConflict: "event_group_id,section_id" },
    );
    if (error) fail("Kebutuhan pelayanan tidak dapat diperbarui.", error);
  }

  if (scheduleChanged) {
    const now = new Date().toISOString();
    const generatedMonths = Array.from(new Set(
      occurrences
        .filter((occurrence) => new Date(occurrence.starts_at) >= new Date(now))
        .map((occurrence) => monthKeyInTimeZone(occurrence.starts_at, input.timezone)),
    ));
    if (!generatedMonths.length) {
      generatedMonths.push(monthKeyInTimeZone(new Date(), input.timezone));
    }
    const { error: deleteError } = await supabase
      .from("event_occurrences")
      .delete()
      .eq("event_group_id", input.id)
      .gte("starts_at", now);
    if (deleteError) fail("Tanggal lama kegiatan tidak dapat diperbarui.", deleteError);

    const generated = generatedMonths.flatMap((month) =>
      generateOccurrenceDatesForMonth({
        weekday: input.weekday,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        weekOccurrences: input.weekOccurrences,
        timezone: input.timezone,
        month,
        notBefore: new Date(now),
      }),
    );
    if (generated.length) {
      const { error: occurrenceError } = await supabase.from("event_occurrences").insert(
        generated.map((occurrence) => ({
          organization_id: input.organizationId,
          event_group_id: input.id,
          starts_at: occurrence.startsAt,
          ends_at: occurrence.endsAt,
        })),
      );
      if (occurrenceError) fail("Tanggal baru kegiatan tidak dapat dibuat.", occurrenceError);
    }
  }
}

export async function saveEventGroup(input: SaveEventGroupInput) {
  if (input.id && input.existingEvent) {
    return updateEventGroup({ ...input, id: input.id, existingEvent: input.existingEvent });
  }
  return createEventGroup(input);
}

export async function generateEventMonth(input: {
  organizationId: string;
  event: EventGroup;
  timezone: string;
  month: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const currentMonth = monthKeyInTimeZone(new Date(), input.timezone);
  const generated = generateOccurrenceDatesForMonth({
    weekday: input.event.weekday,
    startTime: input.event.start_time.slice(0, 5),
    durationMinutes: input.event.duration_minutes,
    weekOccurrences: input.event.week_occurrences,
    timezone: input.timezone,
    month: input.month,
    notBefore: input.month === currentMonth ? new Date() : undefined,
  });

  if (!generated.length) return 0;

  const { error } = await supabase.from("event_occurrences").upsert(
    generated.map((occurrence) => ({
      organization_id: input.organizationId,
      event_group_id: input.event.id,
      starts_at: occurrence.startsAt,
      ends_at: occurrence.endsAt,
    })),
    { onConflict: "event_group_id,starts_at", ignoreDuplicates: true },
  );
  if (error) fail("Tanggal kegiatan untuk bulan berikutnya tidak dapat dibuat.", error);
  return generated.length;
}

export type EventDeletionImpact = {
  occurrences: number;
  assignments: number;
  unavailability: number;
};

export async function getEventDeletionImpact(eventGroupId: string): Promise<EventDeletionImpact> {
  const supabase = getSupabaseBrowserClient();
  const { data: occurrences, error: occurrenceError } = await supabase
    .from("event_occurrences")
    .select("id")
    .eq("event_group_id", eventGroupId);
  if (occurrenceError) fail("Dampak penghapusan kegiatan tidak dapat diperiksa.", occurrenceError);

  const occurrenceIds = (occurrences ?? []).map((occurrence) => occurrence.id);
  if (!occurrenceIds.length) {
    return { occurrences: 0, assignments: 0, unavailability: 0 };
  }

  const [assignmentsResult, unavailabilityResult] = await Promise.all([
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .in("occurrence_id", occurrenceIds),
    supabase
      .from("unavailability")
      .select("id", { count: "exact", head: true })
      .in("occurrence_id", occurrenceIds),
  ]);
  if (assignmentsResult.error || unavailabilityResult.error) {
    fail(
      "Dampak penugasan dan ketidakhadiran tidak dapat diperiksa.",
      assignmentsResult.error ?? unavailabilityResult.error,
    );
  }

  return {
    occurrences: occurrenceIds.length,
    assignments: assignmentsResult.count ?? 0,
    unavailability: unavailabilityResult.count ?? 0,
  };
}

export async function deleteEventGroup(eventGroupId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("event_groups")
    .delete()
    .eq("id", eventGroupId)
    .select("id")
    .maybeSingle();
  if (error) fail("Kegiatan tidak dapat dihapus.", error);
  if (!data) throw new Error("Kegiatan tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.");
}

export async function submitUnavailability(input: {
  organizationId: string;
  volunteerId: string;
  occurrences: EventOccurrence[];
  reason?: string;
}) {
  if (!input.occurrences.length) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("unavailability").upsert(
    input.occurrences.map((occurrence) => ({
      organization_id: input.organizationId,
      volunteer_id: input.volunteerId,
      occurrence_id: occurrence.id,
      unavailable_date: occurrence.starts_at.slice(0, 10),
      reason: input.reason?.trim() || null,
    })),
    { onConflict: "volunteer_id,occurrence_id" },
  );
  if (error) fail("Ketidakhadiran tidak dapat disimpan.", error);
}

export async function assignVolunteer(input: {
  organizationId: string;
  eventGroupId: string;
  occurrenceId: string;
  sectionId: string;
  volunteerId: string;
  addToEventGroup?: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  if (input.addToEventGroup) {
    const { error: membershipError } = await supabase.from("event_group_volunteers").upsert(
      {
        event_group_id: input.eventGroupId,
        volunteer_id: input.volunteerId,
      },
      { onConflict: "event_group_id,volunteer_id", ignoreDuplicates: true },
    );
    if (membershipError) fail("Relawan tidak dapat ditambahkan ke kegiatan ini.", membershipError);
  }
  const { error } = await supabase.from("assignments").insert({
    organization_id: input.organizationId,
    occurrence_id: input.occurrenceId,
    section_id: input.sectionId,
    volunteer_id: input.volunteerId,
  });
  if (error) fail("Relawan tidak dapat ditugaskan pada posisi ini.", error);
}

export async function removeAssignment(assignmentId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
  if (error) fail("Penugasan tidak dapat dihapus.", error);
}

export async function publishSchedule(input: {
  organizationId: string;
  userId: string;
  occurrences: EventOccurrence[];
}) {
  if (!input.occurrences.length) throw new Error("Belum ada kegiatan yang dapat diterbitkan.");
  const supabase = getSupabaseBrowserClient();
  const dates = input.occurrences.map((occurrence) => occurrence.starts_at.slice(0, 10)).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];
  const { data: version, error } = await supabase
    .from("schedule_versions")
    .upsert(
      {
        organization_id: input.organizationId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "published",
        published_at: new Date().toISOString(),
        created_by: input.userId,
      },
      { onConflict: "organization_id,period_start,period_end" },
    )
    .select("id")
    .single();
  if (error) fail("Jadwal tidak dapat diterbitkan.", error);

  const occurrenceIds = input.occurrences.map((occurrence) => occurrence.id);
  const { error: assignmentError } = await supabase
    .from("assignments")
    .update({ schedule_version_id: version.id })
    .in("occurrence_id", occurrenceIds);
  if (assignmentError) fail("Penugasan tidak dapat ditautkan ke jadwal terbit.", assignmentError);
}
