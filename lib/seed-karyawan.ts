/**
 * ONE-TIME IMPORT of the karyawan that used to live in config/app.config.ts.
 * Runs automatically once, the first time the karyawan list is read after deploy.
 * The ids are the same as before, so existing face data and absen history stay linked.
 *
 * After it has run in production (karyawan visible on /admin), this file can be deleted:
 * remove it and the `seedOnce` call in lib/karyawan.ts.
 */
import type { Karyawan } from "./karyawan";

export const SEED_KARYAWAN: Karyawan[] = [
  { id: "bryan", name: "Bryan", cabang: "tubagus", active: true },
  { id: "galih", name: "Galih", cabang: "tubagus", active: true },
  { id: "didi", name: "Didi", cabang: "tubagus", active: true },
  { id: "septian", name: "Septian", cabang: "tubagus", openTime: "11:00", active: true },
  { id: "duki", name: "Duki", cabang: "rancabolang", active: true },
  { id: "feriyan", name: "Feriyan", cabang: "rancabolang", active: true },
];
