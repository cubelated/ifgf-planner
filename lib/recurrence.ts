export type OccurrenceDate = {
  startsAt: string;
  endsAt: string;
};

type RecurrenceInput = {
  weekday: number;
  startTime: string;
  durationMinutes: number;
  weekOccurrences: number[];
  timezone: string;
};

function localCalendarDate(timezone: string, value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: numberPart("year"),
    month: numberPart("month"),
    day: numberPart("day"),
  };
}

function parseMonthKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error("Bulan kegiatan tidak valid.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Bulan kegiatan tidak valid.");

  return { year, month };
}

function timezoneOffsetMilliseconds(timezone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    numberPart("year"),
    numberPart("month") - 1,
    numberPart("day"),
    numberPart("hour"),
    numberPart("minute"),
    numberPart("second"),
  );

  return wallClockAsUtc - instant.getTime();
}

function localDateTimeToUtc(
  timezone: string,
  date: { year: number; month: number; day: number },
  startTime: string,
) {
  const [hour, minute] = startTime.split(":").map(Number);
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let instant = new Date(wallClock);

  // A second pass handles dates on which the UTC offset changes for DST.
  for (let pass = 0; pass < 2; pass += 1) {
    instant = new Date(wallClock - timezoneOffsetMilliseconds(timezone, instant));
  }

  return instant;
}

function occurrenceForDate(
  input: RecurrenceInput,
  date: { year: number; month: number; day: number },
): OccurrenceDate | null {
  const calendarDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const weekOccurrence = Math.floor((date.day - 1) / 7) + 1;
  if (
    calendarDate.getUTCDay() !== input.weekday ||
    !input.weekOccurrences.includes(weekOccurrence)
  ) {
    return null;
  }

  const startsAt = localDateTimeToUtc(input.timezone, date, input.startTime);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

export function monthKeyInTimeZone(value: Date | string, timezone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const calendarDate = localCalendarDate(timezone, date);
  return `${calendarDate.year}-${String(calendarDate.month).padStart(2, "0")}`;
}

export function monthKeyAfter(monthKey: string, offset = 1) {
  const { year, month } = parseMonthKey(monthKey);
  const result = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function generateOccurrenceDatesForMonth(
  input: RecurrenceInput & { month: string; notBefore?: Date },
) {
  const { year, month } = parseMonthKey(input.month);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const results: OccurrenceDate[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const occurrence = occurrenceForDate(input, { year, month, day });
    if (!occurrence) continue;
    if (input.notBefore && new Date(occurrence.startsAt) < input.notBefore) continue;
    results.push(occurrence);
  }

  return results;
}

export function generateOccurrenceDates(input: RecurrenceInput & { count?: number }) {
  const results: OccurrenceDate[] = [];
  const now = new Date();
  const current = localCalendarDate(input.timezone, now);
  const cursor = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const limit = input.count ?? 20;

  for (let scanned = 0; scanned < 750 && results.length < limit; scanned += 1) {
    const occurrence = occurrenceForDate(input, {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    });
    if (occurrence && new Date(occurrence.startsAt) >= now) results.push(occurrence);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}
