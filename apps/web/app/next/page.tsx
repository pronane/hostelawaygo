import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { getCurrentUser } from "@/lib/auth";
import { getCity, getCityEvents, getTrips, groupByDay, withWindowStatus } from "@/lib/queries";
import { addDays, diffDays, formatDay, formatShortDate, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Next stop" };

export default async function NextPage() {
  const today = todayISO();
  const user = await getCurrentUser();
  const trips = getTrips(user?.id ?? null);
  const trip = trips.find((t) => t.starts_on >= today) ?? trips[trips.length - 1];

  if (!trip) {
    return (
      <>
        <header className="page-head">
          <div className="eyebrow">Next stop</div>
          <h1 className="page-title">Nowhere yet</h1>
          <p className="page-sub">
            Book a bed and this page fills up with what&apos;s on while you&apos;re there — down
            to the hour you land and the hour your bus leaves.
          </p>
        </header>
        <Link href="/explore" className="btn primary block" style={{ marginTop: 20, maxWidth: 280 }}>
          Find a hostel
        </Link>
      </>
    );
  }

  const city = getCity(trip.city);
  const daysToGo = diffDays(today, trip.starts_on);
  const nights = diffDays(trip.starts_on, trip.ends_on);

  const raw = getCityEvents(trip.city, addDays(trip.starts_on, -1), addDays(trip.ends_on, 3), user?.id ?? null);
  const events = withWindowStatus(raw, trip.starts_on, trip.ends_on, trip.arrival_time, trip.departure_time);
  const inWindow = events.filter((e) => e.status === "in");
  const outside = events.filter((e) => e.status !== "in");
  const groups = groupByDay([...inWindow, ...outside]);

  const stayDays = Array.from({ length: Math.min(nights + 1, 7) }, (_, i) => addDays(trip.starts_on, i));

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          Next stop · {daysToGo > 0 ? `in ${daysToGo} days` : "you're there"}
        </div>
        <h1 className="page-title">{city?.name ?? trip.city}</h1>
        <p className="page-sub">
          Everything inside your dates, in one timeline. Nothing before you land, nothing after
          your bus.
        </p>
      </header>

      <div className="tripcard mobile-only" style={{ marginTop: 16 }}>
        <div className="lab">Your window</div>
        <h3>
          {city?.name} · {plural(nights, "night")}
        </h3>
        <p>
          Arrive {formatShortDate(trip.starts_on)} {trip.arrival_time} · leave{" "}
          {formatShortDate(trip.ends_on)} {trip.departure_time}
        </p>
        <div className="days">
          {stayDays.map((d) => (
            <div key={d} className={`d${d === trip.starts_on ? " hot" : ""}`}>
              <b>{Number(d.slice(8, 10))}</b>
              {formatDay(d).split(" ")[0]}
            </div>
          ))}
        </div>
      </div>

      <div className="notice" style={{ marginTop: 18 }}>
        <span aria-hidden="true">🎯</span>
        <span>
          <b>{plural(inWindow.length, "thing")} on while you&apos;re there.</b> Greyed-out cards
          are outside your window — kept visible so you can see what you&apos;re missing and
          decide whether to stay another night.
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="empty">Nothing listed for {city?.name} yet.</div>
      ) : (
        groups.map((g) => {
          const anyIn = g.events.some((e) => e.status === "in");
          return (
            <section key={g.date} aria-labelledby={`pday-${g.date}`}>
              <div className="day">
                <h2 id={`pday-${g.date}`}>{formatDay(g.date)}</h2>
                <span>
                  {anyIn ? "in your window" : "outside your dates"} · {plural(g.events.length, "thing")}
                </span>
              </div>
              {g.events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </section>
          );
        })
      )}

      <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "30px 2px 0", lineHeight: 1.6 }}>
        Trip window: {formatShortDate(trip.starts_on)} {trip.arrival_time} →{" "}
        {formatShortDate(trip.ends_on)} {trip.departure_time}, staying at{" "}
        {trip.hostel_name ?? "a hostel"}. Book different dates and the feed re-sorts itself.
      </p>

      <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "12px 2px 0" }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          ← Back to what&apos;s on now
        </Link>
      </p>
    </>
  );
}
