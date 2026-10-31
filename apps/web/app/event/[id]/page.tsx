import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { ShareButton } from "@/components/share-button";
import { getEvent, getWhoIsGoing } from "@/lib/queries";
import { formatPrice, plural } from "@/lib/format";
import { endTime, formatDay, timeOf } from "@/lib/time";
import { CITIES, type CitySlug } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posted?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const event = getEvent(Number(id));
  if (!event) return { title: "Event not found" };
  return {
    title: event.title,
    description: `${formatDay(event.starts_at.slice(0, 10))} at ${timeOf(event.starts_at)} · ${event.venue}`,
  };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { posted } = await searchParams;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = getEvent(eventId);
  if (!event) notFound();

  const who = getWhoIsGoing(event.id);
  const city = CITIES[event.city as CitySlug] ?? CITIES.lisbon;
  const venueName = event.venue.split(" · ")[0];
  const soloLine =
    event.going > 0
      ? `${event.soloGoing} of ${event.going} going arrived alone`
      : "Nobody has joined yet — be the first";

  const lens = [soloLine, ...event.lens];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${venueName}, ${city.name}`
  )}`;

  return (
    <article style={{ maxWidth: 720 }}>
      <Link href="/" className="back">
        ← Back to what&apos;s on
      </Link>

      {posted ? (
        <div className="notice" role="status" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">✓</span>
          <span>
            <b>Published.</b> It&apos;s live in the feed and every guest in the hostel can see
            it. Join it yourself to see what happens.
          </span>
        </div>
      ) : null}

      <div
        className="hero"
        style={{ background: `linear-gradient(150deg, ${event.cover_from}, ${event.cover_to})` }}
        aria-hidden="true"
      >
        <span>{event.emoji}</span>
      </div>

      <div className="row1" style={{ marginTop: 16 }}>
        <span className={`badge ${event.source}`}>{event.source}</span>
        {event.hostel_name ? (
          <span className="badge" style={{ background: "#f3ede6", color: "#6b5b50" }}>
            {event.hostel_name}
          </span>
        ) : null}
        {event.capacity ? (
          <span className="badge" style={{ background: "#fdf0e4", color: "#a45e00" }}>
            {Math.max(0, event.capacity - event.going)} spots left
          </span>
        ) : null}
      </div>

      <h1 className="event-title">{event.title}</h1>

      <div className="meta">
        <span className="m">
          🕘 {timeOf(event.starts_at)}–{endTime(event.starts_at, event.duration_min)}
        </span>
        <span className="dot-sep" />
        <span className="m">
          📅 {formatDay(event.starts_at.slice(0, 10))}
        </span>
        <span className="dot-sep" />
        <span className="m">📍 {venueName}</span>
        <span className="dot-sep" />
        <span className="m">{formatPrice(event.price_cents)}</span>
      </div>

      <div className="lens">
        <div className="lt">The traveller lens</div>
        <ul>
          {lens.map((line, i) => (
            <li key={`${line}-${i}`}>
              <i aria-hidden="true">✓</i>
              <span>{line}</span>
            </li>
          ))}
          <li>
            <i aria-hidden="true">✓</i>
            <span>{event.walk_minutes} min walk from your bed</span>
          </li>
        </ul>
      </div>

      <p className="desc">{event.description}</p>

      <div className="notice">
        <span aria-hidden="true">🛟</span>
        <span>
          Meet at the venue — public place, hostel staff on site, no DMs required. If you
          arrive alone, tell whoever is at the door you&apos;re from {event.hostel_name ?? "the hostel"}.
        </span>
      </div>

      <div className="cta-row">
        <JoinButton
          eventId={event.id}
          going={event.going}
          joined={event.isJoined}
          free={event.price_cents === 0}
        />
        <a className="btn" href={mapsUrl} target="_blank" rel="noreferrer">
          Directions
        </a>
        <ShareButton title={event.title} />
      </div>

      <section className="whos">
        <div className="panel-head">
          Who&apos;s going · {plural(who.length, "person", "people")}
        </div>
        <div className="whos-list">
          {who.length === 0 ? (
            <p style={{ fontSize: 12, color: "#8b7d72", margin: 0 }}>
              No one yet. Joining first is allowed.
            </p>
          ) : (
            who.slice(0, 12).map((t) => (
              <div className="who" key={t.id}>
                <span
                  className="av"
                  style={{ background: t.colour }}
                  aria-hidden="true"
                >
                  {t.initials}
                </span>
                <span className="wt">
                  <b>
                    {t.name} <span aria-hidden="true">{t.flag}</span>
                  </b>
                  <span>{t.languages}</span>
                </span>
              </div>
            ))
          )}
        </div>
        {who.length > 12 ? (
          <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "10px 0 0" }}>
            + {who.length - 12} more going
          </p>
        ) : null}
      </section>

      <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 26, lineHeight: 1.6 }}>
        Source: <b>{event.source}</b> · posted by{" "}
        {event.created_by === "hostel-staff" ? "hostel staff (this demo)" : "the seed data"} ·
        joined live from the SQLite database.
      </p>
    </article>
  );
}
