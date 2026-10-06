/**
 * WhatsApp message templates + Terms of Use text.
 * WhatsApp formatting: *bold*  _italic_
 */
import type { DailyReport, MonthlyRow } from "@/lib/attendance";

export const TERMS_OF_USE = `Dengan menggunakan aplikasi absensi ini, saya menyetujui:

1. Foto wajah saya diambil dan diolah menjadi data wajah (biometrik) untuk memverifikasi identitas saat absen.
2. Lokasi GPS saya diambil HANYA pada saat absen untuk memastikan saya berada di cabang.
3. Data absen (nama, waktu, cabang, status telat) dilaporkan ke pemilik/atasan melalui WhatsApp.
4. Data wajah disimpan selama saya bekerja dan dihapus ketika saya tidak lagi bekerja atau atas permintaan saya.
5. Data absen disimpan maksimal 2 bulan, lalu dihapus otomatis.
6. Saya tidak akan mengabsenkan orang lain atau memalsukan absen.`;

export function lateAlertMessage(p: { name: string; cabang: string; time: string; lateMinutes: number }) {
  return `⚠️ *TELAT* — ${p.name}
Cabang: ${p.cabang}
Jam absen: ${p.time}
Telat: ${p.lateMinutes} menit`;
}

export function enrollAlertMessage(p: { name: string; time: string }) {
  return `🆕 Wajah baru didaftarkan: *${p.name}* (${p.time}).
Jika ini bukan ${p.name}, reset di halaman admin.`;
}

export function dailySummaryMessage(r: DailyReport) {
  const lines: string[] = [`*ABSENSI ${r.dateLabel}*`];
  for (const c of r.cabang) {
    lines.push("", `*${c.name}* (buka ${c.openTime})`);
    if (c.rows.length === 0) lines.push("- belum ada yang absen");
    for (const row of c.rows) {
      lines.push(row.late ? `❌ ${row.name} ${row.time} (telat ${row.lateMinutes}m)` : `✅ ${row.name} ${row.time}`);
    }
  }
  if (r.notYet.length) lines.push("", `Belum absen: ${r.notYet.join(", ")}`);
  lines.push("", r.lateNames.length ? `Telat hari ini: ${r.lateNames.join(", ")}` : "Tidak ada yang telat hari ini 👍");
  return lines.join("\n");
}

export function monthlyRecapMessage(monthLabel: string, rows: MonthlyRow[]) {
  const lines: string[] = [`*REKAP TELAT ${monthLabel.toUpperCase()}*`, ""];
  const sorted = [...rows].sort((a, b) => b.lateCount - a.lateCount || b.lateMinutes - a.lateMinutes);
  for (const r of sorted) {
    lines.push(`${r.name}: ${r.lateCount}x telat (${r.lateMinutes} menit) · hadir ${r.present} hari`);
  }
  const total = rows.reduce((s, r) => s + r.lateCount, 0);
  lines.push("", `Total telat: ${total}x`);
  return lines.join("\n");
}
