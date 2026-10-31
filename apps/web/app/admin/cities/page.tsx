import Link from "next/link";
import { createCityAction } from "@/app/actions/cities";
import { requireAdmin } from "@/lib/auth";
import { CITY_STATUS, LAUNCH_BAR } from "@/lib/cities";
import { getCityPipeline } from "@/lib/queries";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "City pipeline" };

const ERRORS: Record<string, string> = {
  slug: "That slug won't work in a URL. Lowercase letters, numbers and dashes, 2–40 characters.",
  name: "Give the city a name.",
  country: "Give the city a country.",
  tz: "Use an IANA timezone, e.g. Europe/Warsaw. We validate it against the browser's own list.",
  intro: "Write a one-line intro of at least 20 characters — it's the first thing travellers read.",
  lat: "The latitude needs to be a number between -90 and 90.",
  lng: "The longitude needs to be a number between -180 and 180.",
  status: "Unknown status.",
  unknown: "That city doesn't exist any more.",
};

const ORDER = { live: 0, opening: 1, planned: 2 } as const;

export default async function CitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin("/admin/cities");
  const { error } = await searchParams;

  const pipeline = getCityPipeline().sort(
    (a, b) =>
      ORDER[a.city.status] - ORDER[b.city.status] ||
      b.readiness.passed - a.readiness.passed ||
      a.city.name.localeCompare(b.city.name)
  );

  const live = pipeline.filter((p) => p.city.status === "live");
  const opening = pipeline.filter((p) => p.city.status === "opening");
  const planned = pipeline.filter((p) => p.city.status === "planned");
  const liveEvents = live.reduce((sum, p) => sum + p.supply.eventsWeek, 0);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Away ops · expansion</div>
        <h1 className="page-title">Cities</h1>
        <p className="page-sub">
          Every city is opened the same way: a record, {LAUNCH_BAR.partners} partner hostels,{" "}
          {LAUNCH_BAR.postingHostels} of them posting, {LAUNCH_BAR.events} things on in the next{" "}
          {LAUNCH_BAR.windowDays} days, and a launch date. Nothing shows up in the app until it
          clears the bar.
        </p>
      </header>

      {error ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{ERRORS[error] ?? decodeURIComponent(error)}</span>
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat">
          <b>{live.length}</b>
          <span>LIVE CITIES</span>
        </div>
        <div className="stat">
          <b>{opening.length}</b>
          <span>OPENING</span>
        </div>
        <div className="stat">
          <b>{planned.length}</b>
          <span>ON THE LIST</span>
        </div>
        <div className="stat">
          <b>{liveEvents}</b>
          <span>THINGS ON THIS WEEK</span>
        </div>
      </div>

      <section style={{ marginTop: 26 }}>
        <div className="day">
          <h2>Pipeline</h2>
          <span>{plural(pipeline.length, "city", "cities")}</span>
        </div>

        <div className="city-grid">
          {pipeline.map(({ city, supply, readiness }) => {
            const status = CITY_STATUS[city.status];
            return (
              <section key={city.slug} className="city-card">
                <div className="city-card-head">
                  <span className="city-emoji" aria-hidden="true">
                    {city.emoji}
                  </span>
                  <div>
                    <h2>{city.name}</h2>
                    <p>
                      {city.country} · /{city.slug}
                    </p>
                  </div>
                  <span className={`status ${status.tone}`}>{status.label}</span>
                </div>

                <div className="meter" aria-hidden="true">
                  <i style={{ width: `${readiness.percent}%` }} data-full={readiness.canLaunch} />
                </div>

                <p className="city-stats">
                  <b>
                    {readiness.passed}/{readiness.total} gates
                  </b>{" "}
                  · {plural(supply.events, "thing")} in {LAUNCH_BAR.windowDays} days ·{" "}
                  {plural(supply.hostels, "hostel")}
                </p>

                <p className="gate-next">{readiness.nextAction}</p>

                <div className="cta-row">
                  <Link href={`/admin/cities/${city.slug}`} className="btn small">
                    Open console
                  </Link>
                  {city.status === "live" ? (
                    <Link href={`/c/${city.slug}`} className="btn small">
                      Public page
                    </Link>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 34 }}>
        <div className="day">
          <h2>Add a city</h2>
          <span>starts as opening — never live</span>
        </div>

        <form action={createCityAction} className="form-wrap panel">
          <div className="twocol">
            <div className="field">
              <label htmlFor="name">City</label>
              <input id="name" name="name" placeholder="Seville" required maxLength={60} />
            </div>
            <div className="field">
              <label htmlFor="country">Country</label>
              <input id="country" name="country" placeholder="Spain" required maxLength={60} />
            </div>
          </div>

          <div className="twocol">
            <div className="field">
              <label htmlFor="tz">Timezone</label>
              <input id="tz" name="tz" placeholder="Europe/Madrid" required />
            </div>
            <div className="field">
              <label htmlFor="emoji">Emoji</label>
              <input id="emoji" name="emoji" placeholder="🕌" maxLength={8} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="intro">One-line intro</label>
            <textarea
              id="intro"
              name="intro"
              placeholder="Orange trees, cheap beer, and a hostel bar that starts at nine."
              required
              minLength={20}
              maxLength={200}
            />
          </div>

          <div className="twocol">
            <div className="field">
              <label htmlFor="lat">Latitude</label>
              <input id="lat" name="lat" inputMode="decimal" placeholder="37.3891" required />
            </div>
            <div className="field">
              <label htmlFor="lng">Longitude</label>
              <input id="lng" name="lng" inputMode="decimal" placeholder="-5.9845" required />
            </div>
          </div>

          <div className="twocol">
            <div className="field">
              <label htmlFor="launchOn">Launch date (optional)</label>
              <input id="launchOn" name="launchOn" type="date" />
            </div>
            <div className="field">
              <label htmlFor="slug">Slug (optional)</label>
              <input id="slug" name="slug" placeholder="seville" maxLength={40} />
            </div>
          </div>

          <button type="submit" className="publish">
            Open the city
          </button>
          <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 10, lineHeight: 1.6 }}>
            The centre is where &ldquo;how far is it&rdquo; is measured from until a traveller has a
            hostel booked. Right-click the spot in Google Maps to copy coordinates.
          </p>
        </form>
      </section>
    </>
  );
}
