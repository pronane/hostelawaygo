"use client";

import { useState } from "react";

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);

  async function share() {
    const url = window.location.href;
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
    <button type="button" className="btn" onClick={share} aria-label="Share this event">
      {done ? "Link copied" : "↗"}
    </button>
  );
}
