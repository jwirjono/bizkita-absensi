import { CABANG, PUSH, WHATSAPP } from "@/config/app.config";
import {
  cutoffMessage,
  monthlyRecapMessage,
  openingMessage,
  pushCutoffMessage,
  pushMonthlyMessage,
  pushOpenMessage,
  pushRekapMessage,
  rekapTelatMessage,
} from "@/config/messages";
import { buildDailyReport, buildMonthlyRows, cleanupOldMonths, getDayRecords } from "@/lib/attendance";
import { activeKaryawan, scheduleFor } from "@/lib/karyawan";
import { allPush, sendPush } from "@/lib/push";
import { fail, handle, ok } from "@/lib/http";
import { KEYS, redis } from "@/lib/redis";
import { fromMinutes, isLastDayOfMonth, monthLabel, nowParts, toMinutes } from "@/lib/time";
import { sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** until: optional "HH:mm" after which this job is no longer sent (default: time + missedWindowMinutes). */
type Job = { key: string; time: string; until?: string; run: () => Promise<{ ok: boolean; error?: string }> };

/**
 * Daily WhatsApp scheduler. Safe to call as often as you like (cron-job.org every 5 minutes):
 * each message is sent ONCE per day, as soon as its time is reached.
 *   - each cabang at its openTime → cabang group (reminder + absen list)
 *   - each cabang at openTime + toleranceMinutes → cabang group (cutoff + updated list)
 *   - rekap telat at WHATSAPP.rekapTelat.time → rekap group (+ monthly recap on the last day)
 * Phone notifications (PUSH config), per karyawan who has notifications on:
 *   - at their own jam masuk, and at jam masuk + toleransi, only if they haven't absen yet
 *   - rekap at PUSH.adminRekapTime → admin phones
 * On the last day of the month, old months are cleaned up (independent of any channel).
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
        // once the cutoff message is due, the opening reminder is no longer useful
        until: WHATSAPP.sendCutoffMessage ? fromMinutes(toMinutes(c.openTime) + c.toleranceMinutes) : undefined,
        run: async () => {
          const report = await buildDailyReport(now.date);
          const day = report.cabang.find((x) => x.id === c.id)!;
          return sendWhatsApp(c.whatsappGroup, openingMessage(day, report.dateLabel, WHATSAPP.appUrl));
        },
      });
    }
  }

  if (WHATSAPP.sendCutoffMessage) {
    for (const c of CABANG) {
      if (!c.whatsappGroup) continue;
      const cutoff = fromMinutes(toMinutes(c.openTime) + c.toleranceMinutes);
      jobs.push({
        key: `cutoff:${c.id}`,
        time: cutoff,
        run: async () => {
          const report = await buildDailyReport(now.date);
          const day = report.cabang.find((x) => x.id === c.id)!;
          return sendWhatsApp(c.whatsappGroup, cutoffMessage(day, report.dateLabel, cutoff));
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
        return sendWhatsApp(rt.group, text);
      },
    });
  }

  if (PUSH.enabled) {
    for (const k of await activeKaryawan()) {
      const s = scheduleFor(k);
      const cutoff = fromMinutes(toMinutes(s.openTime) + s.toleranceMinutes);
      // Sends to this karyawan's phones, but only while they still haven't absen today.
      const remind = (msg: ReturnType<typeof pushOpenMessage>) => async () => {
        if ((await getDayRecords(now.date)).some((r) => r.id === k.id)) return { ok: true };
        return sendPush((await allPush()).filter((p) => p.karyawanId === k.id), msg);
      };
      if (PUSH.remindAtOpen) {
        jobs.push({
          key: `push-open:${k.id}`,
          time: s.openTime,
          until: PUSH.remindAtCutoff ? cutoff : undefined,
          run: remind(pushOpenMessage({ cabang: s.cabang.name, openTime: s.openTime, cutoff })),
        });
      }
      if (PUSH.remindAtCutoff) {
        jobs.push({ key: `push-cutoff:${k.id}`, time: cutoff, run: remind(pushCutoffMessage({ cabang: s.cabang.name, cutoff })) });
      }
    }
    if (PUSH.adminRekap) {
      jobs.push({
        key: "push-rekap",
        time: PUSH.adminRekapTime,
        run: async () => {
          const admins = (await allPush()).filter((p) => p.admin);
          const r = await sendPush(admins, pushRekapMessage(await buildDailyReport(now.date)));
          if (r.ok && PUSH.adminMonthlyOnLastDay && isLastDayOfMonth(now.date)) {
            return sendPush(admins, pushMonthlyMessage(monthLabel(now.month), await buildMonthlyRows(now.month)));
          }
          return r;
        },
      });
    }
  }

  if (isLastDayOfMonth(now.date)) {
    // after the 12:00 rekap has been built from this month's data
    jobs.push({ key: "cleanup", time: "13:00", run: async () => (await cleanupOldMonths(now.month), { ok: true }) });
  }

  const results: Record<string, string> = {};
  for (const job of jobs) {
    const start = toMinutes(job.time);
    if (now.minutes < start) {
      results[job.key] = `menunggu ${job.time}`;
      continue;
    }
    const end = job.until ? toMinutes(job.until) : start + WHATSAPP.missedWindowMinutes;
    if (now.minutes >= end) {
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
