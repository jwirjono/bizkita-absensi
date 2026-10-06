import { FACE } from "@/config/app.config";
import { KEYS, redis } from "./redis";

export type FaceRecord = {
  descriptors: number[][];
  enrolledAt: string;
  consentAt: string;
};

export function isDescriptor(d: unknown): d is number[] {
  return Array.isArray(d) && d.length === 128 && d.every((x) => typeof x === "number" && Number.isFinite(x));
}

function euclidean(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Smallest distance between a descriptor and any of the stored samples. */
export function bestDistance(d: number[], samples: number[][]) {
  return Math.min(...samples.map((s) => euclidean(d, s)));
}

export const isMatch = (distance: number) => distance <= FACE.matchThreshold;

export async function getFace(id: string) {
  return redis().get<FaceRecord>(KEYS.face(id));
}

export async function enrolledIds(): Promise<Set<string>> {
  return new Set((await redis().smembers(KEYS.enrolled)) as string[]);
}

/** Returns the id of another enrolled karyawan with this face, if any. */
export async function findDuplicateFace(descriptors: number[][], exceptId: string) {
  const ids = [...(await enrolledIds())].filter((id) => id !== exceptId);
  if (!ids.length) return null;
  const records = await redis().mget<(FaceRecord | null)[]>(...ids.map(KEYS.face));
  for (let i = 0; i < ids.length; i++) {
    const rec = records[i];
    if (!rec) continue;
    if (descriptors.some((d) => isMatch(bestDistance(d, rec.descriptors)))) return ids[i];
  }
  return null;
}

/** Saves face data only if none exists yet. Returns false if already enrolled. */
export async function saveFace(id: string, record: FaceRecord, photo: string | null) {
  const created = await redis().set(KEYS.face(id), record, { nx: true });
  if (created !== "OK") return false;
  const tx = redis().multi();
  tx.sadd(KEYS.enrolled, id);
  if (photo) tx.set(KEYS.facePhoto(id), photo);
  await tx.exec();
  return true;
}

export async function resetFace(id: string) {
  const tx = redis().multi();
  tx.del(KEYS.face(id));
  tx.del(KEYS.facePhoto(id));
  tx.srem(KEYS.enrolled, id);
  await tx.exec();
}
