import Image from "next/image";
import type { ReactNode } from "react";

/** Logo + page title. Used on the absen page and the admin page. */
export default function BrandHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="brand">
      <Image src="/logo.png" alt="Barberworks" width={56} height={56} className="brand-logo" priority />
      <div className="brand-text">
        <p className="brand-name">Barberworks</p>
        <h1>{title}</h1>
        {subtitle && <p className="brand-sub">{subtitle}</p>}
      </div>
      {action && <div className="brand-action">{action}</div>}
    </header>
  );
}
