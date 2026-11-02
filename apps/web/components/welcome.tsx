import Link from "next/link";
import { plural } from "@/lib/format";

/**
 * The first thing a stranger sees. Everything else in this app assumes you
 * already know what it is — you are in a city, you have a hostel, there is a
 * feed — so the one screen that has to explain itself is `/` for somebody with
 * no session and no city cookie.
 *
 * It is deliberately not a marketing page floated above the product: the feed
 * is right underneath, and every number in here is read from the same database
 * the feed reads.
 */
export function Welcome({
  city,
  hostels,
  cities,
  events,
  walkable,
}: {
  city: { slug: string; name: string; intro: string };
  hostels: number;
  cities: number;
  events: number;
  /** How many of this week's events are inside a 15 minute walk. */
  walkable: number;
}) {
  return (
    <section className="welcome">
      <div className="eyebrow">
        <span className="live" /> {city.name} · {plural(cities, "city", "cities")} · no account needed
      </div>

      <h1 className="welcome-title">
        The hostel you&apos;re in,
        <br />
        and what&apos;s on tonight.
      </h1>

      <p className="welcome-sub">
        Away is the noticeboard the hostel never had. Pick the hostel you&apos;re sleeping in and you
        get this week&apos;s events within walking distance of its door, tonight&apos;s plan sorted by how
        far you&apos;d walk, and the other people in the building saying they&apos;ll be there.
      </p>

      <div className="cta-row">
        <Link href={`/c/${city.slug}`} className="btn primary">
          Find your hostel
        </Link>
        <Link href="/hostels" className="btn">
          I run a hostel →
        </Link>
      </div>

      <div className="stat-row">
        <div className="stat">
          <b>{hostels}</b>
          <span>HOSTELS ON THE MAP</span>
        </div>
        <div className="stat">
          <b>{events}</b>
          <span>THINGS ON THIS WEEK</span>
        </div>
        <div className="stat">
          <b>{walkable}</b>
          <span>UNDER 15 MIN WALK</span>
        </div>
      </div>

      <div className="runbook">
        <div className="run-step">
          <span className="run-when">1 · pick</span>
          <span className="run-what">
            <b>Your hostel, not just the city</b>
            <span>
              Each hostel has a page with its rooms, its nightly price and everything it has on —
              not a listing on someone else&apos;s booking site.
            </span>
          </span>
        </div>
        <div className="run-step">
          <span className="run-when">2 · see</span>
          <span className="run-what">
            <b>Tonight, within walking distance</b>
            <span>
              Hostel nights, the city&apos;s own festivals and gigs, and things other travellers
              posted an hour ago — all ordered by walk time from your bed.
            </span>
          </span>
        </div>
        <div className="run-step">
          <span className="run-when">3 · meet</span>
          <span className="run-what">
            <b>The people in the building</b>
            <span>
              Say you&apos;re going, chat with the others going, and get back before your hostel
              stops caring — or share your night with a friend if you&apos;re out late.
            </span>
          </span>
        </div>
      </div>

      <p className="welcome-foot">
        A hostel can put something on tonight in about a minute —{" "}
        <Link href="/hostels">here&apos;s what the front desk actually gets</Link>.
      </p>
    </section>
  );
}
