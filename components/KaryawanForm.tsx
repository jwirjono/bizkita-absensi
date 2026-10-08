"use client";

import { useState } from "react";

export type CabangOption = { id: string; name: string; openTime: string; toleranceMinutes: number };
export type KaryawanInput = { id?: string; name: string; cabang: string; openTime?: string; toleranceMinutes?: number; active: boolean };

/** Add / edit karyawan. Empty jam masuk or toleransi = follow the cabang's setting. */
export default function KaryawanForm({
  cabang,
  initial,
  onSave,
  onCancel,
}: {
  cabang: CabangOption[];
  initial?: KaryawanInput;
  onSave: (value: KaryawanInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cabangId, setCabangId] = useState(initial?.cabang ?? cabang[0]?.id ?? "");
  const [openTime, setOpenTime] = useState(initial?.openTime ?? "");
  const [tolerance, setTolerance] = useState(initial?.toleranceMinutes?.toString() ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const c = cabang.find((x) => x.id === cabangId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Isi nama karyawan (minimal 2 huruf).");
    if (tolerance && (!/^\d+$/.test(tolerance) || Number(tolerance) > 180)) return setError("Toleransi harus 0–180 menit.");
    setError("");
    setSaving(true);
    const saved = await onSave({
      id: initial?.id,
      name: name.trim(),
      cabang: cabangId,
      openTime: openTime || undefined,
      toleranceMinutes: tolerance === "" ? undefined : Number(tolerance),
      active,
    });
    setSaving(false);
    if (!saved) setError("Belum tersimpan. Lihat pesan di atas.");
  }

  return (
    <form className="karyawan-form" onSubmit={submit}>
      <p className="group-title">{initial?.id ? `Edit ${initial.name}` : "Tambah karyawan"}</p>
      <div className="form-grid">
        <label>
          Nama
          <input type="text" value={name} onChange={(e) => (setName(e.target.value), setError(""))} placeholder="Budi" autoFocus maxLength={40} />
        </label>
        <label>
          Cabang
          <select value={cabangId} onChange={(e) => setCabangId(e.target.value)}>
            {cabang.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jam masuk
          <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          <span className="hint">{openTime ? <button type="button" className="link" onClick={() => setOpenTime("")}>Ikuti cabang ({c?.openTime})</button> : `Kosong = ikut cabang (${c?.openTime})`}</span>
        </label>
        <label>
          Toleransi (menit)
          <input type="number" min={0} max={180} inputMode="numeric" value={tolerance} onChange={(e) => (setTolerance(e.target.value), setError(""))} placeholder={String(c?.toleranceMinutes ?? 15)} />
          <span className="hint">Kosong = ikut cabang ({c?.toleranceMinutes} menit)</span>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Aktif (muncul di daftar absen dan laporan)
      </label>
      {error && <p className="note error">{error}</p>}
      <div className="row gap">
        <button className="primary compact" type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="ghost" type="button" onClick={onCancel} disabled={saving}>
          Batal
        </button>
      </div>
    </form>
  );
}
