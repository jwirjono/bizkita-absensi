import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Allow camera + GPS on this site only.
      { source: "/(.*)", headers: [{ key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" }] },
      // Service worker for notifications: never cached, so phones always get the latest version.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
