"use client";

import { useState } from "react";

/**
 * Opens WhatsApp on this phone with the text already written; the admin picks the group and taps Send.
 * A plain link (not fetch-then-open) so iPhone doesn't block it.
 */
export default function WaShare({ label, text }: { label: string; text?: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <span className="wa-share">
      <a className="wa-link" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
      <button
        className="ghost small"
        onClick={() =>
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
        }
      >
        {copied ? "Disalin ✓" : "Salin"}
      </button>
    </span>
  );
}
