import { KARYAWAN } from "@/config/app.config";

export const activeKaryawan = () => KARYAWAN.filter((k) => k.active);

export const findKaryawan = (id: unknown) =>
  typeof id === "string" ? KARYAWAN.find((k) => k.id === id && k.active) : undefined;

/** Any karyawan (including inactive) — used for names in reports. */
export const karyawanName = (id: string) => KARYAWAN.find((k) => k.id === id)?.name ?? id;
