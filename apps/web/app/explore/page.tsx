import Link from "next/link";
import { getCities, getHostels, getLiveCities } from "@/lib/queries";
import { formatPrice, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

export default async function ExplorePage() {
  const cities = getLiveCities();
  const hostels = getHostels();
  // Cities in the pipeline are named, not offered: the bar is the promise.
  const opening = getCities().filter((c) => c.status === "opening");

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Where you could be</div>
        <h1 className="page-title">Explore</h1>
        <p className="page-sub">
          Every city we&apos;re live in, and every hostel whose events we actually have. Book a
          bed and your trip window builds itself.
        </p>
      </header>

      <div className="city-grid">
        {cities.map((city) => {
          const cityHostels = hostels.filter((h) => h.city === city.slug);
          return (
            <section key={city.slug} className="city-card">
              <div className="city-card-head">
                <span className="city-emoji" aria-hidden="true">
                  {city.emoji}
                </span>
                <div>
                  <h2>{city.name}</h2>
                  <p>{city.country}</p>
                </div>
              </div>
              <p className="city-intro">{city.intro}</p>
              <p className="city-stats">
                <b>{plural(city.events, "thing")}</b> on this week ·{" "}
                <b>{plural(city.hostels, "hostel")}</b>
              </p>

              <div className="hostel-list">
                {cityHostels.map((h) => (
                  <Link key={h.id} href={`/hostel/${h.slug}`} className="hostel-row">
                    <span className="hostel-main">
                      <b>{h.name}</b>
                      <span>
                        {h.area} · {h.rating > 0 ? `★ ${h.rating.toFixed(1)}` : "new"} ·{" "}
                        {h.price_from_cents > 0
                          ? `from ${formatPrice(h.price_from_cents)}`
                          : "price on request"}
                      </span>
                    </span>
                    <span className="hostel-go" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Run a hostel?</h2>
          <span>free, and about a minute a night</span>
        </div>
        <p style={{ fontSize: 12.5, color: "#7b6e64", lineHeight: 1.7, margin: "0 0 10px" }}>
          Put your nights at the top of the feed your guests already open, and get a printable QR
          for reception that shows you exactly what it did.
        </p>
        <Link href="/partner" className="btn" style={{ display: "inline-block" }}>
          Apply to be a partner →
        </Link>
      </section>

      {opening.length > 0 ? (
        <section style={{ marginTop: 30 }}>
          <div className="day">
            <h2>Opening next</h2>
            <span>not open until there are enough nights to fill an evening</span>
          </div>
          <p style={{ fontSize: 12.5, color: "#7b6e64", lineHeight: 1.7, margin: "0 2px" }}>
            {opening.map((c) => c.name).join(", ")} — we switch a city on when{" "}
            {opening.length === 1 ? "it has" : "it has"} three hostels posting and a fortnight of
            things to do. A city guide that opens half-empty is a city guide nobody opens twice.
          </p>
        </section>
      ) : null}
    </>
  );
}
