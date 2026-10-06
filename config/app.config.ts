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
//    - whatsappGroup: group ID that receives the daily absen list at openTime.
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
  /** WhatsApp group that gets this cabang's message at openTime. Find IDs on /admin → WhatsApp. */
  whatsappGroup: string;
};

export const CABANG: Cabang[] = [
  {
    id: "tubagus",
    name: "Tubagus",
    lat: -6.883917916145388,  // TODO: replace with real coordinates
    lng: 107.61464297566627,
    radiusMeters: 200,
    openTime: "10:00",
    toleranceMinutes: 15,
    whatsappGroup: "120363417213352511@g.us", // e.g. "120363012345678901@g.us"
  },
  {
    id: "rancabolang",
    name: "Rancabolang",
    lat: -6.947712224687879,  // TODO: replace with real coordinates
    lng: 107.66266731524868,
    radiusMeters: 200,
    openTime: "09:00",
    toleranceMinutes: 15,
    whatsappGroup: "120363322320817802@g.us", // e.g. "120363012345678901@g.us"
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
  { id: "bryan", name: "Bryan", cabang: "tubagus", active: true },
  { id: "galih", name: "Galih", cabang: "tubagus", active: true },
  { id: "didi", name: "Didi", cabang: "tubagus", active: true },
  { id: "septian", name: "Septian", cabang: "tubagus", openTime: "11:00", active: true },
  { id: "duki", name: "Duki", cabang: "rancabolang", active: true },
  { id: "feriyan", name: "Feriyan", cabang: "rancabolang", active: true },
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
// 6. ABSEN WINDOW
//    opensMinutesBefore: absen opens this many minutes before the karyawan's jam masuk.
//    60 = karyawan masuk 10:00 can absen from 09:00. Earlier attempts are rejected.
// ------------------------------------------------------------
export const ABSEN = {
  opensMinutesBefore: 60,
};

// ------------------------------------------------------------
// 7. WHATSAPP (via Fonnte — token in Vercel env FONNTE_TOKEN)
//    Exactly these messages are sent, each once a day:
//      a) Each cabang, at its openTime → its own whatsappGroup (set in CABANG above):
//         reminder link + absen list of that cabang.
//      a2) Each cabang, at openTime + toleranceMinutes (telat cutoff) → same group:
//         "batas absen sudah lewat" + updated absen list.
//      b) Rekap telat, at rekapTelat.time → rekapTelat.group (all cabang).
//         On the last day of the month the monthly recap is added to this same message.
//    Timing: an external scheduler (cron-job.org, see README) calls /api/cron/notify
//    every 5 minutes; each message is sent once, as soon as its time is reached.
//    missedWindowMinutes: if the scheduler was down, skip a message that is this late.
// ------------------------------------------------------------
export const WHATSAPP = {
  appUrl: "https://bizkita-absensi.vercel.app/",
  sendOpeningMessage: true,
  sendCutoffMessage: true,
  rekapTelat: {
    enabled: true,
    time: "12:00",
    group: "120363421683129635@g.us", // e.g. "120363012345678901@g.us"
    includeMonthlyOnLastDay: true,
  },
  missedWindowMinutes: 120,
  /** Extra instant messages (to rekapTelat.group). Off = only the daily messages above. */
  sendLateAlert: false,
  sendEnrollAlert: false,
};

// ------------------------------------------------------------
// 8. DATA RETENTION
//    Absen data is stored per month. On the last day of each month,
//    after the recap is sent, months older than this are deleted.
//    1 = keep this month + last month.
// ------------------------------------------------------------
export const RETENTION = {
  keepPreviousMonths: 1,
};
