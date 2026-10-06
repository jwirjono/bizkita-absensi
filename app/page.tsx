"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Camera from "@/components/Camera";
import { APP, FACE } from "@/config/app.config";
import { TERMS_OF_USE } from "@/config/messages";
import { detectDescriptor, getPosition, loadFaceApi, snapshot } from "@/lib/face-client";

type Person = {
  id: string;
  name: string;
  enrolled: boolean;
  absen: { time: string; late: boolean; lateMinutes: number; cabangName: string } | null;
};
type Step = "pick" | "terms" | "enroll" | "absen" | "result";
type Result = { kind: "ok" | "late" | "info"; title: string; detail: string };

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
  const [samples, setSamples] = useState<number[][]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [model, setModel] = useState<"loading" | "ready" | "error">("loading");
  const [clock, setClock] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

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

  function reset() {
    setStep("pick");
    setConsent(false);
    setSamples([]);
    setPhoto(null);
    setMsg(null);
    setResult(null);
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
    } else setStep(person.enrolled ? "absen" : "terms");
  }

  async function captureSample() {
    if (!videoRef.current || !person) return;
    setBusy(true);
    setMsg({ text: "Mendeteksi wajah…" });
    const d = await detectDescriptor(videoRef.current);
    if (!d) {
      setBusy(false);
      return setMsg({ text: "Wajah tidak terdeteksi. Hadapkan wajah ke kamera dengan cahaya cukup.", error: true });
    }
    const all = [...samples, d];
    const pic = photo ?? snapshot(videoRef.current);
    setSamples(all);
    setPhoto(pic);
    if (all.length < FACE.enrollSamples) {
      setBusy(false);
      return setMsg({ text: `Foto ${all.length}/${FACE.enrollSamples} tersimpan. Miringkan kepala sedikit, lalu ambil lagi.` });
    }
    setMsg({ text: "Menyimpan data wajah…" });
    const res = await post("/api/enroll", { id: person.id, descriptors: all, photo: pic, consent: true });
    setBusy(false);
    setSamples([]);
    setPhoto(null);
    if (!res.ok) return setMsg({ text: res.error, error: true });
    await loadPeople();
    setMsg({ text: "Wajah terdaftar. Sekarang lakukan absen." });
    setStep("absen");
  }

  async function doAbsen() {
    if (!videoRef.current || !person) return;
    setBusy(true);
    setMsg({ text: "Memeriksa lokasi dan wajah…" });
    try {
      const [pos, descriptor] = await Promise.all([getPosition(), detectDescriptor(videoRef.current)]);
      if (!descriptor) throw new Error("Wajah tidak terdeteksi. Hadapkan wajah ke kamera dengan cahaya cukup.");
      const res = await post("/api/absen", { id: person.id, descriptor, ...pos });
      if (!res.ok) throw new Error(res.error);
      const r = res.record;
      setResult(
        r.late
          ? { kind: "late", title: `Telat ${r.lateMinutes} menit`, detail: `${r.name} · ${r.cabangName} · ${r.time} ${APP.timezoneLabel}. Laporan dikirim ke atasan.` }
          : { kind: "ok", title: "Absen berhasil, tepat waktu", detail: `${r.name} · ${r.cabangName} · ${r.time} ${APP.timezoneLabel}` },
      );
      setMsg(null);
      setStep("result");
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Gagal absen.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const modelNote =
    model === "loading" ? "Menyiapkan pengenal wajah…" : model === "error" ? "Pengenal wajah gagal dimuat. Muat ulang halaman." : "";

  return (
    <main className="wrap">
      <header className="head">
        <h1>{APP.name}</h1>
        <p className="muted">{clock}</p>
      </header>

      <section className="card">
        {step === "pick" && (
          <>
            <label htmlFor="nama">Nama karyawan</label>
            {loadError ? (
              <p className="note error">{loadError}</p>
            ) : (
              <select id="nama" value={selected} onChange={(e) => (setSelected(e.target.value), setMsg(null))} disabled={!people}>
                <option value="">{people ? "Pilih nama…" : "Memuat…"}</option>
                {people?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.absen ? " ✓ sudah absen" : !p.enrolled ? " (belum daftar wajah)" : ""}
                  </option>
                ))}
              </select>
            )}
            <button className="primary" onClick={next} disabled={!people}>
              Lanjut
            </button>
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
            <button className="primary" disabled={!consent} onClick={() => (setMsg(null), setStep("enroll"))}>
              Setuju dan lanjut
            </button>
            <button className="ghost" onClick={reset}>
              Kembali
            </button>
          </>
        )}

        {step === "enroll" && person && (
          <>
            <h2>Daftarkan wajah · {person.name}</h2>
            <p className="muted">
              Ambil {FACE.enrollSamples} foto. Lepas masker/kacamata hitam, cari cahaya yang terang.
            </p>
            <Camera videoRef={videoRef} />
            <div className="dots" aria-label={`${samples.length} dari ${FACE.enrollSamples} foto`}>
              {Array.from({ length: FACE.enrollSamples }, (_, i) => (
                <span key={i} className={i < samples.length ? "on" : ""} />
              ))}
            </div>
            <button className="primary" onClick={captureSample} disabled={busy || model !== "ready"}>
              {busy ? "Memproses…" : `Ambil foto ${samples.length + 1}/${FACE.enrollSamples}`}
            </button>
            <button className="ghost" onClick={reset} disabled={busy}>
              Batal
            </button>
          </>
        )}

        {step === "absen" && person && (
          <>
            <h2>Absen masuk · {person.name}</h2>
            <p className="muted">Pastikan kamu di cabang dan GPS aktif.</p>
            <Camera videoRef={videoRef} />
            <button className="primary" onClick={doAbsen} disabled={busy || model !== "ready"}>
              {busy ? "Memproses…" : "Absen sekarang"}
            </button>
            <button className="ghost" onClick={reset} disabled={busy}>
              Bukan saya / ganti nama
            </button>
          </>
        )}

        {step === "result" && result && (
          <>
            <div className={`result ${result.kind}`}>
              <p className="result-title">{result.title}</p>
              <p>{result.detail}</p>
            </div>
            <button className="primary" onClick={reset}>
              Selesai
            </button>
          </>
        )}

        {(step === "enroll" || step === "absen") && modelNote && <p className="note">{modelNote}</p>}
        {msg && <p className={`note ${msg.error ? "error" : ""}`}>{msg.text}</p>}
      </section>
    </main>
  );
}
