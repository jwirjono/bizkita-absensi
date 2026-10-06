import { CABANG, type Cabang } from "@/config/app.config";

/** Distance in meters between two GPS points (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestCabang(lat: number, lng: number): { cabang: Cabang; distance: number } {
  let best = { cabang: CABANG[0], distance: Infinity };
  for (const c of CABANG) {
    const distance = distanceMeters(lat, lng, c.lat, c.lng);
    if (distance < best.distance) best = { cabang: c, distance };
  }
  return best;
}
