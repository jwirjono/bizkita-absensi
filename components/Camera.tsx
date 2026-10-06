"use client";

import { useEffect, useState, type RefObject } from "react";

/** Front camera preview. Starts on mount, stops on unmount. */
export default function Camera({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setError("Kamera tidak bisa dibuka. Izinkan akses kamera di browser lalu muat ulang halaman."));
    if (!navigator.mediaDevices) setError("Browser ini tidak mendukung kamera. Gunakan Chrome atau Safari terbaru.");
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoRef]);

  return (
    <div className="camera">
      <video ref={videoRef} playsInline muted autoPlay />
      <div className="camera-guide" aria-hidden="true" />
      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}
