import { Redis } from "@upstash/redis";

let client: Redis | null = null;

/** Upstash Redis client. Env vars are added automatically by the Vercel Marketplace integration. */
export function redis() {
  if (client) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis belum dikonfigurasi (KV_REST_API_URL / KV_REST_API_TOKEN).");
  client = new Redis({ url, token });
  return client;
}

/** All Redis key names in one place. */
export const KEYS = {
  karyawan: "karyawan", // hash, field = karyawan id → Karyawan
  karyawanSeeded: "karyawan:seeded", // set once the old config list has been imported
  enrolled: "faces:enrolled", // set of karyawan ids with face data
  face: (id: string) => `face:${id}`, // FaceRecord
  facePhoto: (id: string) => `facephoto:${id}`, // small jpeg data URL
  absenMonth: (month: string) => `absen:${month}`, // hash, field = "DD:id"
  absenField: (day: string, id: string) => `${day}:${id}`,
  sent: (date: string, job: string) => `sent:${date}:${job}`, // marks a daily WhatsApp message as sent
};
