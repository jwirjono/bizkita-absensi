# Absensi Barberworks

Simple attendance app: pick name → selfie (face match) + GPS → on time / telat → WhatsApp to the owner.

- `/` — karyawan absen page (first time: terms of use + face registration)
- `/admin` — daily list, monthly recap, CSV export, reset face (protected by `ADMIN_PIN`)

## Where to change things

| What | File |
|---|---|
| Cabang (location, radius, jam buka, toleransi) | `config/app.config.ts` → `CABANG` |
| Karyawan list | `config/app.config.ts` → `KARYAWAN` |
| Face strictness, GPS accuracy, WhatsApp on/off, data retention | `config/app.config.ts` |
| WhatsApp message text, Terms of Use | `config/messages.ts` |
| Daily summary time | `vercel.json` → `crons.schedule` (UTC! 12:00 WIB = `0 5 * * *`) |
| Secrets (Redis, admin PIN, WhatsApp key) | Vercel → Settings → Environment Variables (see `.env.example`) |

After editing a file: commit and push. Vercel redeploys automatically.

### Adding a karyawan
Add a line to `KARYAWAN` in `config/app.config.ts`:

```ts
{ id: "rina", name: "Rina", cabang: "rancabolang", active: true },                    // uses cabang jam buka
{ id: "dodi", name: "Dodi", cabang: "tubagus", openTime: "13:00", active: true },     // own jam masuk
```

They can only absen at their own cabang, and telat is counted from their own `openTime` (or the cabang's if not set).
They'll appear in the dropdown and register their face on first use. A typo in the cabang id fails the build,
so a broken config never goes live.

### Removing a karyawan
Set `active: false` (keeps their history in reports). Then reset their face in `/admin`.

## First-time setup

1. **Push to GitHub** and import the repo in Vercel (Add New → Project).
2. **Database:** Vercel project → Storage → Create Database → **Upstash Redis** (free) → connect to the project.
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` are added automatically.
3. **WhatsApp (CallMeBot):** EACH person who should receive messages follows the steps at
   https://www.callmebot.com/blog/free-api-whatsapp-messages/ to get an API key for their number.
4. **Environment variables** (Vercel → Settings → Environment Variables):
   - `ADMIN_PIN` — your admin PIN
   - `CALLMEBOT_RECIPIENTS` — `phone:apikey` pairs, comma-separated, e.g. `081234567890:111111,081298765432:222222`
   - `CRON_SECRET` — any long random string
5. **Real coordinates:** replace the `lat`/`lng` placeholders in `CABANG`.
6. Redeploy, then open `/admin` and press "Kirim ringkasan ke WhatsApp" to test the WhatsApp setup.

## How it works

- **Automatic photo:** the camera checks frames continuously and takes the photo by itself once the face is
  close, centered and clear for a few frames in a row (thresholds in `FACE.auto`). The guide ring turns green when ready.
  First-time registration takes 3 photos automatically, then goes straight into absen.
- **Face:** `face-api.js` runs in the phone browser and turns the selfie into 128 numbers. The server compares them with
  the 3 samples saved at registration. Registration happens once per name. Only admin can reset it.
  A face that's already registered to another name is rejected, and the owner gets a WhatsApp message on every new registration.
- **GPS:** the server checks the distance to the karyawan's own cabang and rejects absen outside its `radiusMeters`.
- **Time:** always the server clock in WIB, so changing the phone clock does nothing.
- **Telat:** after `openTime + toleranceMinutes` of the karyawan (falls back to the cabang's). "Telat X menit" is counted from `openTime`.
- **Data:** Upstash Redis. Absen is stored per month (`absen:YYYY-MM`). On the last day of each month the cron sends the recap
  and deletes months older than `RETENTION.keepPreviousMonths`.
- **Cron (Vercel Hobby):** runs once a day and may fire any time within the scheduled hour.

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
