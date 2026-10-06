/**
 * Sends WhatsApp messages via CallMeBot (free).
 * Each recipient registers their OWN number with CallMeBot and gets their own API key:
 *   https://www.callmebot.com/blog/free-api-whatsapp-messages/
 *
 * Env: CALLMEBOT_RECIPIENTS = "phone:apikey,phone:apikey"
 *   e.g. "081234567890:111111,6281298765432:222222"  (0... or 62... both fine)
 * (Old single-recipient form CALLMEBOT_PHONE + CALLMEBOT_APIKEY still works.)
 */

type Recipient = { phone: string; apikey: string };

/** "0812-3456-789" → "628123456789" */
function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("0") ? "62" + digits.slice(1) : digits;
}

function recipients(): Recipient[] {
  const list = (process.env.CALLMEBOT_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.lastIndexOf(":");
      return { phone: normalizePhone(entry.slice(0, i)), apikey: entry.slice(i + 1).trim() };
    })
    .filter((r) => r.phone && r.apikey);
  if (process.env.CALLMEBOT_PHONE && process.env.CALLMEBOT_APIKEY) {
    list.push({ phone: normalizePhone(process.env.CALLMEBOT_PHONE), apikey: process.env.CALLMEBOT_APIKEY });
  }
  return list;
}

async function sendOne(r: Recipient, text: string) {
  const url =
    "https://api.callmebot.com/whatsapp.php" +
    `?phone=${encodeURIComponent(r.phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(r.apikey)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text();
    if (!res.ok || /error|invalid/i.test(body.slice(0, 500))) {
      console.error(`[whatsapp] ${r.phone} failed`, res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[whatsapp] ${r.phone} error`, e);
    return false;
  }
}

/** Sends to every recipient (one after another — CallMeBot dislikes parallel calls). */
export async function sendWhatsApp(text: string): Promise<{ ok: boolean; error?: string }> {
  const list = recipients();
  if (!list.length) {
    console.log("[whatsapp] not configured, message not sent:\n" + text);
    return { ok: false, error: "WhatsApp belum dikonfigurasi (CALLMEBOT_RECIPIENTS)." };
  }
  const failed: string[] = [];
  for (const r of list) {
    if (!(await sendOne(r, text))) failed.push(r.phone);
  }
  if (failed.length) return { ok: false, error: `Gagal kirim ke: ${failed.join(", ")}. Cek nomor dan API key CallMeBot.` };
  return { ok: true };
}
