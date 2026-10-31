import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { ShareButton } from "@/components/share-button";
import { ChatLive } from "@/components/chat-live";
import { getCurrentUser } from "@/lib/auth";
import { getEvent, getMessages, getWhoIsGoing } from "@/lib/queries";
import { formatPriceRange, plural, walkLabel } from "@/lib/format";
import { endTime, formatDay, formatSqlTime, timeOf } from "@/lib/time";
import { CITIES, type CitySlug } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posted?: string; chat?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const event = getEvent(Number(id), null);
  if (!event) return { title: "Event not found" };
  return {
    title: event.title,
    description: `${formatDay(event.starts_at.slice(0, 10))} at ${timeOf(event.starts_at)} · ${event.venue}`,
  };
}

const CHAT_NOTES: Record<string, string> = {
  slow: "Slow down a second — you've sent a lot of messages in the last few minutes.",
  empty: "Nothing to send there.",
  reported: "Thanks — a hostel host will look at that message.",
};

export default async function EventPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { posted, chat } = await searchParams;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const user = await getCurrentUser();
  const event = getEvent(eventId, user?.id ?? null);
  if (!event) notFound();

  const who = getWhoIsGoing(event.id);
  const messages = getMessages(event.id, user?.id ?? null);
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
    <article style={{ maxWidth: 760 }}>
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
        {event.hostel_slug ? (
          <Link href={`/hostel/${event.hostel_slug}`} className="badge" style={{ background: "#f3ede6", color: "#6b5b50" }}>
            {event.hostel_name} · book a bed
          </Link>
        ) : event.hostel_name ? (
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
        <span className="m">📅 {formatDay(event.starts_at.slice(0, 10))}</span>
        <span className="dot-sep" />
        <span className="m">📍 {venueName}</span>
        <span className="dot-sep" />
        <span className="m">{formatPriceRange(event.price_cents, event.price_max_cents, event.currency)}</span>
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
            <span>{walkLabel(event.walk_minutes, event.walkFrom)}</span>
          </li>
        </ul>
      </div>

      <p className="desc">{event.description}</p>

      <div className="notice">
        <span aria-hidden="true">🛟</span>
        <span>
          Meet at the venue — public place, hostel staff on site. Chat is for logistics, not for
          anything you wouldn&apos;t say at the front desk.
        </span>
      </div>

      <div className="cta-row">
        {user ? (
          <JoinButton
            eventId={event.id}
            going={event.going}
            joined={event.isJoined}
            free={event.price_cents === 0}
          />
        ) : (
          <Link
            className="btn primary"
            href={`/login?next=${encodeURIComponent(`/event/${event.id}`)}`}
          >
            Sign in to join · {event.going} going
          </Link>
        )}
        <a className="btn" href={mapsUrl} target="_blank" rel="noreferrer">
          Directions
        </a>
        {event.ticket_url ? (
          <a className="btn" href={event.ticket_url} target="_blank" rel="noreferrer">
            Get tickets ↗
          </a>
        ) : null}
        <ShareButton title={event.title} />
      </div>

      <section id="chat" className="chat">
        {chat && CHAT_NOTES[chat] ? (
          <div className="notice warn" role="status" style={{ margin: "0 0 12px" }}>
            <span aria-hidden="true">💬</span>
            <span>{CHAT_NOTES[chat]}</span>
          </div>
        ) : null}

        <ChatLive
          eventId={event.id}
          initial={messages}
          signedIn={Boolean(user)}
          placeholder="Anyone going from Home Lisbon? Walking over at 19:00."
        />
      </section>

      <section className="whos">
        <div className="panel-head">Who&apos;s going · {plural(who.length, "person", "people")}</div>
        <div className="whos-list">
          {who.length === 0 ? (
            <p style={{ fontSize: 12, color: "#8b7d72", margin: 0 }}>
              No one yet. Joining first is allowed.
            </p>
          ) : (
            who.slice(0, 12).map((t) => (
              <div className="who" key={t.id}>
                <span className="av" style={{ background: t.colour }} aria-hidden="true">
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
        Source: <b>{event.source}</b>
        {event.origin === "ingest" ? " (imported automatically)" : ""} · posted by{" "}
        {event.created_by.startsWith("staff:") ? "hostel staff" : event.created_by} · joined live
        from the database.
      </p>

    </article>
  );
}
