export type PublicScheduleShare = {
  organizationName: string;
  eventName: string;
  month: string;
  timezone: string;
  occurrences: Array<{
    startsAt: string;
    endsAt: string;
    status: string;
  }>;
  sections: Array<{
    name: string;
    neededCount: number;
    volunteersByOccurrence: string[][];
  }>;
};

export function parsePublicScheduleShare(value: unknown): PublicScheduleShare | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.organizationName !== "string" ||
    typeof record.eventName !== "string" ||
    typeof record.month !== "string" ||
    typeof record.timezone !== "string" ||
    !Array.isArray(record.occurrences) ||
    !Array.isArray(record.sections)
  ) {
    return null;
  }

  const occurrences = record.occurrences.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const occurrence = candidate as Record<string, unknown>;
    if (
      typeof occurrence.startsAt !== "string" ||
      typeof occurrence.endsAt !== "string" ||
      typeof occurrence.status !== "string"
    ) {
      return [];
    }
    return [{
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      status: occurrence.status,
    }];
  });

  const sections = record.sections.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const section = candidate as Record<string, unknown>;
    if (
      typeof section.name !== "string" ||
      typeof section.neededCount !== "number" ||
      !Array.isArray(section.volunteersByOccurrence)
    ) {
      return [];
    }
    const volunteersByOccurrence = section.volunteersByOccurrence.map((names) =>
      Array.isArray(names)
        ? names.filter((name): name is string => typeof name === "string")
        : [],
    );
    return [{
      name: section.name,
      neededCount: section.neededCount,
      volunteersByOccurrence,
    }];
  });

  return {
    organizationName: record.organizationName,
    eventName: record.eventName,
    month: record.month,
    timezone: record.timezone,
    occurrences,
    sections,
  };
}
