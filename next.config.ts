import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow camera + GPS on this site only.
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" }] }];
  },
};

export default nextConfig;
