/**
 * Web push notifications (phone notifications from the absen site itself).
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (generated once, see README).
 *
 * Each phone/browser that taps "Aktifkan" is stored in Redis hash "push" (field = id from endpoint):
 *   karyawanId: gets that karyawan's absen reminders
 *   admin:      gets the admin rekap
 */
import { createHash } from "node:crypto";
import webpush from "web-push";
import { WHATSAPP } from "@/config/app.config";
import { KEYS, redis } from "./redis";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushRecord = {
  id: string;
  sub: PushSub;
  karyawanId: string | null;
  admin: boolean;
  device: string;
  createdAt: string;
};
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

let vapidSet = false;
function ready() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!vapidSet) {
    webpush.setVapidDetails(WHATSAPP.appUrl.replace(/\/$/, ""), pub, priv);
    vapidSet = true;
  }
  return true;
}

export function isPushSub(s: unknown): s is PushSub {
  const x = s as PushSub;
  return (
    !!x &&
    typeof x.endpoint === "string" &&
    x.endpoint.startsWith("https://") &&
    typeof x.keys?.p256dh === "string" &&
    typeof x.keys?.auth === "string"
  );
}

const pushId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 24);

/** "iPhone", "Android", … from the browser's user agent (for the admin list only). */
export function deviceLabel(ua: string | null) {
  if (!ua) return "Perangkat";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Perangkat";
}

export async function getPush(endpoint: string) {
  return redis().hget<PushRecord>(KEYS.push, pushId(endpoint));
}

/** Saves a subscription. Roles not given are kept (a phone can be karyawan AND admin). */
export async function savePush(sub: PushSub, roles: { karyawanId?: string | null; admin?: boolean }, device: string) {
  const id = pushId(sub.endpoint);
  const old = await redis().hget<PushRecord>(KEYS.push, id);
  const rec: PushRecord = {
    id,
    sub,
    karyawanId: roles.karyawanId !== undefined ? roles.karyawanId : (old?.karyawanId ?? null),
    admin: roles.admin ?? old?.admin ?? false,
    device,
    createdAt: old?.createdAt ?? new Date().toISOString(),
  };
  await redis().hset(KEYS.push, { [id]: rec });
  return rec;
}

export async function removePushById(id: string) {
  await redis().hdel(KEYS.push, id);
}

export async function allPush(): Promise<PushRecord[]> {
  const h = await redis().hgetall<Record<string, PushRecord>>(KEYS.push);
  return Object.values(h ?? {});
}

/** Sends to each record; removes subscriptions the browser has revoked. ok = nothing failed. */
export async function sendPush(records: PushRecord[], msg: PushMessage) {
  if (!records.length) return { ok: true, sent: 0, failed: 0 };
  if (!ready()) return { ok: false, sent: 0, failed: records.length, error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum diset." };
  let sent = 0;
  let failed = 0;
  await Promise.all(
    records.map(async (r) => {
      try {
        await webpush.sendNotification(r.sub, JSON.stringify(msg), { TTL: 60 * 60 * 4, urgency: "high" });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await removePushById(r.id); // phone unsubscribed / app removed
        else {
          failed++;
          console.error("[push] failed", status, (e as Error).message);
        }
      }
    }),
  );
  return { ok: failed === 0, sent, failed, error: failed ? `${failed} notifikasi gagal terkirim.` : undefined };
}
