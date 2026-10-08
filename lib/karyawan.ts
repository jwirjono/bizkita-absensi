import { CABANG, type Cabang } from "@/config/app.config";
import { KEYS, redis } from "./redis";
import { SEED_KARYAWAN } from "./seed-karyawan";

/**
 * Karyawan are stored in Redis (hash "karyawan", field = id) and managed on /admin.
 *   id:               never changes (face data and absen history are stored under it)
 *   cabang:           cabang id from config CABANG; karyawan can only absen there
 *   openTime:         own jam masuk (optional, else the cabang's)
 *   toleranceMinutes: own tolerance (optional, else the cabang's)
 *   active:           false = hidden from the dropdown and reports, history kept
 */
export type Karyawan = {
  id: string;
  name: string;
  cabang: string;
  openTime?: string;
  toleranceMinutes?: number;
  active: boolean;
};

export type Schedule = { cabang: Cabang; openTime: string; toleranceMinutes: number };

/** Cabang + jam masuk + toleransi for a karyawan (own values override the cabang's). */
export function scheduleFor(k: Karyawan): Schedule {
  const cabang = CABANG.find((c) => c.id === k.cabang) ?? CABANG[0];
  return {
    cabang,
    openTime: k.openTime ?? cabang.openTime,
    toleranceMinutes: k.toleranceMinutes ?? cabang.toleranceMinutes,
  };
}

/** Imports the old config list once. Never overwrites karyawan that already exist in the DB. */
let seeded = false;
async function seedOnce() {
  if (seeded) return;
  const first = await redis().set(KEYS.karyawanSeeded, new Date().toISOString(), { nx: true });
  if (first === "OK") {
    for (const k of SEED_KARYAWAN) await redis().hsetnx(KEYS.karyawan, k.id, k);
  }
  seeded = true;
}

export async function allKaryawan(): Promise<Karyawan[]> {
  await seedOnce();
  const h = await redis().hgetall<Record<string, Karyawan>>(KEYS.karyawan);
  return Object.values(h ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}

export const activeKaryawan = async () => (await allKaryawan()).filter((k) => k.active);

/** Active karyawan by id, or undefined. */
export async function findKaryawan(id: unknown) {
  if (typeof id !== "string") return undefined;
  await seedOnce();
  const k = await redis().hget<Karyawan>(KEYS.karyawan, id);
  return k?.active ? k : undefined;
}

export async function karyawanName(id: string) {
  await seedOnce();
  return (await redis().hget<Karyawan>(KEYS.karyawan, id))?.name ?? id;
}

/** "Budi Santoso" → "budi-santoso" (unique: adds -2, -3 … if taken). */
async function newId(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "karyawan";
  for (let i = 1; ; i++) {
    const id = i === 1 ? base : `${base}-${i}`;
    if (!(await redis().hexists(KEYS.karyawan, id))) return id;
  }
}

/** Validates form input. Returns the cleaned karyawan (without id) or an error message. */
export function validateKaryawan(input: Record<string, unknown>): { ok: true; value: Omit<Karyawan, "id"> } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 40) return { ok: false, error: "Nama harus 2–40 karakter." };
  if (!CABANG.some((c) => c.id === input.cabang)) return { ok: false, error: "Pilih cabang." };
  const openTime = typeof input.openTime === "string" && input.openTime ? input.openTime : undefined;
  if (openTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime)) return { ok: false, error: "Jam masuk harus format HH:mm." };
  const tol = input.toleranceMinutes;
  const toleranceMinutes = tol === "" || tol === null || tol === undefined ? undefined : Number(tol);
  if (toleranceMinutes !== undefined && (!Number.isInteger(toleranceMinutes) || toleranceMinutes < 0 || toleranceMinutes > 180)) {
    return { ok: false, error: "Toleransi harus 0–180 menit." };
  }
  const value: Omit<Karyawan, "id"> = { name, cabang: input.cabang as string, active: input.active !== false };
  if (openTime) value.openTime = openTime;
  if (toleranceMinutes !== undefined) value.toleranceMinutes = toleranceMinutes;
  return { ok: true, value };
}

export async function createKaryawan(value: Omit<Karyawan, "id">) {
  await seedOnce();
  const k: Karyawan = { id: await newId(value.name), ...value };
  await redis().hset(KEYS.karyawan, { [k.id]: k });
  return k;
}

export async function updateKaryawan(id: string, value: Omit<Karyawan, "id">) {
  if (!(await redis().hexists(KEYS.karyawan, id))) return null;
  const k: Karyawan = { id, ...value };
  await redis().hset(KEYS.karyawan, { [id]: k });
  return k;
}

/** Removes the karyawan from the list. Absen history is kept (reports still show the name). */
export async function deleteKaryawan(id: string) {
  await redis().hdel(KEYS.karyawan, id);
}
