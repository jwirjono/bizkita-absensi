"use client";

import { useCallback, useEffect, useState } from "react";
import { APP } from "@/config/app.config";

type Rec = { id: string; name: string; time: string; cabangName: string; late: boolean; lateMinutes: number; distanceMeters: number; faceDistance: number };
type Row = { id: string; name: string; present: number; lateCount: number; lateMinutes: number };
type Overview = {
  today: string;
  cabang: { id: string; name: string; openTime: string; toleranceMinutes: number; radiusMeters: number }[];
  karyawan: { id: string; name: string; enrolled: boolean }[];
};

const PIN_KEY = "absensi:adminPin";

export default function Admin() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [records, setRecords] = useState<Rec[]>([]);
  const [notYet, setNotYet] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const api = useCallback(
    async (query: string, body?: object, pinOverride?: string) => {
      const res = await fetch(`/api/admin${query}`, {
        method: body ? "POST" : "GET",
        headers: { "x-admin-pin": pinOverride ?? pin, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      return res.json().catch(() => ({ ok: false, error: "Server tidak merespons." }));
    },
    [pin],
  );

  async function login(p = pin) {
    const res = await api("?action=overview", undefined, p);
    if (!res.ok) {
      setNotice({ text: res.error, error: true });
      try {
        sessionStorage.removeItem(PIN_KEY);
      } catch {}
      return;
    }
    try {
      sessionStorage.setItem(PIN_KEY, p);
    } catch {}
    setPin(p);
    setOverview(res);
    setDate(res.today);
    setMonth(res.today.slice(0, 7));
    setAuthed(true);
    setNotice(null);
  }

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PIN_KEY);
      if (saved) login(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authed || !date) return;
    api(`?action=day&date=${date}`).then((r) => {
      if (r.ok) {
        setRecords(r.records);
        setNotYet(r.report.notYet);
      }
    });
  }, [authed, date, api]);

  useEffect(() => {
    if (!authed || !month) return;
    api(`?action=month&month=${month}`).then((r) => r.ok && setRows(r.rows));
  }, [authed, month, api]);

  async function act(body: object, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setNotice({ text: "Memproses…" });
    const r = await api("", body);
    setNotice({ text: r.ok ? r.message : r.error, error: !r.ok });
    if (r.ok) {
      const [o, d, m] = await Promise.all([api("?action=overview"), api(`?action=day&date=${date}`), api(`?action=month&month=${month}`)]);
      if (o.ok) setOverview(o);
      if (d.ok) (setRecords(d.records), setNotYet(d.report.notYet));
      if (m.ok) setRows(m.rows);
    }
  }

  async function exportCsv() {
    const res = await fetch(`/api/admin?action=csv&month=${month}`, { headers: { "x-admin-pin": pin } });
    if (!res.ok) return setNotice({ text: "Gagal export.", error: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `absensi-${month}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function togglePhoto(id: string) {
    if (id in photos) return setPhotos(({ [id]: _, ...rest }) => rest);
    const r = await api(`?action=photo&id=${id}`);
    setPhotos((p) => ({ ...p, [id]: r.ok ? r.photo : null }));
  }

  if (!authed) {
    return (
      <main className="wrap">
        <header className="head">
          <h1>Admin · {APP.name}</h1>
        </header>
        <form className="card" onSubmit={(e) => (e.preventDefault(), login())}>
          <label htmlFor="pin">PIN admin</label>
          <input id="pin" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
          <button className="primary" type="submit">
            Masuk
          </button>
          {notice && <p className={`note ${notice.error ? "error" : ""}`}>{notice.text}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="wrap wide">
      <header className="head row">
        <h1>Admin · {APP.name}</h1>
        <button className="ghost small" onClick={() => (sessionStorage.removeItem(PIN_KEY), location.reload())}>
          Keluar
        </button>
      </header>
      {notice && <p className={`note ${notice.error ? "error" : ""}`}>{notice.text}</p>}

      <section className="card">
        <div className="row">
          <h2>Absen harian</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {overview?.cabang.map((c) => {
          const list = records.filter((r) => r.cabangName === c.name);
          return (
            <div key={c.id} className="group">
              <p className="group-title">
                {c.name} <span className="muted">· buka {c.openTime}, toleransi {c.toleranceMinutes} menit</span>
              </p>
              {list.length === 0 && <p className="muted">Belum ada yang absen.</p>}
              {list.map((r) => (
                <div key={r.id} className="line">
                  <span>{r.name}</span>
                  <span>{r.time}</span>
                  <span className={r.late ? "tag late" : "tag ok"}>{r.late ? `telat ${r.lateMinutes}m` : "tepat"}</span>
                  <span className="muted small-text">{r.distanceMeters} m</span>
                  <button className="ghost small" onClick={() => act({ action: "deleteAbsen", date, id: r.id }, `Hapus absen ${r.name} tanggal ${date}?`)}>
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          );
        })}
        {notYet.length > 0 && <p className="muted">Belum absen: {notYet.join(", ")}</p>}
        <button onClick={() => act({ action: "sendDaily", date })}>Kirim ringkasan ke WhatsApp</button>
      </section>

      <section className="card">
        <div className="row">
          <h2>Rekap bulanan</h2>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="line head-line">
          <span>Nama</span>
          <span>Hadir</span>
          <span>Telat</span>
          <span>Total menit</span>
        </div>
        {[...rows]
          .sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name))
          .map((r) => (
            <div key={r.id} className="line">
              <span>{r.name}</span>
              <span>{r.present}</span>
              <span className={r.lateCount ? "late-text" : ""}>{r.lateCount}x</span>
              <span>{r.lateMinutes}</span>
            </div>
          ))}
        <div className="row gap">
          <button onClick={() => act({ action: "sendMonthly", month })}>Kirim rekap ke WhatsApp</button>
          <button onClick={exportCsv}>Export CSV</button>
        </div>
      </section>

      <section className="card">
        <h2>Karyawan dan data wajah</h2>
        <p className="muted">Tambah atau hapus karyawan di config/app.config.ts.</p>
        {overview?.karyawan.map((k) => (
          <div key={k.id}>
            <div className="line">
              <span>{k.name}</span>
              <span className={k.enrolled ? "tag ok" : "tag"}>{k.enrolled ? "wajah terdaftar" : "belum daftar"}</span>
              {k.enrolled && (
                <>
                  <button className="ghost small" onClick={() => togglePhoto(k.id)}>
                    {k.id in photos ? "Tutup foto" : "Lihat foto"}
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => act({ action: "resetFace", id: k.id }, `Reset wajah ${k.name}? Dia harus daftar ulang.`)}
                  >
                    Reset wajah
                  </button>
                </>
              )}
            </div>
            {k.id in photos &&
              (photos[k.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="face-photo" src={photos[k.id]!} alt={`Foto pendaftaran ${k.name}`} />
              ) : (
                <p className="muted">Tidak ada foto.</p>
              ))}
          </div>
        ))}
      </section>
    </main>
  );
}
