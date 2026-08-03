const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateKeyPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function lastDateOfMonth(monthKey: string) {
  if (!monthKeyPattern.test(monthKey)) {
    throw new Error("Invalid month key.");
  }

  const [year, month] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

export function defaultUnavailabilityExpiry(monthKey: string) {
  if (!monthKeyPattern.test(monthKey)) {
    throw new Error("Invalid month key.");
  }

  const [year, month] = monthKey.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 15));
  return [
    previousMonth.getUTCFullYear(),
    String(previousMonth.getUTCMonth() + 1).padStart(2, "0"),
    "15",
  ].join("-");
}

export function isDateAfterExpiry(todayDateKey: string, expiresOn: string) {
  if (!dateKeyPattern.test(todayDateKey) || !dateKeyPattern.test(expiresOn)) {
    throw new Error("Invalid date key.");
  }

  return todayDateKey > expiresOn;
}
