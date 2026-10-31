"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  eventId: number;
  going: number;
  joined: boolean;
  free?: boolean;
};

export function JoinButton({ eventId, going, joined, free }: Props) {
  const [state, setState] = useState({ going, joined });
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { joined: boolean; going: number };
      setState({ joined: data.joined, going: data.going });
      router.refresh();
    } catch {
      /* leave the optimistic state untouched and let the user retry */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`btn primary${state.joined ? " in" : ""}`}
        aria-live="polite"
      >
        {state.joined ? `You're in · ${state.going} going` : `Join · ${state.going} going`}
      </button>
      <span className="sr-only">
        {state.joined
          ? `You have joined this event. ${state.going} people are going.`
          : `${state.going} people are going. ${free ? "This event is free." : ""}`}
      </span>
    </>
  );
}
