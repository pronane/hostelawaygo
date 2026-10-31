import Link from "next/link";
import { getCities, getHostels } from "@/lib/queries";
import { formatPrice, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

export default async function ExplorePage() {
  const cities = getCities();
  const hostels = getHostels();

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
                        {h.area} · ★ {h.rating.toFixed(1)} · from {formatPrice(h.price_from_cents)}
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
    </>
  );
}
