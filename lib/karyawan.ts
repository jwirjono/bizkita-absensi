import { CABANG, KARYAWAN, type Cabang, type Karyawan } from "@/config/app.config";

export type Schedule = { cabang: Cabang; openTime: string; toleranceMinutes: number };

/** Cabang + jam masuk + toleransi for a karyawan (own values override the cabang's). */
export function scheduleFor(k: Karyawan): Schedule {
  const cabang = CABANG.find((c) => c.id === k.cabang)!;
  return {
    cabang,
    openTime: k.openTime ?? cabang.openTime,
    toleranceMinutes: k.toleranceMinutes ?? cabang.toleranceMinutes,
  };
}

export const activeKaryawan = () => KARYAWAN.filter((k) => k.active);

export const findKaryawan = (id: unknown) =>
  typeof id === "string" ? KARYAWAN.find((k) => k.id === id && k.active) : undefined;

/** Any karyawan (including inactive) — used for names in reports. */
export const karyawanName = (id: string) => KARYAWAN.find((k) => k.id === id)?.name ?? id;

// Fail the build early if the config has a typo.
for (const k of KARYAWAN) {
  if (!CABANG.some((c) => c.id === k.cabang)) {
    throw new Error(`config/app.config.ts: karyawan "${k.id}" has unknown cabang "${k.cabang}".`);
  }
  if (k.openTime && !/^\d{2}:\d{2}$/.test(k.openTime)) {
    throw new Error(`config/app.config.ts: karyawan "${k.id}" openTime must be HH:mm.`);
  }
}
if (new Set(KARYAWAN.map((k) => k.id)).size !== KARYAWAN.length) {
  throw new Error("config/app.config.ts: karyawan ids must be unique.");
}
