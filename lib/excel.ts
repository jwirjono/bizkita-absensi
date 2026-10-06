import ExcelJS from "exceljs";
import { APP, KARYAWAN } from "@/config/app.config";
import type { AbsenRecord, MonthlyRow } from "./attendance";
import { scheduleFor } from "./karyawan";
import { monthLabel } from "./time";

const RED_FILL = "FFF8D7D7";
const RED_TEXT = "FF9B1C1C";
const HEADER = "FF1C1917";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 22;
  row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER } }));
}

/** Red stripe across the whole row (all columns, including empty cells). */
function stripeRed(row: ExcelJS.Row, cols: number) {
  for (let i = 1; i <= cols; i++) {
    const c = row.getCell(i);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_FILL } };
    c.font = { color: { argb: RED_TEXT }, bold: i === 7 };
  }
}

function widths(ws: ExcelJS.Worksheet, w: number[]) {
  w.forEach((width, i) => (ws.getColumn(i + 1).width = width));
}

function addTitle(ws: ExcelJS.Worksheet, title: string, cols: number) {
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, cols);
  ws.addRow([]);
}

const info = (id: string) => {
  const k = KARYAWAN.find((x) => x.id === id);
  if (!k) return { cabang: "-", openTime: "-" };
  const s = scheduleFor(k);
  return { cabang: s.cabang.name, openTime: s.openTime };
};

const toDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Monthly Excel file.
 *   Tab 1 "Daftar Absen": every absen, per day; rows striped red when telat.
 *   Tab 2 "Rekap":        totals per karyawan.
 */
export async function buildMonthWorkbook(month: string, rows: MonthlyRow[], records: AbsenRecord[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP.name;
  const label = monthLabel(month);
  const dayName = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long" });

  // ---- Tab 1: Daftar Absen ----
  const COLS = 8;
  const list = wb.addWorksheet("Daftar Absen", { views: [{ state: "frozen", ySplit: 3 }] });
  addTitle(list, `Daftar Absen ${label}`, COLS);
  styleHeader(list.addRow(["Tanggal", "Hari", "Nama", "Cabang", "Jam masuk", "Jam absen", "Status", "Telat (menit)"]));
  const sortedRecords = [...records].sort(
    (a, b) => a.date.localeCompare(b.date) || a.cabangName.localeCompare(b.cabangName) || a.time.localeCompare(b.time),
  );
  for (const r of sortedRecords) {
    const row = list.addRow([
      toDate(r.date),
      dayName.format(toDate(r.date)),
      r.name,
      r.cabangName,
      r.openTime ?? info(r.id).openTime,
      r.time,
      r.late ? "TELAT" : "Tepat waktu",
      r.late ? r.lateMinutes : "",
    ]);
    row.getCell(1).numFmt = "dd/mm/yyyy";
    if (r.late) stripeRed(row, COLS);
  }
  if (!sortedRecords.length) list.addRow(["Belum ada data absen bulan ini."]);
  list.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS } };
  widths(list, [12, 10, 22, 16, 11, 11, 13, 13]);

  // ---- Tab 2: Rekap per karyawan ----
  const rekap = wb.addWorksheet("Rekap", { views: [{ state: "frozen", ySplit: 3 }] });
  addTitle(rekap, `Rekap Telat ${label}`, 8);
  styleHeader(
    rekap.addRow(["Nama", "Cabang", "Jam masuk", "Hadir (hari)", "Telat (kali)", "Total telat (menit)", "Rata-rata telat (menit)", "Tanggal telat"]),
  );
  const lateDates = (id: string) =>
    records
      .filter((r) => r.id === id && r.late)
      .map((r) => Number(r.date.slice(8)))
      .sort((a, b) => a - b)
      .join(", ");
  const sortedRows = [...rows].sort((a, b) => b.lateCount - a.lateCount || b.lateMinutes - a.lateMinutes || a.name.localeCompare(b.name));
  for (const r of sortedRows) {
    const i = info(r.id);
    const row = rekap.addRow([
      r.name,
      i.cabang,
      i.openTime,
      r.present,
      r.lateCount,
      r.lateMinutes,
      r.lateCount ? Math.round(r.lateMinutes / r.lateCount) : 0,
      lateDates(r.id),
    ]);
    if (r.lateCount > 0) for (const c of [5, 6, 7]) row.getCell(c).font = { bold: true, color: { argb: RED_TEXT } };
  }
  const total = rekap.addRow([
    "TOTAL",
    "",
    "",
    sortedRows.reduce((s, r) => s + r.present, 0),
    sortedRows.reduce((s, r) => s + r.lateCount, 0),
    sortedRows.reduce((s, r) => s + r.lateMinutes, 0),
  ]);
  total.font = { bold: true };
  total.border = { top: { style: "thin" } };
  widths(rekap, [22, 16, 11, 13, 12, 18, 21, 28]);

  return wb.xlsx.writeBuffer();
}
