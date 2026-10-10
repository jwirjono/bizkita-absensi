"use client";

import { useCallback, useEffect, useState } from "react";
import { currentSubscription, pushEnv, subscribePush, type PushEnv } from "@/lib/push-client";

type Api = (query: string, body?: object) => Promise<{ ok: boolean; error?: string; message?: string; [k: string]: unknown }>;
type Device = { id: string; device: string; admin: boolean; karyawan: string | null; createdAt: string };

/** Admin: turn on rekap notifications for this phone, send a test, see all registered phones. */
export default function AdminPush({ api, notify }: { api: Api; notify: (text: string, error?: boolean) => void }) {
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [isAdminHere, setIsAdminHere] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api("?action=push");
    if (r.ok) setDevices(r.devices as Device[]);
  }, [api]);

  useEffect(() => {
    const e = pushEnv();
    setEnv(e);
    load();
    if (e !== "ok") return;
    currentSubscription()
      .then(async (sub) => {
        if (!sub) return;
        const r = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", subscription: sub.toJSON() }),
        }).then((x) => x.json());
        setIsAdminHere(!!r.admin);
      })
      .catch(() => setEnv("unsupported"));
  }, [load]);

  async function setAdmin(on: boolean) {
    setBusy(true);
    try {
      const subscription = on ? await subscribePush() : (await currentSubscription())?.toJSON();
      const r = await api("", { action: "pushAdmin", subscription, on });
      notify(r.ok ? (r.message as string) : (r.error ?? "Gagal."), !r.ok);
      if (r.ok) setIsAdminHere(on);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengaktifkan notifikasi.", true);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const sub = await currentSubscription().catch(() => null);
    const r = await api("", { action: "pushTest", subscription: sub?.toJSON() });
    notify(r.ok ? (r.message as string) : (r.error ?? "Gagal."), !r.ok);
  }

  async function remove(d: Device) {
    if (!confirm(`Hapus ${d.device}${d.karyawan ? ` (${d.karyawan})` : ""} dari notifikasi?`)) return;
    const r = await api("", { action: "pushRemove", id: d.id });
    notify(r.ok ? (r.message as string) : (r.error ?? "Gagal."), !r.ok);
    await load();
  }

  return (
    <section className="card">
      <h2>Notifikasi HP</h2>
      <p className="muted">Rekap telat dikirim ke HP admin jam 12:00. Karyawan mengaktifkan pengingat sendiri di halaman absen.</p>

      {env === "ios-needs-install" && (
        <div className="push-box">
          <p className="group-title">iPhone: tambahkan ke Layar Utama dulu</p>
          <ol className="steps">
            <li>Buka situs ini di <b>Safari</b>, tap <b>Bagikan</b> → <b>Tambah ke Layar Utama</b>.</li>
            <li>Buka <b>Absensi</b> dari ikon layar utama, tap <b>Admin</b> di bawah, masuk dengan PIN.</li>
            <li>Kembali ke bagian ini dan tap <b>Aktifkan notifikasi admin</b>.</li>
          </ol>
        </div>
      )}
      {env === "unsupported" && <p className="muted">Browser ini tidak mendukung notifikasi.</p>}
      {env === "ok" && (
        <div className="row gap">
          {isAdminHere ? (
            <>
              <span>🔔 Notifikasi admin aktif di HP ini</span>
              <button className="small" onClick={test}>
                Kirim tes
              </button>
              <button className="ghost small" onClick={() => setAdmin(false)} disabled={busy}>
                Matikan
              </button>
            </>
          ) : (
            <button onClick={() => setAdmin(true)} disabled={busy}>
              {busy ? "Mengaktifkan…" : "🔔 Aktifkan notifikasi admin di HP ini"}
            </button>
          )}
        </div>
      )}

      <p className="group-title">HP terdaftar ({devices.length})</p>
      {devices.length === 0 && <p className="muted">Belum ada HP yang mengaktifkan notifikasi.</p>}
      {devices.map((d) => (
        <div key={d.id} className="karyawan-line karyawan-row">
          <span>
            <b>{d.device}</b>{" "}
            <span className="muted small-text">
              {[d.karyawan && `pengingat ${d.karyawan}`, d.admin && "admin"].filter(Boolean).join(" · ") || "tidak ada peran"} · sejak{" "}
              {new Date(d.createdAt).toLocaleDateString("id-ID")}
            </span>
          </span>
          <button className="ghost small danger" onClick={() => remove(d)}>
            Hapus
          </button>
        </div>
      ))}
    </section>
  );
}
