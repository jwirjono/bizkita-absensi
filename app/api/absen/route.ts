import { after } from "next/server";
import { GPS, WHATSAPP } from "@/config/app.config";
import { lateAlertMessage } from "@/config/messages";
import { evaluateLate, saveAbsen, type AbsenRecord } from "@/lib/attendance";
import { bestDistance, getFace, isDescriptor, isMatch } from "@/lib/face";
import { distanceMeters } from "@/lib/geo";
import { fail, handle, ok } from "@/lib/http";
import { findKaryawan, scheduleFor } from "@/lib/karyawan";
import { nowParts } from "@/lib/time";
import { sendWhatsApp } from "@/lib/whatsapp";

/** Absen masuk: verify GPS → verify face → save (once per day) → WhatsApp if telat. */
export const POST = handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  const k = findKaryawan(body.id);
  if (!k) return fail("Karyawan tidak ditemukan.");

  // 1. GPS
  const { lat, lng, accuracy } = body;
  if (![lat, lng, accuracy].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return fail("Lokasi tidak terbaca. Aktifkan GPS dan izinkan akses lokasi.");
  }
  if (accuracy > GPS.maxAccuracyMeters) {
    return fail(`Sinyal GPS kurang akurat (±${Math.round(accuracy)} m). Coba di dekat pintu/luar ruangan lalu ulangi.`);
  }
  const { cabang, openTime, toleranceMinutes } = scheduleFor(k);
  const distance = distanceMeters(lat, lng, cabang.lat, cabang.lng);
  if (distance > cabang.radiusMeters) {
    return fail(`Kamu berada ${Math.round(distance)} m dari cabang ${cabang.name}. ${k.name} hanya bisa absen di cabang ${cabang.name}.`);
  }

  // 2. Face
  if (!isDescriptor(body.descriptor)) return fail("Wajah tidak terdeteksi. Ulangi foto.");
  const face = await getFace(k.id);
  if (!face) return fail("Wajah belum terdaftar. Lakukan pendaftaran dulu.");
  const faceDistance = bestDistance(body.descriptor, face.descriptors);
  if (!isMatch(faceDistance)) {
    return fail(`Wajah tidak cocok dengan ${k.name}. Pastikan cahaya cukup dan wajah terlihat jelas, lalu ulangi.`, 403);
  }

  // 3. Save
  const now = nowParts();
  const { late, lateMinutes } = evaluateLate(openTime, toleranceMinutes, now.minutes);
  const record: AbsenRecord = {
    id: k.id,
    name: k.name,
    date: now.date,
    time: now.time,
    cabangId: cabang.id,
    cabangName: cabang.name,
    openTime,
    late,
    lateMinutes,
    distanceMeters: Math.round(distance),
    faceDistance: Math.round(faceDistance * 1000) / 1000,
    createdAt: now.iso,
  };
  if (!(await saveAbsen(record))) return fail(`${k.name} sudah absen hari ini.`, 409);

  // 4. Notify
  if (late && WHATSAPP.sendLateAlert) {
    after(() => sendWhatsApp(lateAlertMessage({ name: k.name, cabang: cabang.name, openTime, time: now.time, lateMinutes })));
  }
  return ok({ record });
});
