import Link from "next/link";
import { cookies } from "next/headers";
import { CITY_COOKIE, type SessionUser } from "@/lib/auth";
import {
  getBookingsForUser,
  getCity,
  getCityEvents,
  getLiveCityOr,
  getJoinedCount,
  getTrips,
} from "@/lib/queries";
import { addDays, diffDays, formatDay, formatShortDate, timeOf, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export async function Aside({ user }: { user: SessionUser | null }) {
  const today = todayISO();
  const jar = await cookies();
  const city = getLiveCityOr(jar.get(CITY_COOKIE)?.value);

  const trips = getTrips(user?.id ?? null);
  const nextTrip = trips.find((t) => t.starts_on >= today) ?? trips[trips.length - 1];
  const tonight = city ? getCityEvents(city.slug, today, addDays(today, 1), user?.id ?? null).slice(0, 3) : [];
  const bookings = getBookingsForUser(user?.id ?? null);
  const joined = getJoinedCount(user?.id ?? null);

  const stayDays = nextTrip
    ? Array.from({ length: diffDays(nextTrip.starts_on, nextTrip.ends_on) + 1 }, (_, i) =>
        addDays(nextTrip.starts_on, i)
      )
    : [];

  return (
    <>
      {nextTrip ? (
        <div className="tripcard">
          <div className="lab">
            {nextTrip.starts_on > today
              ? `Next stop · in ${diffDays(today, nextTrip.starts_on)} days`
              : "You're here"}
          </div>
          <h3>
            {getCity(nextTrip.city)?.name ?? nextTrip.city} ·{" "}
            {plural(diffDays(nextTrip.starts_on, nextTrip.ends_on), "night")}
          </h3>
          <p>
            {formatShortDate(nextTrip.starts_on)} → {formatShortDate(nextTrip.ends_on)} ·{" "}
            {nextTrip.hostel_name ?? "hostel to book"}
          </p>
          <div className="days">
            {stayDays.slice(0, 7).map((d) => (
              <div key={d} className={`d${d === nextTrip.starts_on ? " hot" : ""}`}>
                <b>{Number(d.slice(8, 10))}</b>
                {formatDay(d).split(" ")[0]}
              </div>
            ))}
          </div>
          <Link href="/next" className="link">
            See what&apos;s on while you&apos;re there →
          </Link>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">Your trip</div>
          <p style={{ fontSize: 12.5, color: "#5a4f47", margin: 0, lineHeight: 1.5 }}>
            No trip saved yet. {user ? "Booking a bed creates one automatically." : "Sign in to see your own trip here."}
          </p>
          <Link href="/explore" className="btn small block" style={{ marginTop: 10 }}>
            Find a hostel
          </Link>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">Tonight in {city?.name ?? "Lisbon"}</div>
        <div className="mini">
          {tonight.length ? (
            tonight.map((e) => (
              <Link key={e.id} href={`/event/${e.id}`}>
                <span className="mt">{timeOf(e.starts_at)}</span>
                <span className="mx">
                  <b>{e.title}</b>
                  <span>
                    {e.going} going · {e.price_cents === 0 ? "free" : `€${e.price_cents / 100}`}
                  </span>
                </span>
              </Link>
            ))
          ) : (
            <p style={{ fontSize: 12, color: "#8b7d72", margin: 0 }}>
              Nothing on tonight yet.{" "}
              {user?.role === "hostel_staff" ? (
                <Link href="/post" style={{ textDecoration: "underline" }}>
                  Post something
                </Link>
              ) : null}
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">You</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0, color: "#4a403a" }}>
          <b>{plural(joined, "event")}</b> joined · <b>{plural(bookings.length, "booking")}</b>
          <br />
          <Link href="/trips" style={{ color: "#ff5a36", fontWeight: 700 }}>
            {bookings.length ? "View your bookings" : "Book a bed"}
          </Link>
        </p>
      </div>
    </>
  );
}
