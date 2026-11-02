"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The clock on the reception screen, and the thing that keeps the screen true.
 *
 * A board that shows last night's plan is worse than no board, so it refreshes
 * itself once a minute — `router.refresh()` re-runs the server component and
 * swaps the content without a reload, which matters on a cheap tablet that
 * somebody has left on all week.
 *
 * The clock renders only after mount: server and client would otherwise disagree
 * about the time and React would complain about the hydration mismatch.
 */
export function BoardClock() {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  return (
    <div className="board-clock" suppressHydrationWarning>
      <b>{now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</b>
      <style>{`@media print { .board-clock { display: none } }`}</style>
    </div>
  );
}
