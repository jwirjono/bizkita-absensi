import { APP } from "@/config/app.config";

export type NowParts = {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  day: string; // DD
  time: string; // HH:mm
  minutes: number; // minutes since 00:00
  iso: string;
};

/** Current date/time in the configured timezone (server clock). */
export function nowParts(d = new Date()): NowParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const [y, m, day, h, min] = [get("year"), get("month"), get("day"), get("hour"), get("minute")];
  return {
    date: `${y}-${m}-${day}`,
    month: `${y}-${m}`,
    day,
    time: `${h}:${min}`,
    minutes: Number(h) * 60 + Number(min),
    iso: d.toISOString(),
  };
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 540 → "09:00" */
export function fromMinutes(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function isLastDayOfMonth(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return d === new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** shiftMonth("2026-10", -2) → "2026-08" */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dateLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
