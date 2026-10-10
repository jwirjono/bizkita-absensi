import { fail, handle, ok } from "@/lib/http";
import { findKaryawan } from "@/lib/karyawan";
import { deviceLabel, getPush, isPushSub, pushPublicKey, savePush } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Public key the browser needs to subscribe. */
export const GET = handle(async () => {
  const publicKey = pushPublicKey();
  return publicKey ? ok({ publicKey }) : fail("Notifikasi belum diaktifkan di server (VAPID key).", 503);
});

/**
 * POST { action }
 *   subscribe   { subscription, karyawanId } → this phone gets that karyawan's reminders
 *   unsubscribe { subscription }             → stop karyawan reminders on this phone (admin role kept)
 *   status      { subscription }             → { karyawanId, admin } for this phone
 */
export const POST = handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (!isPushSub(body.subscription)) return fail("Data notifikasi tidak valid.");
  const device = deviceLabel(req.headers.get("user-agent"));

  if (body.action === "subscribe") {
    const k = await findKaryawan(body.karyawanId);
    if (!k) return fail("Karyawan tidak ditemukan.");
    await savePush(body.subscription, { karyawanId: k.id }, device);
    return ok({ karyawanId: k.id, message: `Pengingat absen aktif untuk ${k.name}.` });
  }
  if (body.action === "unsubscribe") {
    await savePush(body.subscription, { karyawanId: null }, device);
    return ok({ message: "Pengingat absen dimatikan di HP ini." });
  }
  if (body.action === "status") {
    const rec = await getPush(body.subscription.endpoint);
    return ok({ karyawanId: rec?.karyawanId ?? null, admin: rec?.admin ?? false });
  }
  return fail("Aksi tidak dikenal.");
});
