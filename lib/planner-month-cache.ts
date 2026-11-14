/** Keep current/next month plus four recently visited months in session memory. */
export function retainPlannerMonths<T>(
  existing: Record<string, T>,
  month: string,
  value: T,
  pinned: string[],
): Record<string, T> {
  const next = { ...existing };
  delete next[month];
  next[month] = value;
  for (const key of Object.keys(next)) {
    if (Object.keys(next).length <= 6) break;
    if (!pinned.includes(key) && key !== month) delete next[key];
  }
  return next;
}

export function validatePlannerMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Bulan kegiatan tidak valid.");
  }
  return `${month}-01`;
}
