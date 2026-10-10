"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPush from "@/components/AdminPush";
import BrandHeader from "@/components/BrandHeader";
import KaryawanForm, { type KaryawanInput } from "@/components/KaryawanForm";

type Rec = { id: string; name: string; time: string; openTime: string; cabangId: string; late: boolean; lateMinutes: number; distanceMeters: number; faceDistance: number };
type Row = { id: string; name: string; present: number; lateCount: number; lateMinutes: number };
type Overview = {
  today: string;
  cabang: { id: string; name: string; openTime: string; toleranceMinutes: number; radiusMeters: number }[];
  karyawan: (KaryawanInput & { id: string; cabangName: string; effectiveOpenTime: string; effectiveTolerance: number; enrolled: boolean })[];
};

const PIN_KEY = "absensi:adminPin";

const notYetByCabang = (report: { cabang: { id: string; notYet: string[] }[] }) =>
  Object.fromEntries(report.cabang.map((c) => [c.id, c.notYet]));

export default function Admin() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  // Rekap period: a whole month by default, or a custom date range.
  const [rangeMode, setRangeMode] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const rangeInvalid = rangeMode && (!from || !to || from > to);
  const periodQuery = rangeMode ? `from=${from}&to=${to}` : `month=${month}`;
  const [records, setRecords] = useState<Rec[]>([]);
  const [notYet, setNotYet] = useState<Record<string, string[]>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<string | null>(null); // "new", a karyawan id, or null
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [wa, setWa] = useState<{ targets: { label: string; target: string }[]; groups: { id: string; name: string }[]; groupError: string | null } | null>(null);

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
        setNotYet(notYetByCabang(r.report));
      }
    });
  }, [authed, date, api]);

  useEffect(() => {
    if (!authed || !month || rangeInvalid) return;
    api(`?action=month&${periodQuery}`).then((r) => {
      if (r.ok) (setRows(r.rows), setPeriodLabel(r.label));
    });
  }, [authed, month, api, periodQuery, rangeInvalid]);

  async function act(body: object, confirmText?: string): Promise<boolean> {
    if (confirmText && !confirm(confirmText)) return false;
    setNotice({ text: "Memproses…" });
    const r = await api("", body);
    setNotice({ text: r.ok ? r.message : r.error, error: !r.ok });
    if (r.ok) {
      const [o, d, m] = await Promise.all([api("?action=overview"), api(`?action=day&date=${date}`), api(`?action=month&${periodQuery}`)]);
      if (o.ok) setOverview(o);
      if (d.ok) (setRecords(d.records), setNotYet(notYetByCabang(d.report)));
      if (m.ok) setRows(m.rows);
    }
    return !!r.ok;
  }

  async function saveKaryawan(value: KaryawanInput) {
    const saved = await act({ action: "saveKaryawan", ...value });
    if (saved) setEditing(null);
    return saved;
  }

  async function exportExcel() {
    if (rangeInvalid) return setNotice({ text: "Tanggal awal harus sebelum tanggal akhir.", error: true });
    const res = await fetch(`/api/admin?action=excel&${periodQuery}`, { headers: { "x-admin-pin": pin } });
    if (!res.ok) return setNotice({ text: "Gagal export.", error: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: rangeMode ? `absensi-${from}_${to}.xlsx` : `absensi-${month}.xlsx` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadWa() {
    setNotice({ text: "Mengambil data WhatsApp…" });
    const r = await api("?action=whatsapp");
    if (!r.ok) return setNotice({ text: r.error, error: true });
    setWa(r);
    setNotice(null);
  }

  async function togglePhoto(id: string) {
    if (id in photos) return setPhotos(({ [id]: _, ...rest }) => rest);
    const r = await api(`?action=photo&id=${id}`);
    setPhotos((p) => ({ ...p, [id]: r.ok ? r.photo : null }));
  }

  if (!authed) {
    return (
      <main className="wrap">
        <BrandHeader title="Admin absensi" subtitle="Masukkan PIN admin" />
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
      <BrandHeader
        title="Admin absensi"
        subtitle="Absen harian, rekap, dan data wajah"
        action={
          <button className="ghost small" onClick={() => (sessionStorage.removeItem(PIN_KEY), location.reload())}>
            Keluar
          </button>
        }
      />
      {notice && <p className={`note ${notice.error ? "error" : ""}`}>{notice.text}</p>}

      <section className="card">
        <div className="row">
          <h2>Absen harian</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {overview?.cabang.map((c) => {
          const list = records.filter((r) => r.cabangId === c.id);
          return (
            <div key={c.id} className="group">
              <p className="group-title">
                {c.name} <span className="muted">· buka {c.openTime}, toleransi {c.toleranceMinutes} menit</span>
              </p>
              {list.length === 0 && <p className="muted">Belum ada yang absen.</p>}
              {(notYet[c.id] ?? []).length > 0 && <p className="muted">Belum absen: {notYet[c.id].join(", ")}</p>}
              {list.map((r) => (
                <div key={r.id} className="line">
                  <span>{r.name}</span>
                  <span>
                    {r.time} <span className="muted small-text">/ {r.openTime}</span>
                  </span>
                  <span className={r.late ? "tag late" : "tag ok"}>{r.late ? `telat ${r.lateMinutes}m` : "tepat"}</span>
                  <span className="muted small-text">{r.distanceMeters} m</span>
                  <button className="ghost small" onClick={() => act({ action: "deleteAbsen", date, id: r.id }, `Hapus absen ${r.name} tanggal ${date}?`)}>
                    Hapus
                  </button>
                </div>
              ))}
              <div className="row gap">
                <button className="ghost small" onClick={() => act({ action: "sendOpening", date, cabangId: c.id })}>
                  Kirim absensi {c.name} ke grupnya sekarang
                </button>
                <button className="ghost small" onClick={() => act({ action: "sendOpening", date, cabangId: c.id, cutoff: true })}>
                  Kirim update batas telat {c.name}
                </button>
              </div>
            </div>
          );
        })}
        <button onClick={() => act({ action: "sendDaily", date })}>Kirim rekap telat ke grup sekarang</button>
      </section>

      <section className="card">
        <div className="row">
          <h2>{rangeMode ? "Rekap periode" : "Rekap bulanan"}</h2>
          {!rangeMode && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
        </div>
        <div className="row gap">
          {rangeMode ? (
            <>
              <label className="inline-field">
                Dari <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="inline-field">
                Sampai <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
              <button className="ghost small" onClick={() => setRangeMode(false)}>
                Kembali ke bulanan
              </button>
            </>
          ) : (
            <button
              className="ghost small"
              onClick={() => {
                // start the custom range from the selected month
                const [y, m] = month.split("-").map(Number);
                setFrom(`${month}-01`);
                setTo(`${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`);
                setRangeMode(true);
              }}
            >
              Pilih rentang tanggal
            </button>
          )}
        </div>
        {rangeInvalid ? (
          <p className="note error">Tanggal awal harus sebelum (atau sama dengan) tanggal akhir.</p>
        ) : (
          periodLabel && <p className="muted">Periode: {periodLabel}</p>
        )}
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
          {!rangeMode && <button onClick={() => act({ action: "sendMonthly", month })}>Kirim rekap bulanan ke grup</button>}
          <button onClick={exportExcel}>Download Excel</button>
        </div>
      </section>

      <section className="card">
        <div className="row">
          <h2>Karyawan</h2>
          {editing === null && (
            <button className="small" onClick={() => setEditing("new")}>
              + Tambah karyawan
            </button>
          )}
        </div>
        {editing === "new" && overview && (
          <KaryawanForm cabang={overview.cabang} onSave={saveKaryawan} onCancel={() => setEditing(null)} />
        )}
        {overview?.karyawan.length === 0 && <p className="muted">Belum ada karyawan. Tambah lewat tombol di atas.</p>}
        {overview?.karyawan.map((k) => (
          <div key={k.id} className={`karyawan-row ${k.active ? "" : "inactive"}`}>
            {editing === k.id ? (
              <KaryawanForm cabang={overview.cabang} initial={k} onSave={saveKaryawan} onCancel={() => setEditing(null)} />
            ) : (
              <div className="karyawan-line">
                <div className="karyawan-info">
                  <span className="karyawan-name">{k.name}</span>
                  <span className="muted small-text">
                    {k.cabangName} · masuk {k.effectiveOpenTime} · toleransi {k.effectiveTolerance}m
                  </span>
                  <span className="tags">
                    {!k.active && <span className="tag">nonaktif</span>}
                    <span className={k.enrolled ? "tag ok" : "tag"}>{k.enrolled ? "wajah terdaftar" : "belum daftar wajah"}</span>
                  </span>
                </div>
                <div className="karyawan-actions">
                  <button className="ghost small" onClick={() => setEditing(k.id)}>
                    Edit
                  </button>
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
                  <button
                    className="ghost small danger"
                    onClick={() =>
                      act(
                        { action: "deleteKaryawan", id: k.id },
                        `Hapus ${k.name}? Data wajahnya ikut dihapus. Riwayat absen tetap tersimpan.\n\nTips: kalau hanya berhenti sementara, pakai Edit → hilangkan centang Aktif.`,
                      )
                    }
                  >
                    Hapus
                  </button>
                </div>
              </div>
            )}
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

      <AdminPush api={api} notify={(text, error) => setNotice({ text, error })} />

      <section className="card">
        <h2>WhatsApp</h2>
        <p className="muted">
          ID grup diatur di config/app.config.ts: <code>whatsappGroup</code> tiap cabang dan <code>WHATSAPP.rekapTelat.group</code>.
        </p>
        <button onClick={loadWa}>Tampilkan tujuan dan grup WhatsApp</button>
        {wa && (
          <>
            <p className="group-title">Tujuan sekarang</p>
            {wa.targets.map((t) => (
              <div key={t.label} className="line wa-line">
                <span>{t.label}</span>
                {t.target ? <code>{t.target}</code> : <span className="tag late">belum diisi</span>}
              </div>
            ))}
            <p className="group-title">Grup yang diikuti nomor Fonnte</p>
            {wa.groupError && <p className="muted">{wa.groupError}</p>}
            {wa.groups.map((g) => (
              <div key={g.id} className="line wa-line">
                <span>{g.name}</span>
                <code>{g.id}</code>
                <button className="ghost small" onClick={() => navigator.clipboard?.writeText(g.id).then(() => setNotice({ text: `ID grup ${g.name} disalin.` }))}>
                  Salin ID
                </button>
              </div>
            ))}
          </>
        )}
      </section>
    </main>
  );
}
