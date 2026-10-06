import { getDayRecords } from "@/lib/attendance";
import { enrolledIds } from "@/lib/face";
import { handle, ok } from "@/lib/http";
import { activeKaryawan } from "@/lib/karyawan";
import { nowParts } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Dropdown list: active karyawan, whether they have face data, and today's absen (if any). */
export const GET = handle(async () => {
  const today = nowParts();
  const [enrolled, records] = await Promise.all([enrolledIds(), getDayRecords(today.date)]);
  return ok({
    today: today.date,
    karyawan: activeKaryawan().map((k) => {
      const r = records.find((x) => x.id === k.id);
      return {
        id: k.id,
        name: k.name,
        enrolled: enrolled.has(k.id),
        absen: r ? { time: r.time, late: r.late, lateMinutes: r.lateMinutes, cabangName: r.cabangName } : null,
      };
    }),
  });
});
