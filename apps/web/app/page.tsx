import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { FILTERS } from "@/lib/constants";
import { getCityEvents, getTrip, groupByDay } from "@/lib/queries";
import { addDays, dayHeading, formatDay, nightsBetween, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ f?: string; posted?: string }>;
};

export default async function HerePage({ searchParams }: Props) {
  const { f, posted } = await searchParams;
  const filter = FILTERS.some((x) => x.key === f) ? (f as string) : "all";
  const today = todayISO();

  const events = getCityEvents("lisbon", today, addDays(today, 7));
  const filtered = filter === "all" ? events : events.filter((e) => e.tags.includes(filter));
  const groups = groupByDay(filtered);
  const trip = getTrip("lisbon");

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="live" /> Here · {formatDay(today)}
        </div>
        <h1 className="page-title">
          Lisbon
          <span className="chev" aria-hidden="true">
            ▾
          </span>
        </h1>
        <p className="page-sub">
          {plural(events.length, "thing")} on in the next week — hostel nights, the city&apos;s
          own festivals and gigs, and whatever a traveller posted an hour ago.
        </p>
        {trip ? (
          <div className="staybar">
            <span aria-hidden="true">🛏</span>
            <b>{trip.hostel_name}</b>
            <span className="dot-sep" />
            <span>check-out {formatDay(trip.ends_on)}</span>
            <span className="dot-sep" />
            <span className="accent">{plural(nightsBetween(today, trip.ends_on), "night")} left</span>
          </div>
        ) : null}
      </header>

      <nav className="chips" aria-label="Filter by">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/" : `/?f=${x.key}`}
            className="chip"
            data-on={filter === x.key}
            scroll={false}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {posted ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            Published — it&apos;s live in the feed now, and every guest in the hostel can see
            it. <Link href={`/event/${posted}`} style={{ fontWeight: 700, textDecoration: "underline" }}>View it</Link>
          </span>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="empty">
          Nothing on with that filter.
          <br />
          <Link href="/" style={{ color: "#ff5a36", fontWeight: 700 }}>
            Clear the filter
          </Link>{" "}
          — there are {plural(events.length, "thing")} on this week.
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.date} aria-labelledby={`day-${g.date}`}>
            <div className="day">
              <h2 id={`day-${g.date}`}>{dayHeading(g.date, today)}</h2>
              <span>
                {formatDay(g.date)} · {plural(g.events.length, "thing")} on
              </span>
            </div>
            {g.events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </section>
        ))
      )}

      <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "30px 2px 0", lineHeight: 1.6 }}>
        Seeded demo data for Lisbon. Filters are server-rendered and shareable — try{" "}
        <Link href="/?f=free" style={{ textDecoration: "underline" }}>
          /?f=free
        </Link>{" "}
        or{" "}
        <Link href="/?f=solo" style={{ textDecoration: "underline" }}>
          /?f=solo
        </Link>
        .
      </p>
    </>
  );
}
