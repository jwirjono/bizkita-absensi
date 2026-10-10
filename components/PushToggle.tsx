"use client";

import { useEffect, useState } from "react";
import { currentSubscription, postPush, pushEnv, subscribePush, type PushEnv } from "@/lib/push-client";

/** "Aktifkan pengingat absen" for one karyawan on this phone, with iPhone install steps when needed. */
export default function PushToggle({ karyawanId, name }: { karyawanId: string; name: string }) {
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [linked, setLinked] = useState<string | null | undefined>(undefined); // karyawan id on this phone
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    const e = pushEnv();
    setEnv(e);
    if (e !== "ok") return;
    currentSubscription()
      .then(async (sub) => {
        if (!sub) return setLinked(null);
        const r = await postPush("status");
        setLinked(r.ok ? r.karyawanId : null);
      })
      .catch(() => setEnv("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const subscription = await subscribePush();
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", subscription, karyawanId }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error);
      setLinked(karyawanId);
      setMsg({ text: res.message });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Gagal mengaktifkan notifikasi.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const res = await postPush("unsubscribe");
    setBusy(false);
    if (res.ok) setLinked(null);
    setMsg({ text: res.ok ? res.message : res.error, error: !res.ok });
  }

  if (env === null) return null;

  if (env === "ios-needs-install") {
    return (
      <div className="push-box">
        <p className="group-title">🔔 Pengingat absen di iPhone</p>
        <ol className="steps">
          <li>Buka halaman ini di <b>Safari</b>.</li>
          <li>
            Tap tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bawah layar.
          </li>
          <li>
            Pilih <b>Tambah ke Layar Utama</b> (Add to Home Screen), lalu <b>Tambah</b>.
          </li>
          <li>
            Buka <b>Absensi</b> dari ikon di layar utama, pilih nama, lalu tap <b>Aktifkan pengingat</b>.
          </li>
        </ol>
      </div>
    );
  }
  if (env === "unsupported") return <p className="muted small-text">Browser ini tidak mendukung notifikasi. Gunakan Chrome (Android) atau Safari (iPhone).</p>;

  const blocked = typeof Notification !== "undefined" && Notification.permission === "denied";

  return (
    <div className="push-box">
      {linked === karyawanId ? (
        <div className="row">
          <span>🔔 Pengingat aktif untuk {name}</span>
          <button className="ghost small" onClick={disable} disabled={busy}>
            Matikan
          </button>
        </div>
      ) : blocked ? (
        <p className="small-text">
          🔕 Notifikasi diblokir. Buka <b>Pengaturan HP → Notifikasi → Absensi</b> (atau pengaturan situs di browser), izinkan, lalu muat ulang.
        </p>
      ) : (
        <>
          <button onClick={enable} disabled={busy || linked === undefined}>
            {busy ? "Mengaktifkan…" : linked ? `🔔 Ganti pengingat HP ini ke ${name}` : "🔔 Aktifkan pengingat absen"}
          </button>
          <p className="muted small-text">HP ini akan dapat pengingat saat jam masuk dan saat batas telat, kalau {name} belum absen.</p>
        </>
      )}
      {msg && <p className={`note ${msg.error ? "error" : ""}`}>{msg.text}</p>}
    </div>
  );
}
