import Link from "next/link";
import { formatPriceRange, windowLabel } from "@/lib/format";
import { timeOf } from "@/lib/time";
import type { FeedEvent } from "@/lib/types";

const AV_COLOURS = ["#FFD9A0", "#BFE3FF", "#D9F0D0"];

export function EventCard({ event }: { event: FeedEvent }) {
  const label = windowLabel(event.status);
  const isOut = event.status === "after" || event.status === "before";
  const walk =
    event.walk_minutes === 0 ? "at your hostel" : `${event.walk_minutes} min walk`;

  return (
    <Link href={`/event/${event.id}`} className={`card${isOut ? " is-out" : ""}`}>
      <div
        className="cover"
        style={{ background: `linear-gradient(150deg, ${event.cover_from}, ${event.cover_to})` }}
        aria-hidden="true"
      >
        <span>{event.emoji}</span>
      </div>
      <div className="card-body">
        <div className="row1">
          <span className="time">{timeOf(event.starts_at)}</span>
          <span className={`badge ${event.source}`}>{event.source}</span>
          {label ? <span className={`badge window${isOut ? " out" : ""}`}>{label}</span> : null}
          {event.isJoined ? <span className="joined-flag">✓ going</span> : null}
        </div>
        <h3>{event.title}</h3>
        <p className="venue">
          {event.venue} · {walk}
        </p>
        <div className="foot">
          <div className="stack" aria-hidden="true">
            {event.avatars.map((a, i) => (
              <i key={`${a}-${i}`} style={{ background: AV_COLOURS[i % AV_COLOURS.length] }}>
                {a}
              </i>
            ))}
          </div>
          <span className="going">
            <b>{event.going}</b> going
          </span>
          <span className={`price${event.price_cents === 0 ? " free" : ""}`}>
            {formatPriceRange(event.price_cents, event.price_max_cents, event.currency)}
          </span>
        </div>
      </div>
    </Link>
  );
}
