import type { MetadataRoute } from "next";

/** Makes the site installable ("Add to Home Screen"), required for notifications on iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Absensi Barberworks",
    short_name: "Absensi",
    description: "Absen masuk karyawan Barberworks",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#4b0c82",
    icons: [{ src: "/logo.png", sizes: "640x640", type: "image/png", purpose: "any" }],
  };
}
