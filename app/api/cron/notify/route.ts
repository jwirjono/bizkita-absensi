import { CABANG, WHATSAPP } from "@/config/app.config";
import { monthlyRecapMessage, openingMessage, rekapTelatMessage } from "@/config/messages";
import { buildDailyReport, buildMonthlyRows, cleanupOldMonths } from "@/lib/attendance";
import { fail, handle, ok } from "@/lib/http";
import { KEYS, redis } from "@/lib/redis";
import { isLastDayOfMonth, monthLabel, nowParts, toMinutes } from "@/lib/time";
import { sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type Job = { key: string; time: string; run: () => Promise<{ ok: boolean; error?: string }> };

/**
 * Daily WhatsApp scheduler. Safe to call as often as you like (cron-job.org every 5 minutes):
 * each message is sent ONCE per day, as soon as its time is reached.
 *   - each cabang at its openTime → cabang group (reminder + absen list)
 *   - rekap telat at WHATSAPP.rekapTelat.time → rekap group (+ monthly recap on the last day)
 */
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("CRON_SECRET belum diset.", 500);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return fail("Unauthorized", 401);

  const now = nowParts();
  const jobs: Job[] = [];

  if (WHATSAPP.sendOpeningMessage) {
    for (const c of CABANG) {
      if (!c.whatsappGroup) continue;
      jobs.push({
        key: `open:${c.id}`,
        time: c.openTime,
        run: async () => {
          const report = await buildDailyReport(now.date);
          const day = report.cabang.find((x) => x.id === c.id)!;
          return sendWhatsApp(c.whatsappGroup, openingMessage(day, report.dateLabel, WHATSAPP.appUrl));
        },
      });
    }
  }

  const rt = WHATSAPP.rekapTelat;
  if (rt.enabled && rt.group) {
    jobs.push({
      key: "rekap-telat",
      time: rt.time,
      run: async () => {
        let text = rekapTelatMessage(await buildDailyReport(now.date));
        const lastDay = isLastDayOfMonth(now.date);
        if (lastDay && rt.includeMonthlyOnLastDay) {
          text += "\n\n" + monthlyRecapMessage(monthLabel(now.month), await buildMonthlyRows(now.month));
        }
        const r = await sendWhatsApp(rt.group, text);
        if (r.ok && lastDay) await cleanupOldMonths(now.month);
        return r;
      },
    });
  }

  const results: Record<string, string> = {};
  for (const job of jobs) {
    const start = toMinutes(job.time);
    if (now.minutes < start) {
      results[job.key] = `menunggu ${job.time}`;
      continue;
    }
    if (now.minutes > start + WHATSAPP.missedWindowMinutes) {
      results[job.key] = "terlewat";
      continue;
    }
    // Claim the job for today; if another call already did, skip.
    const claimed = await redis().set(KEYS.sent(now.date, job.key), now.iso, { nx: true, ex: 60 * 60 * 48 });
    if (claimed !== "OK") {
      results[job.key] = "sudah terkirim";
      continue;
    }
    const r = await job.run();
    if (!r.ok) await redis().del(KEYS.sent(now.date, job.key)); // retry on the next call
    results[job.key] = r.ok ? "terkirim" : `gagal: ${r.error}`;
  }

  return ok({ date: now.date, time: now.time, results });
});
