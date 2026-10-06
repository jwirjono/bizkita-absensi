/**
 * Sends WhatsApp messages via Fonnte (https://fonnte.com), using your own WhatsApp number as sender.
 * Env: FONNTE_TOKEN — Fonnte dashboard → Device → Token
 * Targets (group IDs) are set in config/app.config.ts.
 */
import { CABANG, WHATSAPP } from "@/config/app.config";

const API = "https://api.fonnte.com";

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

/** Sends one message to one or more targets (group IDs or numbers). Empty targets are skipped. */
export async function sendWhatsApp(targets: string | string[], text: string): Promise<{ ok: boolean; error?: string }> {
  const list = [targets].flat().map((t) => t.trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: "Tujuan WhatsApp (ID grup) belum diisi di config/app.config.ts." };
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

/** Configured destinations, for the admin page. */
export function configuredTargets() {
  return [
    ...CABANG.map((c) => ({ label: `Absensi ${c.name} (jam ${c.openTime})`, target: c.whatsappGroup })),
    { label: `Rekap telat (jam ${WHATSAPP.rekapTelat.time})`, target: WHATSAPP.rekapTelat.group },
  ];
}
