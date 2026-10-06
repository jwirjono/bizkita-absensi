import type { Metadata, Viewport } from "next";
import { APP } from "@/config/app.config";
import "./globals.css";

export const metadata: Metadata = { title: APP.name, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111827" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
