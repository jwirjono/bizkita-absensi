/**
 * Browser-only helpers: loads face-api from CDN, reads a face descriptor from the camera,
 * gets GPS position. Never imported by server code.
 */
import { FACE } from "@/config/app.config";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    faceapi?: any;
  }
}

let loading: Promise<any> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Gagal memuat library wajah. Periksa koneksi internet."));
    document.head.appendChild(s);
  });
}

export function loadFaceApi(): Promise<any> {
  if (loading) return loading;
  loading = (async () => {
    if (!window.faceapi) await loadScript(FACE.libUrl);
    const faceapi = window.faceapi;
    await faceapi.tf?.ready?.();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE.modelUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE.modelUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE.modelUrl),
    ]);
    return faceapi;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FaceCheck = { good: boolean; hint: string; descriptor: number[] | null };

let detectorOptions: any = null;

/**
 * Checks ONE camera frame. `good` = face is clear, close enough and centered
 * (thresholds in FACE.auto). `descriptor` = 128 numbers identifying the face.
 */
export async function checkFace(video: HTMLVideoElement): Promise<FaceCheck> {
  if (video.readyState < 2 || !video.videoWidth) return { good: false, hint: "Menyalakan kamera…", descriptor: null };
  const faceapi = await loadFaceApi();
  detectorOptions ??= new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  const r = await faceapi.detectSingleFace(video, detectorOptions).withFaceLandmarks().withFaceDescriptor();
  if (!r) return { good: false, hint: "Hadapkan wajah ke kamera", descriptor: null };

  const { box, score } = r.detection;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const cx = (box.x + box.width / 2) / w;
  const cy = (box.y + box.height / 2) / h;
  const descriptor = Array.from(r.descriptor as Float32Array).map((x) => Math.round(x * 10000) / 10000);

  if (box.width / w < FACE.auto.minFaceWidth) return { good: false, hint: "Dekatkan wajah ke kamera", descriptor };
  if (cx < 0.3 || cx > 0.7 || cy < 0.25 || cy > 0.75) return { good: false, hint: "Posisikan wajah di tengah lingkaran", descriptor };
  if (score < FACE.auto.minScore) return { good: false, hint: "Cari cahaya yang lebih terang", descriptor };
  return { good: true, hint: "Tahan sebentar…", descriptor };
}

/** Small JPEG of the current frame (stored once at enrollment so admin can check who registered). */
export function snapshot(video: HTMLVideoElement, width = 240) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width) || width;
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

export function getPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("HP ini tidak mendukung GPS di browser."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Izin lokasi ditolak. Buka pengaturan browser dan izinkan lokasi untuk situs ini."
              : "Lokasi tidak bisa dibaca. Pastikan GPS aktif lalu coba lagi.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
