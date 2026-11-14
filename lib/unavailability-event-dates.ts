type EventDateForm = {
  eventDates: string[];
  volunteers: Array<{ id: string; eventDates: string[] }>;
};

export function allowedUnavailabilityDates(form: EventDateForm | null, volunteerId: string | null): string[] {
  if (!form) return [];
  return volunteerId === null
    ? form.eventDates
    : form.volunteers.find((volunteer) => volunteer.id === volunteerId)?.eventDates ?? [];
}

export function retainEligibleDates(selected: string[], allowed: string[]) {
  const eligible = new Set(allowed);
  return selected.filter((date) => eligible.has(date));
}

export function parseEventDates(value: unknown, month: string): string[] | null {
  if (!Array.isArray(value) || !value.every((date) => typeof date === "string"
    && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)
    && date.startsWith(`${month}-`)
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date)) return null;
  return [...new Set(value as string[])].sort();
}
