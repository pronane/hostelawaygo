"use client";

import { useState } from "react";

export function ShareButton({ title, url: shareUrl, label }: { title: string; url?: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function share() {
    const url = shareUrl ? new URL(shareUrl, window.location.origin).href : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  return (
    <button type="button" className="btn" onClick={share} aria-label={label ?? "Share this event"}>
      {done ? "Link copied" : label ?? "↗"}
    </button>
  );
}
