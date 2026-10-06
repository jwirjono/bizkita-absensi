/**
 * Sends a WhatsApp message to the owner via CallMeBot (free).
 * Setup: https://www.callmebot.com/blog/free-api-whatsapp-messages/
 * Env: CALLMEBOT_PHONE (e.g. 6281234567890), CALLMEBOT_APIKEY
 */
export async function sendWhatsApp(text: string): Promise<{ ok: boolean; error?: string }> {
  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) {
    console.log("[whatsapp] not configured, message not sent:\n" + text);
    return { ok: false, error: "WhatsApp belum dikonfigurasi (CALLMEBOT_PHONE / CALLMEBOT_APIKEY)." };
  }
  const url =
    "https://api.callmebot.com/whatsapp.php" +
    `?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text();
    if (!res.ok || /error|invalid/i.test(body.slice(0, 500))) {
      console.error("[whatsapp] failed", res.status, body.slice(0, 300));
      return { ok: false, error: `CallMeBot gagal (${res.status}).` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[whatsapp] error", e);
    return { ok: false, error: "Tidak bisa menghubungi CallMeBot." };
  }
}
