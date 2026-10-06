import { WHATSAPP } from "@/config/app.config";
import { dailySummaryMessage, monthlyRecapMessage } from "@/config/messages";
import { buildDailyReport, buildMonthlyRows, cleanupOldMonths } from "@/lib/attendance";
import { fail, handle, ok } from "@/lib/http";
import { isLastDayOfMonth, monthLabel, nowParts } from "@/lib/time";
import { sendWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Called by Vercel Cron once a day (schedule in vercel.json).
 * - sends the daily summary
 * - on the last day of the month: sends the monthly recap and deletes old months
 */
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("CRON_SECRET belum diset.", 500);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return fail("Unauthorized", 401);

  const now = nowParts();
  const result: Record<string, unknown> = { date: now.date };

  if (WHATSAPP.sendDailySummary) {
    result.daily = await sendWhatsApp(dailySummaryMessage(await buildDailyReport(now.date)));
  }
  if (isLastDayOfMonth(now.date)) {
    if (WHATSAPP.sendMonthlyRecap) {
      result.monthly = await sendWhatsApp(monthlyRecapMessage(monthLabel(now.month), await buildMonthlyRows(now.month)));
    }
    result.deletedKeys = await cleanupOldMonths(now.month);
  }
  return ok(result);
});
