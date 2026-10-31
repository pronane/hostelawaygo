import Link from "next/link";
import { getCityEvents, getJoinedCount, getTrip } from "@/lib/queries";
import { addDays, diffDays, formatDay, formatShortDate, timeOf, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export function Aside() {
  const today = todayISO();
  const porto = getTrip("porto");
  const tonight = getCityEvents("lisbon", today, addDays(today, 1)).slice(0, 3);
  const joined = getJoinedCount();
  const daysToPorto = porto ? diffDays(today, porto.starts_on) : 0;

  const stayDays = porto
    ? Array.from({ length: diffDays(porto.starts_on, porto.ends_on) + 1 }, (_, i) =>
        addDays(porto.starts_on, i)
      )
    : [];

  return (
    <>
      {porto ? (
        <div className="tripcard">
          <div className="lab">Next stop · in {daysToPorto} days</div>
          <h3>Porto · {plural(diffDays(porto.starts_on, porto.ends_on), "night")}</h3>
          <p>
            {formatShortDate(porto.starts_on)} → {formatShortDate(porto.ends_on)} ·{" "}
            {porto.hostel_name ?? "hostel to book"}
          </p>
          <div className="days">
            {stayDays.map((d) => (
              <div key={d} className={`d${d === porto.starts_on ? " hot" : ""}`}>
                <b>{Number(d.slice(8, 10))}</b>
                {formatDay(d).split(" ")[0]}
              </div>
            ))}
          </div>
          <Link href="/next" className="link">
            See what&apos;s on while you&apos;re there →
          </Link>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">Tonight in Lisbon</div>
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
              Nothing on tonight yet. Post something and watch it fill.
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">You</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0, color: "#4a403a" }}>
          <b>{plural(joined, "event")}</b> saved on this trip.
          <br />
          <Link href="/post" style={{ color: "#ff5a36", fontWeight: 700 }}>
            Posting as hostel staff?
          </Link>
        </p>
      </div>

      <div className="rail-note" style={{ marginTop: 2 }}>
        <b>Working vertical slice.</b> Real SQLite database, seeded Lisbon and Porto data,
        live join counts. No booking, no payments, no chat — on purpose.{" "}
        <code style={{ fontSize: 10.5 }}>npm run db:reset</code> re-dates the seed to today.
      </div>
    </>
  );
}
