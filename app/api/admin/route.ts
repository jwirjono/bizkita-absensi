import { CABANG, WHATSAPP } from "@/config/app.config";
import { cutoffMessage, monthlyRecapMessage, openingMessage, rekapTelatMessage } from "@/config/messages";
import { buildDailyReport, buildMonthlyRows, deleteAbsen, getDayRecords, getMonthRecords } from "@/lib/attendance";
import { buildMonthWorkbook } from "@/lib/excel";
import { enrolledIds, resetFace } from "@/lib/face";
import { fail, handle, isAdmin, ok } from "@/lib/http";
import { allKaryawan, createKaryawan, deleteKaryawan, karyawanName, scheduleFor, updateKaryawan, validateKaryawan } from "@/lib/karyawan";
import { KEYS, redis } from "@/lib/redis";
import { fromMinutes, isDate, isMonth, monthLabel, nowParts, toMinutes } from "@/lib/time";
import { configuredTargets, listWhatsAppGroups, sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET ?action=
 *   overview              → today, all karyawan (incl. inactive) + face status, cabang config
 *   day&date=YYYY-MM-DD   → records for a day
 *   month&month=YYYY-MM   → recap rows for a month
 *   excel&month=YYYY-MM   → Excel (.xlsx) download: Daftar Absen, Rekap
 *   photo&id=             → enrollment photo
 *   whatsapp              → current WhatsApp targets + the sender's WhatsApp groups (with IDs)
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
      karyawan: (await allKaryawan()).map((k) => {
        const s = scheduleFor(k);
        return {
          ...k, // raw values for the edit form (own openTime / toleranceMinutes may be empty)
          cabangName: s.cabang.name,
          effectiveOpenTime: s.openTime,
          effectiveTolerance: s.toleranceMinutes,
          enrolled: enrolled.has(k.id),
        };
      }),
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
  if (action === "excel") {
    const month = q.get("month");
    if (!isMonth(month)) return fail("Bulan tidak valid.");
    const [rows, records, karyawan] = await Promise.all([buildMonthlyRows(month), getMonthRecords(month), allKaryawan()]);
    const file = await buildMonthWorkbook(month, rows, records, karyawan);
    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="absensi-${month}.xlsx"`,
      },
    });
  }
  if (action === "whatsapp") {
    const g = await listWhatsAppGroups();
    return ok({ targets: configuredTargets(), groups: g.groups ?? [], groupError: g.error ?? null });
  }
  if (action === "photo") {
    const id = q.get("id") ?? "";
    return ok({ photo: await redis().get<string>(KEYS.facePhoto(id)) });
  }
  return fail("Aksi tidak dikenal.");
});

/**
 * POST { action }
 *   saveKaryawan   { id?, name, cabang, openTime?, toleranceMinutes?, active } → create (no id) or update
 *   deleteKaryawan { id }       → remove karyawan + face data (absen history is kept)
 *   resetFace   { id }          → delete face data so karyawan can onboard again
 *   deleteAbsen { date, id }    → remove a wrong absen record
 *   sendOpening { date, cabangId, cutoff? } → send that cabang's absen list (or cutoff update) to its group now
 *   sendDaily   { date }           → send rekap telat to the rekap group now
 *   sendMonthly { month }          → send monthly recap to the rekap group now
 */
export const POST = handle(async (req) => {
  if (!isAdmin(req)) return fail("PIN admin salah.", 401);
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case "saveKaryawan": {
      const v = validateKaryawan(body);
      if (!v.ok) return fail(v.error);
      if (typeof body.id === "string" && body.id) {
        const k = await updateKaryawan(body.id, v.value);
        return k ? ok({ message: `${k.name} disimpan.` }) : fail("Karyawan tidak ditemukan.", 404);
      }
      const k = await createKaryawan(v.value);
      return ok({ message: `${k.name} ditambahkan. Dia bisa daftar wajah di halaman absen.` });
    }
    case "deleteKaryawan": {
      if (typeof body.id !== "string") return fail("id wajib diisi.");
      const name = await karyawanName(body.id);
      await resetFace(body.id);
      await deleteKaryawan(body.id);
      return ok({ message: `${name} dihapus. Riwayat absen tetap tersimpan.` });
    }
    case "resetFace":
      if (typeof body.id !== "string") return fail("id wajib diisi.");
      await resetFace(body.id);
      return ok({ message: `Wajah ${await karyawanName(body.id)} direset.` });
    case "deleteAbsen":
      if (!isDate(body.date) || typeof body.id !== "string") return fail("Data tidak valid.");
      await deleteAbsen(body.date, body.id);
      return ok({ message: "Absen dihapus." });
    case "sendOpening": {
      if (!isDate(body.date)) return fail("Tanggal tidak valid.");
      const c = CABANG.find((x) => x.id === body.cabangId);
      if (!c) return fail("Cabang tidak ditemukan.");
      const report = await buildDailyReport(body.date);
      const day = report.cabang.find((x) => x.id === c.id)!;
      const text = body.cutoff
        ? cutoffMessage(day, report.dateLabel, fromMinutes(toMinutes(c.openTime) + c.toleranceMinutes))
        : openingMessage(day, report.dateLabel, WHATSAPP.appUrl);
      const r = await sendWhatsApp(c.whatsappGroup, text);
      return r.ok ? ok({ message: `Absensi ${c.name} terkirim.` }) : fail(r.error ?? "Gagal kirim.", 502);
    }
    case "sendDaily": {
      if (!isDate(body.date)) return fail("Tanggal tidak valid.");
      const r = await sendWhatsApp(WHATSAPP.rekapTelat.group, rekapTelatMessage(await buildDailyReport(body.date)));
      return r.ok ? ok({ message: "Rekap telat terkirim." }) : fail(r.error ?? "Gagal kirim.", 502);
    }
    case "sendMonthly": {
      if (!isMonth(body.month)) return fail("Bulan tidak valid.");
      const r = await sendWhatsApp(WHATSAPP.rekapTelat.group, monthlyRecapMessage(monthLabel(body.month), await buildMonthlyRows(body.month)));
      return r.ok ? ok({ message: "Rekap terkirim." }) : fail(r.error ?? "Gagal kirim.", 502);
    }
  }
  return fail("Aksi tidak dikenal.");
});
