import { getDayRecords } from "@/lib/attendance";
import { enrolledIds } from "@/lib/face";
import { handle, ok } from "@/lib/http";
import { activeKaryawan, scheduleFor } from "@/lib/karyawan";
import { ABSEN } from "@/config/app.config";
import { fromMinutes, nowParts, toMinutes } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Dropdown list: active karyawan, whether they have face data, and today's absen (if any). */
export const GET = handle(async () => {
  const today = nowParts();
  const [enrolled, records] = await Promise.all([enrolledIds(), getDayRecords(today.date)]);
  return ok({
    today: today.date,
    karyawan: activeKaryawan().map((k) => {
      const r = records.find((x) => x.id === k.id);
      const s = scheduleFor(k);
      const opensAt = toMinutes(s.openTime) - ABSEN.opensMinutesBefore;
      return {
        id: k.id,
        name: k.name,
        cabangName: s.cabang.name,
        openTime: s.openTime,
        opensAt: fromMinutes(opensAt),
        canAbsenNow: today.minutes >= opensAt,
        enrolled: enrolled.has(k.id),
        absen: r ? { time: r.time, late: r.late, lateMinutes: r.lateMinutes, cabangName: r.cabangName } : null,
      };
    }),
  });
});
