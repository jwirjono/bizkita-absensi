/**
 * ============================================================
 *  BIZKITA ABSENSI — MAIN CONFIG
 *  Edit this file to change cabang, jam buka, toleransi,
 *  karyawan, and WhatsApp message text.
 *  After editing: commit + push → Vercel redeploys automatically.
 *
 *  Secrets (Redis keys, admin PIN, WhatsApp API key) are NOT here.
 *  They live in Vercel → Project → Settings → Environment Variables.
 *  See .env.example.
 * ============================================================
 */

// ------------------------------------------------------------
// 1. GENERAL
// ------------------------------------------------------------
export const APP = {
  name: "Absensi Barberworks",
  /** All times are calculated in this timezone (server clock, not the phone clock). */
  timezone: "Asia/Jakarta",
  timezoneLabel: "WIB",
};

// ------------------------------------------------------------
// 2. CABANG
//    - lat/lng: Google Maps → long-press the shop → copy the numbers.
//    - radiusMeters: how far from the shop karyawan may absen (1000 = 1 km).
//    - openTime: jam buka (HH:mm, 24h).
//    - toleranceMinutes: absen after openTime + tolerance = TELAT.
//      "Telat X menit" is counted from openTime.
// ------------------------------------------------------------
export type Cabang = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  openTime: string;
  toleranceMinutes: number;
};

export const CABANG: Cabang[] = [
  {
    id: "tubagus",
    name: "Tubagus",
    lat: -6.865756666417696, // TODO: replace with real coordinates
    lng: 109.13411926216462,
    radiusMeters: 100, // 1 km
    openTime: "10:00",
    toleranceMinutes: 15,
  },
  {
    id: "rancabolang",
    name: "Rancabolang",
    lat: -6.9455, // TODO: replace with real coordinates
    lng: 107.6633,
    radiusMeters: 100, // 1 km
    openTime: "09:00",
    toleranceMinutes: 15,
  },
];

// ------------------------------------------------------------
// 3. KARYAWAN
//    - id: short, unique, never change it once used (face data is stored under it).
//    - name: shown in the dropdown and WhatsApp messages.
//    - cabang: the cabang id (from CABANG above) this karyawan works at.
//      They can ONLY absen at this cabang (GPS check).
//    - openTime (optional): this karyawan's own jam masuk. Leave it out to use the cabang's openTime.
//    - toleranceMinutes (optional): own tolerance. Leave it out to use the cabang's.
//    - active: set false to hide someone without deleting their history.
// ------------------------------------------------------------
export type Karyawan = {
  id: string;
  name: string;
  cabang: string;
  openTime?: string;
  toleranceMinutes?: number;
  active: boolean;
};

export const KARYAWAN: Karyawan[] = [
  { id: "jevon", name: "Jevon", cabang: "tubagus", active: true },
  { id: "budi", name: "Budi", cabang: "tubagus", openTime: "11:00", active: true },
  { id: "sari", name: "Sari", cabang: "rancabolang", active: true },
  // { id: "rina", name: "Rina", cabang: "rancabolang", openTime: "13:00", toleranceMinutes: 10, active: true },
];

// ------------------------------------------------------------
// 4. FACE RECOGNITION
//    matchThreshold: lower = stricter. 0.45–0.55 is normal.
//      If real karyawan often get "wajah tidak cocok", raise to 0.55.
//      If you worry about look-alikes, lower to 0.45.
//    enrollSamples: how many selfies taken during onboarding.
// ------------------------------------------------------------
export const FACE = {
  matchThreshold: 0.5,
  enrollSamples: 3,
  /**
   * Automatic photo: the camera takes the photo by itself when the face is clear and steady.
   *   minScore: detector confidence 0–1 (higher = needs a clearer face).
   *   minFaceWidth: face width as a fraction of the camera frame (higher = must be closer).
   *   steadyFrames: how many good frames in a row before taking the photo.
   *   sampleGapMs: pause between registration photos (so the 3 photos differ a little).
   *   scanIntervalMs: how often the camera checks for a face.
   */
  auto: {
    minScore: 0.6,
    minFaceWidth: 0.22,
    steadyFrames: 3,
    sampleGapMs: 800,
    scanIntervalMs: 200,
  },
  /** face-api library + model files, loaded from CDN (no files in this repo). */
  libUrl: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js",
  modelUrl: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/",
};

// ------------------------------------------------------------
// 5. GPS
//    maxAccuracyMeters: reject when the phone's GPS is too imprecise
//    (e.g. indoor with GPS off, only wifi/cell location).
// ------------------------------------------------------------
export const GPS = {
  maxAccuracyMeters: 150,
};

// ------------------------------------------------------------
// 6. WHATSAPP (via Fonnte)
//    WHO receives messages (numbers / group IDs) is set in Vercel env WHATSAPP_TARGETS.
//    Turn individual notifications on/off here.
//    The daily summary TIME is set in vercel.json ("crons" → "schedule", in UTC).
//      12:00 WIB = "0 5 * * *"   (WIB = UTC+7)
// ------------------------------------------------------------
export const WHATSAPP = {
  sendLateAlert: true, // instant message when someone absen telat
  sendEnrollAlert: true, // instant message when a new face is registered
  sendDailySummary: true, // daily summary (cron)
  sendMonthlyRecap: true, // on the last day of the month (cron)
};

// ------------------------------------------------------------
// 7. DATA RETENTION
//    Absen data is stored per month. On the last day of each month,
//    after the recap is sent, months older than this are deleted.
//    1 = keep this month + last month.
// ------------------------------------------------------------
export const RETENTION = {
  keepPreviousMonths: 1,
};
