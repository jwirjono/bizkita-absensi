/** Browser-only helpers for phone notifications. */

export type PushEnv = "ok" | "ios-needs-install" | "unsupported";

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** iPhone only allows notifications for sites added to the home screen and opened from there. */
export function pushEnv(): PushEnv {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-needs-install";
  return supported ? "ok" : "unsupported";
}

let registration: Promise<ServiceWorkerRegistration> | null = null;
export function swRegistration() {
  registration ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then(() => navigator.serviceWorker.ready)
    .catch((e) => {
      registration = null; // allow a retry later
      console.warn("[push] service worker", e);
      throw new Error("Notifikasi tidak bisa diaktifkan di browser ini. Coba Safari (iPhone) atau Chrome (Android).");
    });
  return registration;
}

export async function currentSubscription() {
  return (await swRegistration()).pushManager.getSubscription();
}

function keyToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Asks permission and subscribes this phone. Must be called directly from a tap
 * (iPhone rejects the permission prompt otherwise), so permission is asked first.
 */
export async function subscribePush(): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Izin notifikasi ditolak. Buka Pengaturan HP → Notifikasi → Absensi → izinkan, lalu coba lagi.");
  }
  const reg = await swRegistration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing.toJSON();
  const res = await fetch("/api/push").then((r) => r.json());
  if (!res.ok) throw new Error(res.error ?? "Notifikasi belum siap di server.");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(res.publicKey) });
  return sub.toJSON();
}

export async function postPush(action: string, body: object = {}) {
  const sub = await currentSubscription();
  if (!sub) return { ok: false, error: "Notifikasi belum aktif di HP ini." };
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, subscription: sub.toJSON(), ...body }),
  });
  return res.json().catch(() => ({ ok: false, error: "Server tidak merespons." }));
}
