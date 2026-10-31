"use client";

import { useState } from "react";
import { createSafeNightAction } from "@/app/actions/safe";

/** Default "back by": two hours after the event ends, or 02:00 tonight. */
function defaultBackBy(eventEndIso?: string): string {
  const d = eventEndIso ? new Date(new Date(eventEndIso).getTime() + 2 * 3_600_000) : new Date();
  if (!eventEndIso) {
    d.setDate(d.getHours() >= 2 ? d.getDate() + 1 : d.getDate());
    d.setHours(2, 0, 0, 0);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SafeForm({
  eventId,
  plan,
  eventEndIso,
}: {
  eventId?: number;
  plan?: string;
  eventEndIso?: string;
}) {
  const [backBy, setBackBy] = useState(() => defaultBackBy(eventEndIso));
  const iso = (() => {
    const d = new Date(backBy);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  })();
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/Lisbon";

  return (
    <form action={createSafeNightAction} className="panel">
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
      <input type="hidden" name="backByIso" value={iso} />
      <input type="hidden" name="tz" value={tz} />
      <div className="field">
        <label htmlFor="safe-plan">Where are you going?</label>
        <input id="safe-plan" name="plan" defaultValue={plan ?? ""} maxLength={140} required placeholder="Fado night at Tasca do Chico, Bairro Alto" />
      </div>
      <div className="field">
        <label htmlFor="safe-back">Back by</label>
        <input id="safe-back" type="datetime-local" value={backBy} onChange={(e) => setBackBy(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="safe-friend">Who are you telling? (optional)</label>
        <input id="safe-friend" name="friend" maxLength={40} placeholder="Sam" />
      </div>
      <button type="submit" className="btn primary block" style={{ marginTop: 14 }} disabled={!iso}>Create my link</button>
      <p style={{ fontSize: 12, color: "#8b7d72", margin: "10px 0 0" }}>
        Your friend sees your first name, the plan and the time — nothing else. Tap &ldquo;I&apos;m home&rdquo; when you&apos;re back.
      </p>
    </form>
  );
}
