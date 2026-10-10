import { CABANG, RETENTION } from "@/config/app.config";
import { activeKaryawan, scheduleFor } from "./karyawan";
import { KEYS, redis } from "./redis";
import { dateLabel, shiftMonth, toMinutes } from "./time";

export type AbsenRecord = {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  cabangId: string;
  cabangName: string;
  openTime: string; // jam masuk used for this record
  late: boolean;
  lateMinutes: number;
  distanceMeters: number;
  faceDistance: number;
  createdAt: string;
};

/** One cabang on one day: every active karyawan of that cabang with their absen (or null). */
export type CabangDay = {
  id: string;
  name: string;
  openTime: string;
  people: { id: string; name: string; openTime: string; record: AbsenRecord | null }[];
  rows: AbsenRecord[]; // all absen at this cabang (incl. inactive karyawan)
  notYet: string[];
};

export type DailyReport = {
  date: string;
  dateLabel: string;
  cabang: CabangDay[];
  lateNames: string[];
};

export type MonthlyRow = { id: string; name: string; present: number; lateCount: number; lateMinutes: number };

/** Telat if absen after openTime + tolerance. Minutes counted from openTime. */
export function evaluateLate(openTime: string, toleranceMinutes: number, minutesNow: number) {
  const open = toMinutes(openTime);
  const late = minutesNow > open + toleranceMinutes;
  return { late, lateMinutes: late ? minutesNow - open : 0 };
}

export async function getMonthRecords(month: string): Promise<AbsenRecord[]> {
  const h = await redis().hgetall<Record<string, AbsenRecord>>(KEYS.absenMonth(month));
  return Object.values(h ?? {}).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export async function getDayRecords(date: string) {
  return (await getMonthRecords(date.slice(0, 7))).filter((r) => r.date === date);
}

/** Saves the record only if this karyawan has not absen today. Returns false if already absen. */
export async function saveAbsen(rec: AbsenRecord) {
  const created = await redis().hsetnx(KEYS.absenMonth(rec.date.slice(0, 7)), KEYS.absenField(rec.date.slice(8), rec.id), rec);
  return created === 1;
}

export async function deleteAbsen(date: string, id: string) {
  await redis().hdel(KEYS.absenMonth(date.slice(0, 7)), KEYS.absenField(date.slice(8), id));
}

export async function buildDailyReport(date: string): Promise<DailyReport> {
  const records = await getDayRecords(date);
  const done = new Set(records.map((r) => r.id));
  const active = await activeKaryawan();
  return {
    date,
    dateLabel: dateLabel(date),
    cabang: CABANG.map((c) => {
      const team = active.filter((k) => k.cabang === c.id);
      return {
        id: c.id,
        name: c.name,
        openTime: c.openTime,
        people: team.map((k) => ({
          id: k.id,
          name: k.name,
          openTime: scheduleFor(k).openTime,
          record: records.find((r) => r.id === k.id) ?? null,
        })),
        rows: records.filter((r) => r.cabangId === c.id),
        notYet: team.filter((k) => !done.has(k.id)).map((k) => k.name),
      };
    }),
    lateNames: records.filter((r) => r.late).map((r) => r.name),
  };
}

/** All absen between two dates (inclusive), across months. */
export async function getRangeRecords(from: string, to: string) {
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 24; m = shiftMonth(m, 1)) months.push(m);
  const all = (await Promise.all(months.map(getMonthRecords))).flat();
  return all.filter((r) => r.date >= from && r.date <= to);
}

export async function buildMonthlyRows(month: string): Promise<MonthlyRow[]> {
  return rowsFromRecords(await getMonthRecords(month));
}

export async function buildRangeRows(from: string, to: string): Promise<MonthlyRow[]> {
  return rowsFromRecords(await getRangeRecords(from, to));
}

/** Per-karyawan totals (every active karyawan is listed, even with 0 absen). */
async function rowsFromRecords(records: AbsenRecord[]): Promise<MonthlyRow[]> {
  const rows = new Map<string, MonthlyRow>();
  for (const k of await activeKaryawan()) rows.set(k.id, { id: k.id, name: k.name, present: 0, lateCount: 0, lateMinutes: 0 });
  for (const r of records) {
    const row = rows.get(r.id) ?? { id: r.id, name: r.name, present: 0, lateCount: 0, lateMinutes: 0 };
    row.present++;
    if (r.late) {
      row.lateCount++;
      row.lateMinutes += r.lateMinutes;
    }
    rows.set(r.id, row);
  }
  return [...rows.values()];
}

/** Deletes absen months older than the retention window. */
export async function cleanupOldMonths(currentMonth: string) {
  const keys = Array.from({ length: 12 }, (_, i) =>
    KEYS.absenMonth(shiftMonth(currentMonth, -(RETENTION.keepPreviousMonths + 1 + i))),
  );
  return redis().del(...keys);
}
