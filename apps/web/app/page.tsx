import Link from "next/link";
import { cookies } from "next/headers";
import { EventCard } from "@/components/event-card";
import { CityPicker } from "@/components/city-picker";
import { FILTERS } from "@/lib/constants";
import { CITY_COOKIE, getCurrentUser } from "@/lib/auth";
import { getCities, getCity, getCityEvents, getTrip, groupByDay } from "@/lib/queries";
import { addDays, dayHeading, formatDay, nightsBetween, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ f?: string; denied?: string }>;
};

export default async function HerePage({ searchParams }: Props) {
  const { f, denied } = await searchParams;
  const filter = FILTERS.some((x) => x.key === f) ? (f as string) : "all";
  const today = todayISO();

  const user = await getCurrentUser();
  const jar = await cookies();
  const slug = jar.get(CITY_COOKIE)?.value ?? "lisbon";
  const city = getCity(slug) ?? getCity("lisbon")!;

  const events = getCityEvents(city.slug, today, addDays(today, 7), user?.id ?? null);
  const filtered = filter === "all" ? events : events.filter((e) => e.tags.includes(filter));
  const groups = groupByDay(filtered);
  const trip = getTrip(city.slug, user?.id ?? null);
  const cities = getCities();

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="live" /> Here · {formatDay(today)}
        </div>
        <div className="title-row">
          <h1 className="page-title">{city.name}</h1>
          <CityPicker cities={cities} current={city.slug} next="/" />
        </div>
        <p className="page-sub">
          {city.intro} {plural(events.length, "thing")} on in the next week — hostel nights, the
          city&apos;s own festivals and gigs, and whatever a traveller posted an hour ago.
        </p>
        {trip ? (
          <div className="staybar">
            <span aria-hidden="true">🛏</span>
            <b>{trip.hostel_name ?? "Your hostel"}</b>
            <span className="dot-sep" />
            <span>check-out {formatDay(trip.ends_on)}</span>
            <span className="dot-sep" />
            <span className="accent">{plural(nightsBetween(today, trip.ends_on), "night")} left</span>
          </div>
        ) : null}
      </header>

      {denied ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">🔒</span>
          <span>
            {denied === "staff"
              ? "That area is for hostel staff. Sign in as Ana (Home Lisbon) to try it."
              : "That area is for Away ops. Sign in as Ops to try it."}
          </span>
        </div>
      ) : null}

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

      {groups.length === 0 ? (
        <div className="empty">
          Nothing on in {city.name} with that filter.
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
        Filters are server-rendered, so every view has a URL — try{" "}
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
