import {
  EventOccurrence,
  createPublicShareToken,
  createScheduleShare,
  generateEventMonth,
  monthKeyAfter,
  monthKeyInTimeZone,
  PlannerData,
  ServiceSection,
} from "@/lib/planner-data";
import { useEffect, useState } from "react";
import {
  assignmentsFor,
  coverageFor,
  EmptyState,
  formatDate,
  formatMonthKey,
  formatShortDate,
  PageHeader,
  requirementsFor,
  StatusPill,
} from "../planner-app";
import { SheetData } from "write-excel-file/browser";
import {
  LoaderCircle,
  Download,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Plus,
  Share2,
  CalendarDays,
  Users,
} from "lucide-react";

type ScheduleExportFormat = "xlsx" | "csv" | "png" | "png-line";

type ScheduleExportRow = {
  volunteerType: string;
  volunteerNames: string[];
};

type StoredScheduleFilters = {
  eventGroupId: string;
  month: string;
};

const SCHEDULE_FILTERS_STORAGE_PREFIX = "ifgf-planner:schedule-filters";

function scheduleFiltersStorageKey(organizationId: string, userId: string) {
  return `${SCHEDULE_FILTERS_STORAGE_PREFIX}:${organizationId}:${userId}`;
}

function readStoredScheduleFilters(
  organizationId: string,
  userId: string,
): StoredScheduleFilters | null {
  try {
    const value = window.localStorage.getItem(
      scheduleFiltersStorageKey(organizationId, userId),
    );
    if (!value) return null;
    const filters = JSON.parse(value) as Partial<StoredScheduleFilters>;
    if (
      typeof filters.eventGroupId !== "string" ||
      typeof filters.month !== "string" ||
      !/^\d{4}-\d{2}$/.test(filters.month)
    ) {
      return null;
    }
    return {
      eventGroupId: filters.eventGroupId,
      month: filters.month,
    };
  } catch {
    return null;
  }
}

function safeExportFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "jadwal";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gambar jadwal tidak dapat dibaca."));
    reader.readAsDataURL(blob);
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createScheduleCsv(
  eventName: string,
  month: string,
  dates: string[],
  rows: ScheduleExportRow[],
) {
  return [
    [eventName],
    [`Jadwal pelayanan • ${month}`],
    [],
    ["Jenis pelayan", ...dates],
    ...rows.map((row) => [row.volunteerType, ...row.volunteerNames]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

function defaultScheduleMonth(data: PlannerData, eventGroupId: string) {
  const currentMonth = monthKeyInTimeZone(
    new Date(),
    data.organization.timezone,
  );
  const eventMonths = Array.from(
    new Set(
      data.occurrences
        .filter((occurrence) => occurrence.event_group_id === eventGroupId)
        .map((occurrence) =>
          monthKeyInTimeZone(occurrence.starts_at, data.organization.timezone),
        ),
    ),
  ).sort();
  return (
    eventMonths.find((month) => month >= currentMonth) ??
    eventMonths.at(-1) ??
    currentMonth
  );
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function createScheduleImage(
  eventName: string,
  month: string,
  dates: string[],
  rows: ScheduleExportRow[],
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Browser tidak mendukung pembuatan gambar jadwal.");

  const horizontalPadding = 48;
  const columnWidths = [300, ...dates.map(() => 280)];
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
  const canvasWidth = Math.max(1_000, tableWidth + horizontalPadding * 2);
  const tableTop = 142;
  const lineHeight = 24;
  const cellPadding = 16;

  canvas.width = canvasWidth;
  context.font = "500 18px Arial, sans-serif";
  const headerLines = ["Jenis pelayan", ...dates].map((value, index) =>
    wrapCanvasText(context, value, columnWidths[index] - cellPadding * 2),
  );
  const headerHeight = Math.max(
    58,
    Math.max(...headerLines.map((lines) => lines.length)) * lineHeight +
      cellPadding * 2,
  );
  const rowLayouts = rows.map((row) => {
    const values = [row.volunteerType, ...row.volunteerNames];
    const lines = values.map((value, index) =>
      wrapCanvasText(context, value, columnWidths[index] - cellPadding * 2),
    );
    const height = Math.max(
      58,
      Math.max(...lines.map((item) => item.length)) * lineHeight +
        cellPadding * 2,
    );
    return { lines, height };
  });

  canvas.height = Math.max(
    360,
    tableTop +
      headerHeight +
      rowLayouts.reduce((total, row) => total + row.height, 0) +
      48,
  );

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#17364a";
  context.font = "700 34px Arial, sans-serif";
  context.fillText(eventName, horizontalPadding, 58, tableWidth);
  context.fillStyle = "#60727e";
  context.font = "500 18px Arial, sans-serif";
  context.fillText(
    `Jadwal pelayanan • ${month}`,
    horizontalPadding,
    94,
    tableWidth,
  );

  const drawCell = (
    lines: string[],
    x: number,
    y: number,
    width: number,
    height: number,
    options: { background: string; color: string; bold?: boolean },
  ) => {
    context.fillStyle = options.background;
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#dce4e8";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    context.fillStyle = options.color;
    context.font = `${options.bold ? "700" : "500"} 18px Arial, sans-serif`;
    lines.forEach((line, index) => {
      context.fillText(
        line,
        x + cellPadding,
        y + cellPadding + 18 + index * lineHeight,
        width - cellPadding * 2,
      );
    });
  };

  let x = horizontalPadding;
  headerLines.forEach((lines, index) => {
    drawCell(lines, x, tableTop, columnWidths[index], headerHeight, {
      background: "#17364a",
      color: "#ffffff",
      bold: true,
    });
    x += columnWidths[index];
  });

  let y = tableTop + headerHeight;
  rowLayouts.forEach((row, rowIndex) => {
    let cellX = horizontalPadding;
    row.lines.forEach((lines, columnIndex) => {
      drawCell(lines, cellX, y, columnWidths[columnIndex], row.height, {
        background: rowIndex % 2 === 0 ? "#ffffff" : "#f7fafb",
        color: columnIndex === 0 ? "#273844" : "#31596e",
        bold: columnIndex === 0,
      });
      cellX += columnWidths[columnIndex];
    });
    y += row.height;
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gambar jadwal tidak dapat dibuat."));
    }, "image/png");
  });
}

export default function Schedule({
  data,
  userId,
  canManage,
  onAssign,
  onChanged,
  showToast,
}: {
  data: PlannerData;
  userId: string;
  canManage: boolean;
  onAssign: (target: {
    occurrence: EventOccurrence;
    section: ServiceSection;
  }) => void;
  onChanged: (message: string) => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState<ScheduleExportFormat | null>(null);
  const initialEventId = data.events[0]?.id ?? "";
  const [eventFilter, setEventFilter] = useState(initialEventId);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    defaultScheduleMonth(data, initialEventId),
  );
  const [filtersRestored, setFiltersRestored] = useState(false);
  const [generating, setGenerating] = useState(false);
  const selectedEvent =
    data.events.find((event) => event.id === eventFilter) ?? null;
  const eventOccurrences = data.occurrences.filter(
    (occurrence) => occurrence.event_group_id === eventFilter,
  );
  const availableMonths = Array.from(
    new Set([
      ...eventOccurrences.map((occurrence) =>
        monthKeyInTimeZone(occurrence.starts_at, data.organization.timezone),
      ),
      selectedMonth,
    ]),
  ).sort();
  const occurrences = eventOccurrences.filter(
    (occurrence) =>
      monthKeyInTimeZone(occurrence.starts_at, data.organization.timezone) ===
      selectedMonth,
  );
  const sectionIds = new Set(
    occurrences.flatMap((occurrence) =>
      requirementsFor(data, occurrence).map(
        (requirement) => requirement.section_id,
      ),
    ),
  );
  const sections = data.sections.filter((section) =>
    sectionIds.has(section.id),
  );
  const exportDates = occurrences.map((occurrence) =>
    formatDate(occurrence.starts_at, data.organization.timezone, {
      weekday: "long",
    }),
  );
  const exportRows: ScheduleExportRow[] = sections.map((section) => ({
    volunteerType: section.name,
    volunteerNames: occurrences.map((occurrence) => {
      const requirement = requirementsFor(data, occurrence).find(
        (item) => item.section_id === section.id,
      );
      if (!requirement) return "—";
      const volunteerNames = assignmentsFor(data, occurrence.id, section.id)
        .map(
          (assignment) =>
            data.volunteers.find(
              (volunteer) => volunteer.id === assignment.volunteer_id,
            )?.full_name,
        )
        .filter((name): name is string => Boolean(name));
      return volunteerNames.join(", ") || "Belum ditugaskan";
    }),
  }));

  useEffect(() => {
    const stored = readStoredScheduleFilters(data.organization.id, userId);
    const restoredEventId = data.events.some(
      (event) => event.id === stored?.eventGroupId,
    )
      ? stored!.eventGroupId
      : initialEventId;
    const restoredMonth =
      stored?.eventGroupId === restoredEventId
        ? stored.month
        : defaultScheduleMonth(data, restoredEventId);
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      setEventFilter(restoredEventId);
      setSelectedMonth(restoredMonth);
      setFiltersRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data, initialEventId, userId]);

  useEffect(() => {
    if (!filtersRestored) return;
    try {
      window.localStorage.setItem(
        scheduleFiltersStorageKey(data.organization.id, userId),
        JSON.stringify({ eventGroupId: eventFilter, month: selectedMonth }),
      );
    } catch {
      // The schedule remains usable when browser storage is unavailable.
    }
  }, [
    data.organization.id,
    eventFilter,
    filtersRestored,
    selectedMonth,
    userId,
  ]);

  function selectEvent(eventGroupId: string) {
    setEventFilter(eventGroupId);
    setSelectedMonth(defaultScheduleMonth(data, eventGroupId));
  }

  async function handleShare() {
    if (!selectedEvent) return;
    setSharing(true);
    try {
      const token = createPublicShareToken();
      await createScheduleShare({
        organizationId: data.organization.id,
        eventGroupId: selectedEvent.id,
        month: selectedMonth,
        token,
      });
      const link = `${window.location.origin}/schedule-share#token=${encodeURIComponent(token)}`;
      const shareData = {
        title: `${selectedEvent.name} • ${formatMonthKey(selectedMonth)}`,
        text: `Jadwal pelayanan ${selectedEvent.name} untuk ${formatMonthKey(selectedMonth)}.`,
        url: link,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          showToast("Tautan jadwal berhasil dibagikan.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }

      if (!navigator.clipboard) {
        throw new Error("Browser tidak mendukung berbagi atau menyalin tautan.");
      }
      await navigator.clipboard.writeText(link);
      showToast("Tautan jadwal dibuat dan disalin.");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Tautan jadwal tidak dapat dibuat.",
      );
    } finally {
      setSharing(false);
    }
  }

  async function handleAddMonth() {
    if (!selectedEvent) return;
    const latestMonth = availableMonths.at(-1) ?? selectedMonth;
    const nextMonth = monthKeyAfter(latestMonth);
    setGenerating(true);
    try {
      const generatedCount = await generateEventMonth({
        organizationId: data.organization.id,
        event: selectedEvent,
        timezone: data.organization.timezone,
        month: nextMonth,
      });
      setSelectedMonth(nextMonth);
      await onChanged(
        generatedCount
          ? `${generatedCount} tanggal ${formatMonthKey(nextMonth)} berhasil dibuat.`
          : `${formatMonthKey(nextMonth)} tidak memiliki tanggal yang sesuai dengan pola kegiatan.`,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Bulan jadwal berikutnya tidak dapat dibuat.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleExport(format: ScheduleExportFormat) {
    if (!selectedEvent || !exportRows.length) return;
    setExporting(format);
    const monthLabel = formatMonthKey(selectedMonth);
    const fileName = `jadwal-${safeExportFileName(selectedEvent.name)}-${selectedMonth}`;
    try {
      if (format === "csv") {
        const csv = createScheduleCsv(
          selectedEvent.name,
          monthLabel,
          exportDates,
          exportRows,
        );
        downloadBlob(
          new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
          `${fileName}.csv`,
        );
      } else if (format === "png" || format === "png-line") {
        const image = await createScheduleImage(
          selectedEvent.name,
          monthLabel,
          exportDates,
          exportRows,
        );
        downloadBlob(image, `${fileName}.png`);
        if (format === "png-line") {
          if (image.size > 9_500_000) {
            throw new Error("Gambar melebihi 9,5 MB dan tidak dapat dikirim ke LINE.");
          }
          const { error } = await (await import("@/lib/supabase"))
            .getSupabaseBrowserClient()
            .functions.invoke("broadcast-line-schedule", {
              body: {
                eventId: selectedEvent.id,
                month: selectedMonth,
                imageDataUrl: await blobToDataUrl(image),
              },
            });
          if (error) throw new Error("Jadwal berhasil diekspor, tetapi tidak dapat dikirim ke LINE.", { cause: error });
        }
      } else {
        const { default: writeExcelFile } =
          await import("write-excel-file/browser");
        const headingStyle = {
          fontWeight: "bold" as const,
          backgroundColor: "#17364A",
          textColor: "#FFFFFF",
          alignVertical: "center" as const,
          height: 30,
        };
        const columnCount = exportDates.length + 1;
        const emptyCells = exportDates.map(() => null);
        const sheetData: SheetData = [
          [
            {
              value: selectedEvent.name,
              columnSpan: columnCount,
              fontSize: 18,
              fontWeight: "bold",
              textColor: "#17364A",
              height: 34,
            },
            ...emptyCells,
          ],
          [
            {
              value: `Jadwal pelayanan • ${monthLabel}`,
              columnSpan: columnCount,
              textColor: "#60727E",
              height: 24,
            },
            ...emptyCells,
          ],
          [null, ...emptyCells],
          [
            { value: "Jenis pelayan", ...headingStyle },
            ...exportDates.map((date) => ({
              value: date,
              wrap: true,
              ...headingStyle,
            })),
          ],
          ...exportRows.map((row) => [
            {
              value: row.volunteerType,
              wrap: true,
              fontWeight: "bold" as const,
              alignVertical: "top" as const,
              height: 38,
              borderColor: "#DCE4E8",
              borderStyle: "thin" as const,
            },
            ...row.volunteerNames.map((names) => ({
              value: names,
              wrap: true,
              alignVertical: "top" as const,
              textColor: "#31596E",
              borderColor: "#DCE4E8",
              borderStyle: "thin" as const,
            })),
          ]),
        ];
        const sheetName =
          selectedEvent.name
            .replace(/[\\/*?:[\]]/g, " ")
            .trim()
            .slice(0, 31) || "Jadwal";
        await writeExcelFile(sheetData, {
          sheet: sheetName,
          columns: [{ width: 24 }, ...exportDates.map(() => ({ width: 32 }))],
          stickyRowsCount: 4,
          stickyColumnsCount: 1,
          showGridLines: false,
        }).toFile(`${fileName}.xlsx`);
      }
      showToast(
        format === "png-line"
          ? "Gambar jadwal berhasil diunduh dan dikirim ke grup LINE."
          : `Jadwal ${format.toUpperCase()} berhasil diunduh.`,
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Jadwal tidak dapat diekspor.",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Jadwal pelayanan"
        description="Pilih satu kegiatan dan kelola penugasan satu bulan pada satu waktu."
        actions={
          <>
            <details className="export-menu">
              <summary
                className="button button-secondary"
                aria-disabled={!exportRows.length || Boolean(exporting)}
              >
                {exporting ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Download size={17} />
                )}{" "}
                Ekspor
              </summary>
              <div className="export-options" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!exportRows.length || Boolean(exporting)}
                  onClick={(event) => {
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                    void handleExport("xlsx");
                  }}
                >
                  <FileSpreadsheet size={18} />
                  <span>
                    <strong>Excel</strong>
                    <small>.xlsx</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!exportRows.length || Boolean(exporting)}
                  onClick={(event) => {
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                    void handleExport("csv");
                  }}
                >
                  <FileText size={18} />
                  <span>
                    <strong>CSV</strong>
                    <small>.csv</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!exportRows.length || Boolean(exporting)}
                  onClick={(event) => {
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                    void handleExport("png");
                  }}
                >
                  <ImageIcon size={18} />
                  <span>
                    <strong>Gambar</strong>
                    <small>.png</small>
                  </span>
                </button>
                {canManage && data.lineConnections.some(
                  (connection) => connection.event_id === selectedEvent?.id,
                ) ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!exportRows.length || Boolean(exporting)}
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      void handleExport("png-line");
                    }}
                  >
                    <Share2 size={18} />
                    <span>
                      <strong>Gambar + LINE</strong>
                      <small>Unduh dan broadcast</small>
                    </span>
                  </button>
                ) : null}
              </div>
            </details>
            {canManage ? (
              <button
                className="button button-primary"
                type="button"
                disabled={!selectedEvent || sharing}
                onClick={handleShare}
              >
                {sharing ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Share2 size={17} />
                )}{" "}
                {sharing ? "Membuat tautan..." : "Bagikan jadwal"}
              </button>
            ) : null}
          </>
        }
      />
      <div className="schedule-toolbar card">
        <div
          className="segmented-control"
          role="group"
          aria-label="Tampilan jadwal"
        >
          <button className="active" type="button">
            Agenda
          </button>
        </div>
        <label className="event-filter">
          <span className="sr-only">Pilih kegiatan</span>
          <select
            value={eventFilter}
            onChange={(event) => selectEvent(event.target.value)}
            aria-label="Tampilkan jadwal kegiatan"
            disabled={!data.events.length}
          >
            {data.events.length ? (
              data.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))
            ) : (
              <option value="">Belum ada kegiatan</option>
            )}
          </select>
        </label>
        <label className="month-filter">
          <span className="sr-only">Pilih bulan</span>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            aria-label="Tampilkan bulan jadwal"
            disabled={!selectedEvent}
          >
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {formatMonthKey(month)}
              </option>
            ))}
          </select>
        </label>
        <span className="schedule-draft">
          <span /> {selectedEvent?.name ?? "Pilih kegiatan"}
        </span>
        {canManage ? (
          <button
            className="button button-secondary regenerate"
            type="button"
            onClick={handleAddMonth}
            disabled={!selectedEvent || generating}
          >
            <Plus size={16} />{" "}
            {generating
              ? "Membuat..."
              : `Tambah ${formatMonthKey(monthKeyAfter(availableMonths.at(-1) ?? selectedMonth))}`}
          </button>
        ) : null}
      </div>
      <section
        className="card schedule-board"
        aria-label="Papan jadwal pelayanan"
      >
        {!selectedEvent ? (
          <EmptyState
            icon={CalendarDays}
            title="Belum ada kegiatan"
            description="Tambahkan kegiatan sebelum membuat jadwal bulanan."
          />
        ) : !occurrences.length ? (
          <EmptyState
            icon={CalendarDays}
            title={`Belum ada tanggal pada ${formatMonthKey(selectedMonth)}`}
            description="Gunakan tombol Tambah bulan berikutnya untuk membuat tanggal dari pola kegiatan ini."
          />
        ) : !sections.length ? (
          <EmptyState
            icon={Users}
            title="Belum ada kebutuhan tim"
            description="Tambahkan bagian pelayanan, lalu atur kebutuhan pelayan pada kegiatan ini."
          />
        ) : (
          <>
            <div className="schedule-table-wrap">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>Bagian pelayanan</th>
                    {occurrences.map((occurrence) => (
                      <th key={occurrence.id}>
                        <strong>
                          {formatShortDate(
                            occurrence.starts_at,
                            data.organization.timezone,
                          )}
                        </strong>
                        <span>{selectedEvent.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <tr key={section.id}>
                      <th>
                        <strong>{section.name}</strong>
                      </th>
                      {occurrences.map((occurrence) => (
                        <ScheduleCell
                          key={occurrence.id}
                          data={data}
                          occurrence={occurrence}
                          section={section}
                          canManage={canManage}
                          onOpen={() => onAssign({ occurrence, section })}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-agenda">
              {occurrences.map((occurrence) => {
                const coverage = coverageFor(data, occurrence);
                const requiredSectionIds = new Set(
                  requirementsFor(data, occurrence).map(
                    (requirement) => requirement.section_id,
                  ),
                );
                const occurrenceSections = data.sections.filter((section) =>
                  requiredSectionIds.has(section.id),
                );
                return (
                  <article key={occurrence.id}>
                    <header>
                      <div>
                        <strong>
                          {formatShortDate(
                            occurrence.starts_at,
                            data.organization.timezone,
                          )}
                        </strong>
                        <span>{selectedEvent.name}</span>
                      </div>
                      <StatusPill
                        tone={coverage.missing ? "attention" : "ready"}
                      >
                        {coverage.missing
                          ? `${coverage.missing} kosong`
                          : "Siap"}
                      </StatusPill>
                    </header>
                    {occurrenceSections.map((section) => (
                      <div className="mobile-assignment" key={section.id}>
                        <span>{section.name}</span>
                        <ScheduleCell
                          mobile
                          data={data}
                          occurrence={occurrence}
                          section={section}
                          canManage={canManage}
                          onOpen={() => onAssign({ occurrence, section })}
                        />
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
      <section className="card recurrence-note">
        <span>
          <CalendarDays size={22} />
        </span>
        <div>
          <h2>Cara tanggal berulang dibuat</h2>
          <p>
            Setiap kegiatan menyimpan hari dan minggu dalam bulan sebagai pola.
            IFGF Planner hanya membuat tanggal bulan awal saat kegiatan
            disimpan; bulan berikutnya dibuat saat Anda menekan tombol Tambah,
            lalu langsung dibuka untuk dijadwalkan.
          </p>
        </div>
      </section>
    </>
  );
}

function ScheduleCell({
  data,
  occurrence,
  section,
  canManage,
  onOpen,
  mobile = false,
}: {
  data: PlannerData;
  occurrence: EventOccurrence;
  section: ServiceSection;
  canManage: boolean;
  onOpen: () => void;
  mobile?: boolean;
}) {
  const requirement = requirementsFor(data, occurrence).find(
    (item) => item.section_id === section.id,
  );
  const assignments = assignmentsFor(data, occurrence.id, section.id);
  const content = !requirement ? (
    <span className="assignment empty">—</span>
  ) : (
    <>
      {assignments.map((assignment) => {
        const volunteer = data.volunteers.find(
          (item) => item.id === assignment.volunteer_id,
        );
        return (
          <button
            key={assignment.id}
            type="button"
            className="assignment"
            onClick={canManage ? onOpen : undefined}
          >
            {volunteer?.full_name ?? "Pelayan"}
          </button>
        );
      })}
      {Array.from(
        { length: Math.max(0, requirement.needed_count - assignments.length) },
        (_, index) => (
          <button
            key={`missing-${index}`}
            type="button"
            className="assignment missing"
            disabled={!canManage}
            onClick={onOpen}
          >
            <Plus size={14} /> Perlu pelayan
          </button>
        ),
      )}
    </>
  );
  return mobile ? <div>{content}</div> : <td>{content}</td>;
}
