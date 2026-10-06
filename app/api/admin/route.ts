import { CABANG } from "@/config/app.config";
import { dailySummaryMessage, monthlyRecapMessage } from "@/config/messages";
import { buildDailyReport, buildMonthlyRows, deleteAbsen, getDayRecords, getMonthRecords, toCsv } from "@/lib/attendance";
import { enrolledIds, resetFace } from "@/lib/face";
import { fail, handle, isAdmin, ok } from "@/lib/http";
import { activeKaryawan, karyawanName } from "@/lib/karyawan";
import { KEYS, redis } from "@/lib/redis";
import { isDate, isMonth, monthLabel, nowParts } from "@/lib/time";
import { sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET ?action=
 *   overview              → today, karyawan + face status, cabang config
 *   day&date=YYYY-MM-DD   → records for a day
 *   month&month=YYYY-MM   → recap rows for a month
 *   csv&month=YYYY-MM     → CSV download
 *   photo&id=             → enrollment photo
 */
export const GET = handle(async (req) => {
  if (!isAdmin(req)) return fail("PIN admin salah.", 401);
  const q = new URL(req.url).searchParams;
  const action = q.get("action");

  if (action === "overview") {
    const enrolled = await enrolledIds();
    return ok({
      today: nowParts().date,
      cabang: CABANG.map(({ id, name, openTime, toleranceMinutes, radiusMeters }) => ({ id, name, openTime, toleranceMinutes, radiusMeters })),
      karyawan: activeKaryawan().map((k) => ({ ...k, enrolled: enrolled.has(k.id) })),
    });
  }
  if (action === "day") {
    const date = q.get("date");
    if (!isDate(date)) return fail("Tanggal tidak valid.");
    return ok({ records: await getDayRecords(date), report: await buildDailyReport(date) });
  }
  if (action === "month") {
    const month = q.get("month");
    if (!isMonth(month)) return fail("Bulan tidak valid.");
    return ok({ rows: await buildMonthlyRows(month), label: monthLabel(month) });
  }
  if (action === "csv") {
    const month = q.get("month");
    if (!isMonth(month)) return fail("Bulan tidak valid.");
    return new Response("﻿" + toCsv(await getMonthRecords(month)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="absensi-${month}.csv"`,
      },
    });
  }
  if (action === "photo") {
    const id = q.get("id") ?? "";
    return ok({ photo: await redis().get<string>(KEYS.facePhoto(id)) });
  }
  return fail("Aksi tidak dikenal.");
});

/**
 * POST { action }
 *   resetFace   { id }          → delete face data so karyawan can onboard again
 *   deleteAbsen { date, id }    → remove a wrong absen record
 *   sendDaily   { date }        → send daily summary to WhatsApp now
 *   sendMonthly { month }       → send monthly recap to WhatsApp now
 */
export const POST = handle(async (req) => {
  if (!isAdmin(req)) return fail("PIN admin salah.", 401);
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case "resetFace":
      if (typeof body.id !== "string") return fail("id wajib diisi.");
      await resetFace(body.id);
      return ok({ message: `Wajah ${karyawanName(body.id)} direset.` });
    case "deleteAbsen":
      if (!isDate(body.date) || typeof body.id !== "string") return fail("Data tidak valid.");
      await deleteAbsen(body.date, body.id);
      return ok({ message: "Absen dihapus." });
    case "sendDaily": {
      if (!isDate(body.date)) return fail("Tanggal tidak valid.");
      const r = await sendWhatsApp(dailySummaryMessage(await buildDailyReport(body.date)));
      return r.ok ? ok({ message: "Ringkasan terkirim." }) : fail(r.error ?? "Gagal kirim.", 502);
    }
    case "sendMonthly": {
      if (!isMonth(body.month)) return fail("Bulan tidak valid.");
      const r = await sendWhatsApp(monthlyRecapMessage(monthLabel(body.month), await buildMonthlyRows(body.month)));
      return r.ok ? ok({ message: "Rekap terkirim." }) : fail(r.error ?? "Gagal kirim.", 502);
    }
  }
  return fail("Aksi tidak dikenal.");
});
