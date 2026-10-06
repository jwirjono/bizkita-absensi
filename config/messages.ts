/**
 * WhatsApp message templates + Terms of Use text.
 * WhatsApp formatting: *bold*  _italic_
 */
import type { CabangDay, DailyReport, MonthlyRow } from "@/lib/attendance";

export const TERMS_OF_USE = `Dengan menggunakan aplikasi absensi ini, saya menyetujui:

1. Foto wajah saya diambil dan diolah menjadi data wajah (biometrik) untuk memverifikasi identitas saat absen.
2. Lokasi GPS saya diambil HANYA pada saat absen untuk memastikan saya berada di cabang.
3. Data absen (nama, waktu, cabang, status telat) dilaporkan ke pemilik/atasan melalui WhatsApp.
4. Data wajah disimpan selama saya bekerja dan dihapus ketika saya tidak lagi bekerja atau atas permintaan saya.
5. Data absen disimpan maksimal 2 bulan, lalu dihapus otomatis.
6. Saya tidak akan mengabsenkan orang lain atau memalsukan absen.`;

const telat = (m: number) => `(telat ${m} menit)`;

/** One line per karyawan: "* Andi - 09:55", "* Budi - 10:22 (telat 22 menit)", "* Sari - Belum absen". */
function absenLines(c: CabangDay) {
  return c.people.map((p) => {
    const shift = p.openTime !== c.openTime ? ` [masuk ${p.openTime}]` : "";
    if (!p.record) return `* ${p.name} - Belum absen${shift}`;
    return `* ${p.name} - ${p.record.time}${p.record.late ? " " + telat(p.record.lateMinutes) : ""}${shift}`;
  });
}

/** (a) Sent to each cabang group at its openTime. */
export function openingMessage(c: CabangDay, dateLabel: string, appUrl: string) {
  return [
    `⏰ Jangan lupa absen di ${appUrl}`,
    "",
    `*Absensi ${c.name} ${dateLabel}:*`,
    "",
    ...absenLines(c),
  ].join("\n");
}

/** (a2) Sent to each cabang group at openTime + toleranceMinutes (the telat cutoff). */
export function cutoffMessage(c: CabangDay, dateLabel: string, cutoff: string) {
  return [
    `⚠️ Batas absen ${c.name} jam ${cutoff} sudah lewat. Yang absen setelah ini dihitung telat.`,
    "",
    `*Absensi ${c.name} ${dateLabel} (update ${cutoff}):*`,
    "",
    ...absenLines(c),
  ].join("\n");
}

/** (b) Sent to the rekap group at rekapTelat.time. */
export function rekapTelatMessage(r: DailyReport) {
  const lines = [`*Rekap Telat ${r.dateLabel}:*`];
  for (const c of r.cabang) {
    lines.push("", `*${c.name}* (buka ${c.openTime})`);
    const late = c.people.filter((p) => p.record?.late);
    if (!late.length) lines.push("* Tidak ada yang telat");
    for (const p of late) lines.push(`* ${p.name} - ${p.record!.time} ${telat(p.record!.lateMinutes)}`);
    const notYet = c.people.filter((p) => !p.record).map((p) => p.name);
    if (notYet.length) lines.push(`* Belum absen: ${notYet.join(", ")}`);
  }
  return lines.join("\n");
}

export function monthlyRecapMessage(monthLabel: string, rows: MonthlyRow[]) {
  const lines: string[] = [`*REKAP TELAT BULAN ${monthLabel.toUpperCase()}*`, ""];
  const sorted = [...rows].sort((a, b) => b.lateCount - a.lateCount || b.lateMinutes - a.lateMinutes);
  for (const r of sorted) {
    lines.push(`* ${r.name}: ${r.lateCount}x telat (${r.lateMinutes} menit) · hadir ${r.present} hari`);
  }
  const total = rows.reduce((s, r) => s + r.lateCount, 0);
  lines.push("", `Total telat: ${total}x`);
  return lines.join("\n");
}

/** Optional instant alerts (off by default in WHATSAPP config). */
export function lateAlertMessage(p: { name: string; cabang: string; openTime: string; time: string; lateMinutes: number }) {
  return `⚠️ *TELAT* — ${p.name}\nCabang: ${p.cabang}\nJam masuk: ${p.openTime}\nJam absen: ${p.time}\nTelat: ${p.lateMinutes} menit`;
}

export function enrollAlertMessage(p: { name: string; time: string }) {
  return `🆕 Wajah baru didaftarkan: *${p.name}* (${p.time}).\nJika ini bukan ${p.name}, reset di halaman admin.`;
}
