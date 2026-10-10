"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BrandHeader from "@/components/BrandHeader";
import Camera from "@/components/Camera";
import PushToggle from "@/components/PushToggle";
import { APP, FACE } from "@/config/app.config";
import { TERMS_OF_USE } from "@/config/messages";
import { checkFace, getPosition, loadFaceApi, sleep, snapshot } from "@/lib/face-client";

type Person = {
  id: string;
  name: string;
  cabangName: string;
  openTime: string;
  opensAt: string;
  canAbsenNow: boolean;
  enrolled: boolean;
  absen: { time: string; late: boolean; lateMinutes: number; cabangName: string } | null;
};
type Step = "pick" | "terms" | "enroll" | "absen" | "result";
type Result = { kind: "ok" | "late" | "info"; title: string; detail: string };
type Position = { lat: number; lng: number; accuracy: number };

const LAST_ID_KEY = "absensi:lastId";

async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false, error: "Server tidak merespons." }));
}

export default function Home() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [consent, setConsent] = useState(false);
  const [model, setModel] = useState<"loading" | "ready" | "error">("loading");
  const [clock, setClock] = useState("");

  // Auto-capture state
  const [scanning, setScanning] = useState(false);
  const [faceGood, setFaceGood] = useState(false);
  const [hint, setHint] = useState("");
  const [sampleCount, setSampleCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const samplesRef = useRef<number[][]>([]);
  const photoRef = useRef<string | null>(null);
  const gpsRef = useRef<Promise<Position> | null>(null);

  const person = people?.find((p) => p.id === selected);

  const loadPeople = useCallback(async () => {
    try {
      const data = await fetch("/api/karyawan", { cache: "no-store" }).then((r) => r.json());
      if (!data.ok) throw new Error(data.error);
      setPeople(data.karyawan);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data.");
    }
  }, []);

  useEffect(() => {
    loadPeople();
    loadFaceApi().then(() => setModel("ready"), () => setModel("error"));
    try {
      setSelected(localStorage.getItem(LAST_ID_KEY) ?? "");
    } catch {}
    const fmt = new Intl.DateTimeFormat("id-ID", { timeZone: APP.timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [loadPeople]);

  /** Starts reading GPS in the background so it's ready when the face is. */
  function startGps() {
    const p = getPosition();
    p.catch(() => {});
    gpsRef.current = p;
    return p;
  }

  function startScan() {
    samplesRef.current = [];
    photoRef.current = null;
    setSampleCount(0);
    setFaceGood(false);
    setHint("");
    setMsg(null);
    setScanning(true);
  }

  function reset() {
    setScanning(false);
    setStep("pick");
    setConsent(false);
    setMsg(null);
    setResult(null);
    gpsRef.current = null;
    loadPeople();
  }

  function next() {
    if (!person) return setMsg({ text: "Pilih nama kamu dulu.", error: true });
    try {
      localStorage.setItem(LAST_ID_KEY, person.id);
    } catch {}
    setMsg(null);
    if (person.absen) {
      setResult({
        kind: "info",
        title: `${person.name} sudah absen hari ini`,
        detail: `Jam ${person.absen.time} di ${person.absen.cabangName}${person.absen.late ? ` · telat ${person.absen.lateMinutes} menit` : ""}.`,
      });
      setStep("result");
    } else if (person.enrolled && !person.canAbsenNow) {
      setMsg({ text: `Absen ${person.name} baru dibuka jam ${person.opensAt} (jam masuk ${person.openTime}).`, error: true });
    } else if (person.enrolled) {
      setStep("absen");
      startGps();
      startScan();
    } else {
      setStep("terms");
    }
  }

  async function submitEnroll() {
    if (!person) return;
    setBusy(true);
    setMsg({ text: "Menyimpan data wajah…" });
    const res = await post("/api/enroll", { id: person.id, descriptors: samplesRef.current, photo: photoRef.current, consent: true });
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.error, error: true });
    loadPeople();
    // Continue straight to absen, still automatic.
    setStep("absen");
    startGps();
    startScan();
    setMsg({ text: "Wajah terdaftar. Lanjut absen otomatis…" });
  }

  async function submitAbsen(descriptor: number[]) {
    if (!person) return;
    setBusy(true);
    setMsg({ text: "Wajah terbaca. Memeriksa lokasi…" });
    try {
      const pos = await (gpsRef.current ?? startGps());
      const res = await post("/api/absen", { id: person.id, descriptor, ...pos });
      if (!res.ok) throw new Error(res.error);
      const r = res.record;
      setResult(
        r.late
          ? { kind: "late", title: `Telat ${r.lateMinutes} menit`, detail: `${r.name} · ${r.cabangName} · masuk ${r.openTime}, absen ${r.time} ${APP.timezoneLabel}. Laporan dikirim ke atasan.` }
          : { kind: "ok", title: "Absen berhasil, tepat waktu", detail: `${r.name} · ${r.cabangName} · ${r.time} ${APP.timezoneLabel}` },
      );
      setMsg(null);
      setStep("result");
    } catch (e) {
      gpsRef.current = null; // read GPS again on retry
      setMsg({ text: e instanceof Error ? e.message : "Gagal absen.", error: true });
    } finally {
      setBusy(false);
    }
  }

  // Auto-capture loop: checks camera frames and takes the photo when the face is good and steady.
  useEffect(() => {
    if (!scanning || model !== "ready" || (step !== "enroll" && step !== "absen")) return;
    let stopped = false;
    (async () => {
      let streak = 0;
      let lastSample = 0;
      while (!stopped) {
        const video = videoRef.current;
        if (video) {
          const f = await checkFace(video);
          if (stopped) return;
          setFaceGood(f.good);
          setHint(f.hint);
          streak = f.good ? streak + 1 : 0;

          if (f.good && f.descriptor && streak >= FACE.auto.steadyFrames) {
            if (step === "absen") {
              setScanning(false);
              setHint("");
              submitAbsen(f.descriptor);
              return;
            }
            if (Date.now() - lastSample >= FACE.auto.sampleGapMs) {
              lastSample = Date.now();
              streak = 0;
              photoRef.current ??= snapshot(video);
              samplesRef.current.push(f.descriptor);
              setSampleCount(samplesRef.current.length);
              if (samplesRef.current.length >= FACE.enrollSamples) {
                setScanning(false);
                setHint("");
                submitEnroll();
                return;
              }
            }
          }
        }
        await sleep(FACE.auto.scanIntervalMs);
      }
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, model, step]);

  const showCamera = step === "enroll" || step === "absen";
  const paused = showCamera && !scanning && !busy;
  const cameraHint =
    model === "loading" ? "Menyiapkan pengenal wajah…" : model === "error" ? "Pengenal wajah gagal dimuat. Muat ulang halaman." : scanning ? hint : "";

  return (
    <main className="wrap">
      <BrandHeader title="Absensi karyawan" subtitle={clock || " "} />

      <section className="card">
        {step === "pick" && (
          <>
            <div>
              <h2>Selamat datang</h2>
              <p className="muted">Pilih nama kamu untuk absen masuk.</p>
            </div>
            <label htmlFor="nama">Nama karyawan</label>
            {loadError ? (
              <p className="note error">{loadError}</p>
            ) : (
              <select id="nama" value={selected} onChange={(e) => (setSelected(e.target.value), setMsg(null))} disabled={!people}>
                <option value="">{people ? "Pilih nama…" : "Memuat…"}</option>
                {people?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.cabangName}
                    {p.absen ? " ✓ sudah absen" : !p.enrolled ? " (belum daftar wajah)" : ""}
                  </option>
                ))}
              </select>
            )}
            {person && (
              <p className="info-line">
                <span>Cabang <b>{person.cabangName}</b></span>·<span>Masuk <b>{person.openTime}</b></span>·<span>Absen dibuka <b>{person.opensAt}</b></span>
              </p>
            )}
            <button className="primary" onClick={next} disabled={!people}>
              Lanjut
            </button>
            {person && <PushToggle key={person.id} karyawanId={person.id} name={person.name} />}
          </>
        )}

        {step === "terms" && person && (
          <>
            <h2>Pendaftaran pertama · {person.name}</h2>
            <p className="muted">Baca dan setujui syarat penggunaan. Ini hanya dilakukan sekali.</p>
            <pre className="terms">{TERMS_OF_USE}</pre>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Saya {person.name}, sudah membaca dan menyetujui syarat di atas.
            </label>
            <button className="primary" disabled={!consent} onClick={() => (setStep("enroll"), startScan())}>
              Setuju dan mulai
            </button>
            <button className="ghost" onClick={reset}>
              Kembali
            </button>
          </>
        )}

        {showCamera && person && (
          <>
            <h2>
              {step === "enroll" ? "Daftarkan wajah" : "Absen masuk"} · {person.name}
            </h2>
            <p className="muted">
              {step === "enroll"
                ? `Lihat ke kamera. Foto diambil otomatis ${FACE.enrollSamples}x, gerakkan kepala sedikit di antaranya.`
                : `Cabang ${person.cabangName} · masuk ${person.openTime}. Lihat ke kamera, absen otomatis.`}
            </p>
            <Camera videoRef={videoRef} good={scanning && faceGood} hint={cameraHint} />
            {step === "enroll" && (
              <div className="dots" aria-label={`${sampleCount} dari ${FACE.enrollSamples} foto`}>
                {Array.from({ length: FACE.enrollSamples }, (_, i) => (
                  <span key={i} className={i < sampleCount ? "on" : ""} />
                ))}
              </div>
            )}
            {paused && (
              <button className="primary" onClick={() => (step === "absen" && !gpsRef.current && startGps(), startScan())}>
                Coba lagi
              </button>
            )}
            <button className="ghost" onClick={reset} disabled={busy}>
              {step === "absen" ? "Bukan saya / ganti nama" : "Batal"}
            </button>
          </>
        )}

        {step === "result" && result && (
          <>
            <div className={`result ${result.kind}`}>
              <span className="result-icon" aria-hidden="true">{result.kind === "ok" ? "✓" : result.kind === "late" ? "!" : "i"}</span>
              <p className="result-title">{result.title}</p>
              <p>{result.detail}</p>
            </div>
            <button className="primary" onClick={reset}>
              Selesai
            </button>
            {person && <PushToggle key={person.id} karyawanId={person.id} name={person.name} />}
          </>
        )}

        {msg && <p className={`note ${msg.error ? "error" : ""}`}>{msg.text}</p>}
      </section>
      <p className="footer">
        © Barberworks · <a href="/admin">Admin</a>
      </p>
    </main>
  );
}
