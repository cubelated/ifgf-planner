export type ScheduleAppearance = {
  headerBackground: string;
  headerText: string;
  columnBackground: string;
  columnText: string;
  rowBackground: string;
  alternateRowBackground: string;
  alternateRows: boolean;
  paddingHorizontal: number;
  paddingVertical: number;
  hiddenSectionIds: string[];
  removeEmptyRowsOnExport: boolean;
};

export const SCHEDULE_TABLE_DESIGN = {
  gridColor: "#a6b8c5",
  dividerColor: "#6d8798",
  headerGridColor: "#92aabb",
  gridWidth: 1,
  dividerWidth: 2,
  exportFontSize: 18,
  exportLineHeight: 27,
} as const;

export const DEFAULT_SCHEDULE_APPEARANCE: ScheduleAppearance = {
  headerBackground: "#17364a",
  headerText: "#ffffff",
  columnBackground: "#f0f5f7",
  columnText: "#273844",
  rowBackground: "#ffffff",
  alternateRowBackground: "#f7fafb",
  alternateRows: true,
  paddingHorizontal: 16,
  paddingVertical: 12,
  hiddenSectionIds: [],
  removeEmptyRowsOnExport: false,
};

export function scheduleAppearanceStorageKey(
  organizationId: string,
  userId: string,
  eventId: string,
) {
  return `ifgf-planner:schedule-appearance:${organizationId}:${userId}:${eventId}`;
}

export function parseScheduleAppearance(value: unknown): ScheduleAppearance {
  const result = { ...DEFAULT_SCHEDULE_APPEARANCE, hiddenSectionIds: [] as string[] };
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const stored = value as Record<string, unknown>;
  const colors = [
    "headerBackground", "headerText", "columnBackground", "columnText",
    "rowBackground", "alternateRowBackground",
  ] as const;
  for (const key of colors) {
    if (typeof stored[key] === "string" && /^#[a-f\d]{6}$/i.test(stored[key])) {
      result[key] = stored[key];
    }
  }
  for (const key of ["paddingHorizontal", "paddingVertical"] as const) {
    const padding = stored[key];
    if (typeof padding === "number" && Number.isFinite(padding)) {
      result[key] = Math.max(0, Math.min(32, Math.round(padding)));
    }
  }
  for (const key of ["alternateRows", "removeEmptyRowsOnExport"] as const) {
    if (typeof stored[key] === "boolean") result[key] = stored[key];
  }
  if (Array.isArray(stored.hiddenSectionIds)) {
    result.hiddenSectionIds = [...new Set(
      stored.hiddenSectionIds.filter((id): id is string => typeof id === "string"),
    )];
  }
  return result;
}

export function scheduleRowBackground(appearance: ScheduleAppearance, rowIndex: number) {
  return appearance.alternateRows && rowIndex % 2 === 1
    ? appearance.alternateRowBackground
    : appearance.rowBackground;
}

export function selectScheduleExportRows<T extends { sectionId: string; hasAssignments: boolean }>(
  rows: T[],
  appearance: ScheduleAppearance,
) {
  return rows.filter((row) =>
    !appearance.hiddenSectionIds.includes(row.sectionId) &&
    (!appearance.removeEmptyRowsOnExport || row.hasAssignments),
  );
}
