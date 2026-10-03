import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  DEFAULT_SCHEDULE_APPEARANCE,
  SCHEDULE_TABLE_DESIGN,
  parseScheduleAppearance,
  scheduleAppearanceStorageKey,
  scheduleRowBackground,
  selectScheduleExportRows,
} from "../lib/schedule-appearance.ts";

test("customizations survive a storage round trip without sharing defaults", () => {
  const customized = {
    ...DEFAULT_SCHEDULE_APPEARANCE,
    headerBackground: "#123abc",
    columnText: "#ABCDEF",
    alternateRows: false,
    paddingHorizontal: 7,
    paddingVertical: 3,
    hiddenSectionIds: ["sound"],
    removeEmptyRowsOnExport: true,
  };
  assert.deepEqual(parseScheduleAppearance(JSON.parse(JSON.stringify(customized))), customized);
  const defaults = parseScheduleAppearance(null);
  defaults.hiddenSectionIds.push("other");
  assert.deepEqual(DEFAULT_SCHEDULE_APPEARANCE.hiddenSectionIds, []);
});

test("invalid stored values fall back safely and padding is bounded", () => {
  const appearance = parseScheduleAppearance({
    headerBackground: "red",
    headerText: null,
    paddingHorizontal: 500,
    paddingVertical: -4,
    alternateRows: "false",
    hiddenSectionIds: ["sound", null, 5, "sound"],
  });
  assert.equal(appearance.headerBackground, DEFAULT_SCHEDULE_APPEARANCE.headerBackground);
  assert.equal(appearance.headerText, DEFAULT_SCHEDULE_APPEARANCE.headerText);
  assert.equal(appearance.paddingHorizontal, 32);
  assert.equal(appearance.paddingVertical, 0);
  assert.equal(appearance.alternateRows, true);
  assert.deepEqual(appearance.hiddenSectionIds, ["sound"]);
  assert.deepEqual(parseScheduleAppearance([]), DEFAULT_SCHEDULE_APPEARANCE);
  assert.equal(parseScheduleAppearance({ paddingVertical: NaN }).paddingVertical, 12);
});

test("saved appearance is scoped to organization, user, and event", () => {
  const key = scheduleAppearanceStorageKey("org", "user", "event");
  for (const args of [["other", "user", "event"], ["org", "other", "event"], ["org", "user", "other"]]) {
    assert.notEqual(scheduleAppearanceStorageKey(...args), key);
  }
});

const rows = [
  { sectionId: "sound", hasAssignments: true, volunteerType: "Sound", volunteerNames: ["Ana"] },
  { sectionId: "music", hasAssignments: false, volunteerType: "Music", volunteerNames: ["Belum ditugaskan"] },
  { sectionId: "welcome", hasAssignments: true, volunteerType: "Welcome", volunteerNames: ["Budi"] },
];

test("exports retain empty rows by default and exclude hidden rows", () => {
  assert.deepEqual(selectScheduleExportRows(rows, DEFAULT_SCHEDULE_APPEARANCE), rows);
  assert.deepEqual(selectScheduleExportRows(rows, {
    ...DEFAULT_SCHEDULE_APPEARANCE, hiddenSectionIds: ["sound"],
  }), rows.slice(1));
});

test("empty-row removal combines with hidden rows and can be reversed", () => {
  const appearance = {
    ...DEFAULT_SCHEDULE_APPEARANCE,
    hiddenSectionIds: ["sound"],
    removeEmptyRowsOnExport: true,
  };
  assert.deepEqual(selectScheduleExportRows(rows, appearance), [rows[2]]);
  assert.deepEqual(selectScheduleExportRows(rows, { ...appearance, removeEmptyRowsOnExport: false }), rows.slice(1));
  assert.deepEqual(selectScheduleExportRows(rows, { ...appearance, hiddenSectionIds: ["sound", "welcome"] }), []);
  assert.equal(rows.length, 3);
});

const source = await readFile(new URL("../app/pages/schedule.tsx", import.meta.url), "utf8");
const imageFunctions = stripTypeScriptTypes(source.slice(
  source.indexOf("function wrapCanvasText("),
  source.indexOf("export default function Schedule("),
));

async function renderImage(appearance, exportRows = rows, dates = ["4 October"]) {
  const rectangles = [];
  const texts = [];
  const strokes = [];
  const outlines = [];
  let path = [];
  const context = {
    measureText: (text) => ({ width: text.length * 10 }),
    fillRect(x, y, width, height) { rectangles.push({ x, y, width, height, color: this.fillStyle }); },
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    stroke() { strokes.push({ path, color: this.strokeStyle, width: this.lineWidth }); },
    strokeRect(x, y, width, height) { outlines.push({ x, y, width, height, color: this.strokeStyle, lineWidth: this.lineWidth }); },
    fillText(value, x, y, maxWidth) { texts.push({ value, x, y, maxWidth, color: this.fillStyle, align: this.textAlign }); },
  };
  const canvas = {
    getContext: () => context,
    toBlob: (callback) => callback(new Blob(["png"], { type: "image/png" })),
  };
  const createImage = runInNewContext(`${imageFunctions}\ncreateScheduleImage`, {
    document: { createElement: () => canvas },
    scheduleRowBackground,
    SCHEDULE_TABLE_DESIGN,
  });
  const blob = await createImage("Sunday", "October", dates, exportRows, appearance);
  assert.equal(blob.type, "image/png");
  return { rectangles: rectangles.slice(1), texts, canvas, strokes, outlines };
}

test("PNG uses customized header, header-column, and alternating row colors", async () => {
  const appearance = {
    ...DEFAULT_SCHEDULE_APPEARANCE,
    headerBackground: "#112233", headerText: "#ffffff",
    columnBackground: "#aabbcc", columnText: "#332211",
    rowBackground: "#eeeeee", alternateRowBackground: "#dddddd",
  };
  const { rectangles, texts } = await renderImage(appearance);
  assert.deepEqual(rectangles.map((cell) => cell.color), [
    "#112233", "#112233", "#aabbcc", "#eeeeee",
    "#aabbcc", "#dddddd", "#aabbcc", "#eeeeee",
  ]);
  assert.equal(texts.find((text) => text.value === "Bagian pelayanan").color, appearance.headerText);
  assert.equal(texts.find((text) => text.value === "Sound").color, appearance.columnText);
  assert.ok(!texts.some((text) => text.value === "Belum ditugaskan"));
});

test("PNG padding affects text insets and row heights including wrapped names", async () => {
  const compact = await renderImage({ ...DEFAULT_SCHEDULE_APPEARANCE, paddingHorizontal: 0, paddingVertical: 0 });
  const spacious = await renderImage({ ...DEFAULT_SCHEDULE_APPEARANCE, paddingHorizontal: 24, paddingVertical: 24 });
  const compactHeader = compact.texts.find((text) => text.value === "Bagian pelayanan");
  const spaciousHeader = spacious.texts.find((text) => text.value === "Bagian pelayanan");
  assert.equal(spaciousHeader.x - compactHeader.x, 24);
  assert.equal(spaciousHeader.y - compactHeader.y, 24);
  assert.equal(compactHeader.maxWidth - spaciousHeader.maxWidth, 48);
  assert.equal(spacious.rectangles[0].height - compact.rectangles[0].height, 48);
  assert.ok(spacious.canvas.height > compact.canvas.height);

  const wrapped = await renderImage(DEFAULT_SCHEDULE_APPEARANCE, [
    { ...rows[0], volunteerNames: ["Ana Budi Charles Daniel Evelyn Francis Grace Hannah"] },
  ]);
  const nameLines = wrapped.texts.filter((text) => text.x > 300 && text.y > 200);
  assert.ok(nameLines.length > 1);
  assert.ok(wrapped.rectangles[2].height > compact.rectangles[2].height);
});

test("PNG draws single grid edges with stronger header, service-column, and outer dividers", async () => {
  const exportRows = rows.map((row) => ({ ...row, volunteerNames: ["Ana", "Budi", "Cindy"] }));
  const { strokes, outlines, rectangles, canvas } = await renderImage(
    DEFAULT_SCHEDULE_APPEARANCE, exportRows, ["4 October", "11 October", "18 October"],
  );
  assert.equal(outlines.length, 1);
  assert.equal(outlines[0].lineWidth, 2);
  assert.equal(outlines[0].color, SCHEDULE_TABLE_DESIGN.dividerColor);
  assert.ok(outlines[0].x > 0 && outlines[0].y > 0);
  assert.ok(outlines[0].x + outlines[0].width < canvas.width);
  assert.ok(outlines[0].y + outlines[0].height < canvas.height);
  assert.equal(new Set(strokes.map((stroke) => JSON.stringify(stroke.path))).size, strokes.length);
  const vertical = strokes.filter((stroke) => stroke.path[0][0] === stroke.path[1][0]);
  const horizontal = strokes.filter((stroke) => stroke.path[0][1] === stroke.path[1][1]);
  assert.equal(vertical.length, 5);
  assert.equal(horizontal.length, 3);
  const serviceDivider = vertical.find((stroke) => stroke.path[0][0] === 348);
  assert.equal(serviceDivider.width, 2);
  assert.equal(serviceDivider.color, SCHEDULE_TABLE_DESIGN.dividerColor);
  assert.equal(serviceDivider.path[0][1], rectangles[0].y);
  assert.equal(serviceDivider.path[1][1], rectangles.at(-1).y + rectangles.at(-1).height);
  assert.equal(horizontal[0].width, 2);
  assert.equal(horizontal[0].color, SCHEDULE_TABLE_DESIGN.dividerColor);
  assert.ok(horizontal.slice(1).every((stroke) => stroke.width === 1 && stroke.color === SCHEDULE_TABLE_DESIGN.gridColor));
  assert.ok(vertical.filter((stroke) => stroke.width === 1)
    .every((stroke) => [SCHEDULE_TABLE_DESIGN.gridColor, SCHEDULE_TABLE_DESIGN.headerGridColor].includes(stroke.color)));
});

test("PNG centers dates while keeping service headings and volunteer names aligned left", async () => {
  const { texts } = await renderImage(DEFAULT_SCHEDULE_APPEARANCE);
  const date = texts.find((text) => text.value === "4 October");
  assert.equal(date.align, "center");
  assert.equal(date.x, 48 + 300 + 280 / 2);
  assert.equal(texts.find((text) => text.value === "Bagian pelayanan").align, "left");
  assert.equal(texts.find((text) => text.value === "Sound").align, "left");
  assert.equal(texts.find((text) => text.value === "Ana").align, "left");
});

test("PNG can disable striping and filters rows before choosing stripe positions", async () => {
  const noStripes = await renderImage({ ...DEFAULT_SCHEDULE_APPEARANCE, alternateRows: false });
  assert.ok(noStripes.rectangles.filter((_, index) => index >= 2 && index % 2 === 1)
    .every((cell) => cell.color === DEFAULT_SCHEDULE_APPEARANCE.rowBackground));
  const filtered = await renderImage(DEFAULT_SCHEDULE_APPEARANCE,
    selectScheduleExportRows(rows, { ...DEFAULT_SCHEDULE_APPEARANCE, hiddenSectionIds: ["sound"] }));
  assert.equal(filtered.rectangles[3].color, DEFAULT_SCHEDULE_APPEARANCE.rowBackground);
  assert.equal(filtered.rectangles[5].color, DEFAULT_SCHEDULE_APPEARANCE.alternateRowBackground);
  assert.ok(!filtered.texts.some((text) => text.value === "Sound"));
});
