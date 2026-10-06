import { after } from "next/server";
import { FACE, WHATSAPP } from "@/config/app.config";
import { enrollAlertMessage } from "@/config/messages";
import { findDuplicateFace, isDescriptor, saveFace } from "@/lib/face";
import { fail, handle, ok } from "@/lib/http";
import { findKaryawan } from "@/lib/karyawan";
import { nowParts } from "@/lib/time";
import { sendWhatsApp } from "@/lib/whatsapp";

/** One-time onboarding: consent + face samples. Cannot overwrite existing face data (admin must reset). */
export const POST = handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  const k = findKaryawan(body.id);
  if (!k) return fail("Karyawan tidak ditemukan.");
  if (body.consent !== true) return fail("Syarat penggunaan harus disetujui.");

  const descriptors: unknown[] = Array.isArray(body.descriptors) ? body.descriptors : [];
  if (descriptors.length < FACE.enrollSamples || !descriptors.every(isDescriptor)) {
    return fail("Data wajah tidak lengkap. Ulangi pengambilan foto.");
  }
  const photo =
    typeof body.photo === "string" && body.photo.startsWith("data:image/jpeg;base64,") && body.photo.length < 150_000
      ? body.photo
      : null;

  const dup = await findDuplicateFace(descriptors as number[][], k.id);
  if (dup) return fail("Wajah ini sudah terdaftar untuk karyawan lain. Hubungi admin.", 409);

  const now = nowParts();
  const saved = await saveFace(k.id, { descriptors: descriptors as number[][], enrolledAt: now.iso, consentAt: now.iso }, photo);
  if (!saved) return fail("Wajah untuk nama ini sudah terdaftar. Minta admin untuk reset jika perlu.", 409);

  if (WHATSAPP.sendEnrollAlert) {
    after(() => sendWhatsApp(WHATSAPP.rekapTelat.group, enrollAlertMessage({ name: k.name, time: `${now.date} ${now.time}` })));
  }
  return ok({ name: k.name });
});
