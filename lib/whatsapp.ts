/**
 * Sends WhatsApp messages via Fonnte (https://fonnte.com), using your own WhatsApp number as sender.
 *
 * Env:
 *   FONNTE_TOKEN      — Fonnte dashboard → Device → Token
 *   WHATSAPP_TARGETS  — comma-separated numbers and/or group IDs, e.g.
 *                       "081514174883,120363012345678901@g.us"
 *                       (find group IDs on /admin → "Tampilkan grup WhatsApp")
 */

const API = "https://api.fonnte.com";

/** "0815-1417-4883" → "081514174883"; group IDs (…@g.us) are kept as-is. */
function targets() {
  return (process.env.WHATSAPP_TARGETS ?? "")
    .replace(/["'`]/g, "")
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.includes("@") ? t : t.replace(/[^\d+]/g, "")))
    .filter(Boolean);
}

async function fonnte(path: string, body?: Record<string, string>) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { status: false, reason: "FONNTE_TOKEN belum diset" };
  try {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { Authorization: token },
      body: body ? new URLSearchParams(body) : undefined,
      cache: "no-store",
    });
    return await res.json();
  } catch (e) {
    console.error("[whatsapp] fonnte error", e);
    return { status: false, reason: "tidak bisa menghubungi Fonnte" };
  }
}

export async function sendWhatsApp(text: string): Promise<{ ok: boolean; error?: string }> {
  const list = targets();
  if (!process.env.FONNTE_TOKEN || !list.length) {
    console.log("[whatsapp] not configured, message not sent:\n" + text);
    return { ok: false, error: "WhatsApp belum dikonfigurasi (FONNTE_TOKEN / WHATSAPP_TARGETS)." };
  }
  const r = await fonnte("/send", { target: list.join(","), message: text, countryCode: "62", delay: "2" });
  if (r.status) return { ok: true };
  console.error("[whatsapp] send failed", r);
  return { ok: false, error: `Fonnte gagal: ${r.reason ?? r.detail ?? "unknown"}` };
}

/** Lists the WhatsApp groups the connected number is in (to find group IDs). */
export async function listWhatsAppGroups(): Promise<{ ok: boolean; groups?: { id: string; name: string }[]; error?: string }> {
  await fonnte("/fetch-group"); // refresh Fonnte's copy of the group list
  const r = await fonnte("/get-whatsapp-group");
  if (r.status && Array.isArray(r.data)) return { ok: true, groups: r.data };
  return { ok: false, error: `Fonnte: ${r.reason ?? r.detail ?? "grup tidak ditemukan"}` };
}

export const whatsAppTargets = targets;
