# Absensi Barberworks

Simple attendance app: pick name → selfie (face match) + GPS → on time / telat → WhatsApp to the owner.

- `/` — karyawan absen page (first time: terms of use + face registration)
- `/admin` — daily list, monthly recap, Excel export, reset face (protected by `ADMIN_PIN`)

## Where to change things

| What | File |
|---|---|
| Cabang (location, radius, jam buka, toleransi) | `config/app.config.ts` → `CABANG` |
| Karyawan list | `/admin` → Karyawan |
| WhatsApp group per cabang | `config/app.config.ts` → `CABANG[].whatsappGroup` |
| Rekap telat group and time (12:00) | `config/app.config.ts` → `WHATSAPP.rekapTelat` |
| Absen opens X minutes before jam masuk | `config/app.config.ts` → `ABSEN.opensMinutesBefore` |
| Face strictness, GPS accuracy, data retention | `config/app.config.ts` |
| WhatsApp message text, Terms of Use | `config/messages.ts` |
| Secrets (Redis, admin PIN, WhatsApp key) | Vercel → Settings → Environment Variables (see `.env.example`) |

After editing a file: commit and push. Vercel redeploys automatically.

### Karyawan
Managed on `/admin` → **Karyawan** (stored in the database, not in a config file):
- **+ Tambah karyawan:** name, cabang, optional own jam masuk and toleransi (empty = follow the cabang).
- **Edit:** change any of those, or untick **Aktif** to hide someone without losing history.
- **Hapus:** removes the karyawan and their face data. Absen history stays in reports.

They can only absen at their own cabang, and telat is counted from their own jam masuk (or the cabang's).
New karyawan register their face on first use.

`lib/seed-karyawan.ts` imported the old config list once (same ids, so existing face data and absen history stay linked).
After the first deploy it can be deleted together with the `seedOnce` calls in `lib/karyawan.ts`.

## First-time setup

1. **Push to GitHub** and import the repo in Vercel (Add New → Project).
2. **Database:** Vercel project → Storage → Create Database → **Upstash Redis** (free) → connect to the project.
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` are added automatically.
3. **WhatsApp (Fonnte):** sign up at https://fonnte.com → Device → add device with the sender number
   (use a spare number) → scan the QR code from WhatsApp → copy the device **Token**.
   The sender number must be a member of any group you want to post to.
4. **Environment variables** (Vercel → Settings → Environment Variables, tick Production):
   - `ADMIN_PIN` — your admin PIN
   - `FONNTE_TOKEN` — from step 3
   - `CRON_SECRET` — any long random string
5. **Real coordinates:** replace the `lat`/`lng` placeholders in `CABANG`.
6. **Group IDs:** add the sender number to each group, redeploy, open `/admin` → WhatsApp →
   "Tampilkan tujuan dan grup WhatsApp", copy each group ID into `config/app.config.ts`
   (`CABANG[].whatsappGroup` and `WHATSAPP.rekapTelat.group`), push.
   Test with the "Kirim … sekarang" buttons on `/admin`.
7. **Scheduler (cron-job.org, free):** Vercel Hobby cron can be up to 59 minutes late, so use cron-job.org for exact times:
   - Create a cronjob: URL `https://bizkita-absensi.vercel.app/api/cron/notify`, every **5 minutes**.
   - Advanced → Headers → add `Authorization` = `Bearer <your CRON_SECRET>`.
   - The endpoint sends each message once a day as soon as its time is reached, so calling it often is safe.
   - The Vercel cron in `vercel.json` (12:00–12:59 WIB) stays as a backup for the rekap telat.

## WhatsApp messages (only these, once a day each)

- **Each cabang at its jam buka** → its own group: "Jangan lupa absen" link + absen list of that cabang.
- **Rekap telat at 12:00** → rekap group: who was telat per cabang + who hasn't absen. On the last day of the month the monthly recap is added to this message.

Instant late/new-face alerts are off (`WHATSAPP.sendLateAlert`, `sendEnrollAlert`).
Fonnte free plan: 1,000 messages/month, with a small Fonnte watermark. Lite (Rp 25k) removes it.

## Phone notifications (web push)

Free notifications from the site itself, no WhatsApp needed. Settings: `config/app.config.ts` → `PUSH`.
- **Karyawan:** pick name on the absen page → **Aktifkan pengingat absen**. They get a reminder at their own jam masuk and at
  the telat cutoff, only if they haven't absen yet.
- **Admin:** `/admin` → **Notifikasi HP** → **Aktifkan notifikasi admin di HP ini**. Gets the rekap at `PUSH.adminRekapTime`
  (+ monthly recap on the last day). "Kirim tes" checks it works; the list shows every registered phone.
- **iPhone (iOS 16.4+):** open the site in Safari → Share → **Add to Home Screen** → open **Absensi** from the icon → then tap Aktifkan.
- **Server:** set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Vercel (generated once, see `.env.example`).
- **Scheduler:** because each karyawan can have their own jam masuk, call `/api/cron/notify` every 5 minutes
  (cron-job.org crontab `*/5 6-13 * * *`, timezone Asia/Jakarta).

## How it works

- **Automatic photo:** the camera checks frames continuously and takes the photo by itself once the face is
  close, centered and clear for a few frames in a row (thresholds in `FACE.auto`). The guide ring turns green when ready.
  First-time registration takes 3 photos automatically, then goes straight into absen.
- **Face:** `face-api.js` runs in the phone browser and turns the selfie into 128 numbers. The server compares them with
  the 3 samples saved at registration. Registration happens once per name. Only admin can reset it.
  A face that's already registered to another name is rejected.
- **GPS:** the server checks the distance to the karyawan's own cabang and rejects absen outside its `radiusMeters`.
- **Time:** always the server clock in WIB, so changing the phone clock does nothing.
- **Absen window:** opens `ABSEN.opensMinutesBefore` (60) minutes before the karyawan's jam masuk; earlier attempts are rejected.
- **Telat:** after `openTime + toleranceMinutes` of the karyawan (falls back to the cabang's). "Telat X menit" is counted from `openTime`.
- **Data:** Upstash Redis. Absen is stored per month (`absen:YYYY-MM`). On the last day of each month, after the rekap is sent,
  months older than `RETENTION.keepPreviousMonths` are deleted.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Redis values from Upstash
npm run dev
```

Camera and GPS work on `localhost` and on the Vercel HTTPS URL, not on plain `http://` LAN addresses.

## Limits to know

- Face check stops "titip absen" but isn't anti-spoof: a good photo of a coworker on another screen might pass.
  GPS + the face check together make it hard enough for a small team.
- GPS can be faked with special apps on Android. That's rare, but possible.
