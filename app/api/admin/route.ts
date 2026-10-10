import { CABANG, WHATSAPP } from "@/config/app.config";
import { cutoffMessage, monthlyRecapMessage, openingMessage, rekapTelatMessage } from "@/config/messages";
import { buildDailyReport, buildMonthlyRows, buildRangeRows, deleteAbsen, getDayRecords, getRangeRecords } from "@/lib/attendance";
import { buildMonthWorkbook } from "@/lib/excel";
import { enrolledIds, resetFace } from "@/lib/face";
import { fail, handle, isAdmin, ok } from "@/lib/http";
import { allKaryawan, createKaryawan, deleteKaryawan, karyawanName, scheduleFor, updateKaryawan, validateKaryawan } from "@/lib/karyawan";
import { allPush, deviceLabel, getPush, isPushSub, removePushById, savePush, sendPush } from "@/lib/push";
import { KEYS, redis } from "@/lib/redis";
import { fromMinutes, isDate, isMonth, monthLabel, nowParts, rangeLabel, toMinutes } from "@/lib/time";
import { configuredTargets, listWhatsAppGroups, sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET ?action=
 *   overview              → today, all karyawan (incl. inactive) + face status, cabang config
 *   day&date=YYYY-MM-DD   → records for a day
 *   month&from=YYYY-MM-DD&to=YYYY-MM-DD → recap rows for a period (or &month=YYYY-MM)
 *   excel&from=…&to=…     → Excel (.xlsx) download for that period: Daftar Absen, Rekap
 *   photo&id=             → enrollment photo
 *   whatsapp              → current WhatsApp targets + the sender's WhatsApp groups (with IDs)
 *   push                  → phones with notifications on
 */
/** Period from the query: from+to (dates), or a whole month. */
function period(q: URLSearchParams) {
  const from = q.get("from");
  const to = q.get("to");
  if (isDate(from) && isDate(to)) return from <= to ? { from, to } : null;
  const month = q.get("month");
  if (!isMonth(month)) return null;
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}

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
    const p = period(q);
    if (!p) return fail("Periode tidak valid. Tanggal awal harus sebelum tanggal akhir.");
    return ok({ rows: await buildRangeRows(p.from, p.to), label: rangeLabel(p.from, p.to) });
  }
  if (action === "excel") {
    const p = period(q);
    if (!p) return fail("Periode tidak valid.");
    const [rows, records, karyawan] = await Promise.all([buildRangeRows(p.from, p.to), getRangeRecords(p.from, p.to), allKaryawan()]);
    const file = await buildMonthWorkbook(rangeLabel(p.from, p.to), rows, records, karyawan);
    const name = p.from.slice(0, 7) === p.to.slice(0, 7) && rangeLabel(p.from, p.to) === monthLabel(p.from.slice(0, 7)) ? p.from.slice(0, 7) : `${p.from}_${p.to}`;
    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="absensi-${name}.xlsx"`,
      },
    });
  }
  if (action === "whatsapp") {
    const g = await listWhatsAppGroups();
    return ok({ targets: configuredTargets(), groups: g.groups ?? [], groupError: g.error ?? null });
  }
  if (action === "push") {
    const names = new Map((await allKaryawan()).map((k) => [k.id, k.name]));
    const devices = (await allPush()).map((r) => ({
      id: r.id,
      device: r.device,
      admin: r.admin,
      karyawan: r.karyawanId ? (names.get(r.karyawanId) ?? r.karyawanId) : null,
      createdAt: r.createdAt,
    }));
    return ok({ devices });
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
 *   pushAdmin   { subscription, on } → this phone gets (or stops) the admin rekap notification
 *   pushTest    { subscription }     → send a test notification to this phone
 *   pushRemove  { id }               → remove a registered phone
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
    case "pushAdmin": {
      if (!isPushSub(body.subscription)) return fail("Data notifikasi tidak valid.");
      await savePush(body.subscription, { admin: body.on !== false }, deviceLabel(req.headers.get("user-agent")));
      return ok({ message: body.on === false ? "Notifikasi admin dimatikan di HP ini." : "Notifikasi admin aktif di HP ini." });
    }
    case "pushTest": {
      if (!isPushSub(body.subscription)) return fail("Data notifikasi tidak valid.");
      const rec = await getPush(body.subscription.endpoint);
      if (!rec) return fail("HP ini belum terdaftar. Aktifkan notifikasi dulu.");
      const r = await sendPush([rec], { title: "✅ Tes notifikasi", body: "Notifikasi Absensi Barberworks berhasil.", url: "/admin" });
      return r.ok && r.sent ? ok({ message: "Tes terkirim. Cek notifikasi di HP ini." }) : fail(r.error ?? "Gagal kirim. Coba aktifkan ulang notifikasi.", 502);
    }
    case "pushRemove":
      if (typeof body.id !== "string") return fail("id wajib diisi.");
      await removePushById(body.id);
      return ok({ message: "Perangkat dihapus dari notifikasi." });
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
