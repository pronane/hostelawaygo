import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { ShareButton } from "@/components/share-button";
import { ChatLive } from "@/components/chat-live";
import { getCurrentUser } from "@/lib/auth";
import { getArrivalCohort, getCity, getEvent, getMessages, getWhoIsGoing } from "@/lib/queries";
import { getGroupsForEvent } from "@/lib/groups";
import { createGroupAction } from "@/app/actions/groups";
import { formatPriceRange, plural, walkLabel } from "@/lib/format";
import { endTime, formatDay, formatSqlTime, timeOf } from "@/lib/time";


export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posted?: string; chat?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  // getEvent with no viewer already hides guests-only nights, so a null here
  // means either "doesn't exist" or "not yours" — neither belongs in an index.
  const event = await getEvent(Number(id), null);
  if (!event) return { title: "Event not found", robots: { index: false, follow: false } };

  const description = `${formatDay(event.starts_at.slice(0, 10))} at ${timeOf(event.starts_at)} · ${event.venue}`;
  return {
    title: event.title,
    description,
    openGraph: { title: event.title, description, type: "article" },
    ...(event.open_to_all === 0 ? { robots: { index: false, follow: false } } : {}),
  };
}

const CHAT_NOTES: Record<string, string> = {
  slow: "Slow down a second — you've sent a lot of messages in the last few minutes.",
  empty: "Nothing to send there.",
  reported: "Thanks — a hostel host will look at that message.",
  verify: "Confirm your email to chat — we sent you a link. Lost it? Send a new one from the You page.",
};

export default async function EventPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { posted, chat } = await searchParams;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const user = await getCurrentUser();
  const event = await getEvent(eventId, user?.id ?? null);
  if (!event) notFound();

  const who = await getWhoIsGoing(event.id);
  const groups = await getGroupsForEvent(event.id);
  const groupPeople = groups.reduce((total, group) => total + group.people, 0);
  const messages = await getMessages(event.id, user?.id ?? null);
  // Cities are rows now, not a constant: a city opened in the console has to
  // work here without a deploy.
  const city = await getCity(event.city);
  const cityName = city?.name ?? event.city;
  const venueName = event.venue.split(" · ")[0];
  const soloLine =
    event.going > 0
      ? `${event.soloGoing} of ${event.going} going arrived alone`
      : "Nobody has joined yet — be the first";

  // "19 going" is a number. "4 of them are staying in Lisbon that night" is a
  // reason to go, and it comes free from the bookings already on file.
  const cohort = await getArrivalCohort(event.id, event.city, event.starts_at.slice(0, 10));
  const hereLine =
    cohort.here > 0
      ? `${cohort.here} of the ${event.going} ${cohort.here === 1 ? "is" : "are"} staying in ${cityName} that night`
      : null;
  const arrivingLine =
    cohort.arriving > 0
      ? `${cohort.arriving} more ${cohort.arriving === 1 ? "arrives" : "arrive"} within the week`
      : null;

  const lens = [soloLine, hereLine, arrivingLine, ...event.lens].filter(
    (line): line is string => Boolean(line)
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${venueName}, ${cityName}`
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
        {event.open_to_all === 0 ? (
          <span className="badge" style={{ background: "#f3ede6", color: "#6b5b50" }}>guests only</span>
        ) : null}
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

      {user ? (
        <p style={{ fontSize: 12.5, color: "#6b5b50", margin: "10px 0 0" }}>
          🛟 Heading out alone?{" "}
          <Link href={`/safe?event=${event.id}`} style={{ textDecoration: "underline" }}>
            Share your night with a friend
          </Link>{" "}
          — they&apos;ll see when you check in home.
        </p>
      ) : null}

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

      {/* ------------------------------------------------------- group nights */}
      <section className="whos" style={{ marginTop: 18 }}>
        <div className="panel-head">
          {groups.length > 0
            ? `Coming together · ${plural(groupPeople, "person", "people")} in ${plural(groups.length, "group")}`
            : "Coming with people?"}
        </div>

        {groups.length > 0 ? (
          <div className="admin-list" style={{ marginTop: 10 }}>
            {groups.map((group) => (
              <Link key={group.id} href={`/g/${group.token}`} className="admin-row" style={{ textDecoration: "none" }}>
                <div className="admin-main">
                  <b>{group.plan ?? event.title}</b>
                  <span>
                    {plural(group.people, "person", "people")} going
                    {group.size && group.size > group.people ? ` · ${group.size} expected` : ""}
                  </span>
                </div>
                <div className="admin-actions">
                  <span className="status ok">open</span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        <form action={createGroupAction} className="form-wrap" style={{ marginTop: 12 }}>
          <input type="hidden" name="eventId" value={event.id} />
          <div className="twocol">
            <div className="field">
              <label htmlFor="group-size">How many of you?</label>
              <select id="group-size" name="size" defaultValue="3">
                {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="group-plan">Call it something (optional)</label>
              <input
                id="group-plan"
                name="plan"
                maxLength={60}
                placeholder={`${event.title} with the dorm`}
              />
            </div>
          </div>
          <button type="submit" className="btn" style={{ marginTop: 12 }}>
            Make a group link
          </button>
          <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "10px 0 0", lineHeight: 1.6 }}>
            One link. Your people tap it and add a first name — no account, no download. The hostel
            sees how many of you are coming, which is how the curry gets made.
          </p>
        </form>
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
