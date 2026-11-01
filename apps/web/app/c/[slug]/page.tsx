import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/event-card";
import { ShareButton } from "@/components/share-button";
import { getCity, getCityEvents, getHostels, groupByDay } from "@/lib/queries";
import { addDays, formatDay, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * The page that gets indexed.
 *
 * `/` is a personal feed — it follows a cookie and changes per traveller, which
 * makes it useless as a landing page. This is the stable, public, crawlable
 * version: "What's on in Lisbon this week", the same content with no session.
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city || city.status !== "live") return { title: "City not found" };

  const today = todayISO();
  const events = await getCityEvents(city.slug, today, addDays(today, 7), null);
  const title = `What's on in ${city.name} this week`;
  const description = `${city.intro} ${plural(events.length, "event")} in the next seven days, from hostel nights to ticketed gigs.`;

  return {
    title,
    description,
    alternates: { canonical: `/c/${city.slug}` },
    openGraph: { title, description, type: "website", url: `/c/${city.slug}` },
  };
}

export default async function PublicCityPage({ params }: Props) {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city || city.status !== "live") notFound();

  const today = todayISO();
  const events = await getCityEvents(city.slug, today, addDays(today, 7), null);
  const groups = groupByDay(events);
  const hostels = (await getHostels(city.slug)).filter((h) =>
    events.some((e) => e.hostel_id === h.id)
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `What's on in ${city.name} this week`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 20).map((e, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        name: e.title,
        startDate: e.starts_at,
        eventStatus: "https://schema.org/EventScheduled",
        location: {
          "@type": "Place",
          name: e.venue.split(" · ")[0],
          address: { "@type": "PostalAddress", addressLocality: city.name, addressCountry: city.country },
        },
        ...(e.price_cents > 0
          ? {
              offers: {
                "@type": "Offer",
                price: (e.price_cents / 100).toFixed(2),
                priceCurrency: e.currency,
                availability: "https://schema.org/InStock",
              },
            }
          : { isAccessibleForFree: true }),
      },
    })),
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="page-head">
        <div className="eyebrow">
          {city.emoji} {city.country} · {formatDay(today)} · public page
        </div>
        <h1 className="page-title">What&apos;s on in {city.name}</h1>
        <p className="page-sub">
          {city.intro} {plural(events.length, "thing")} on in the next seven days — hostel nights,
          the city&apos;s own gigs, and whatever a traveller posted this morning. No sign-up to
          read it.
        </p>
        <div className="cta-row">
          <Link href="/" className="btn primary" style={{ flex: "0 0 auto" }}>
            Open the live feed
          </Link>
          <ShareButton title={`What's on in ${city.name} this week`} />
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="empty">
          Nothing is listed in {city.name} this week yet.
          <br />
          <Link href="/explore" style={{ color: "#ff5a36", fontWeight: 700 }}>
            See where we are live
          </Link>
          .
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.date} aria-labelledby={`c-${group.date}`}>
            <div className="day">
              <h2 id={`c-${group.date}`}>{formatDay(group.date)}</h2>
              <span>{plural(group.events.length, "thing")} on</span>
            </div>
            {group.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </section>
        ))
      )}

      {hostels.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <div className="day">
            <h2>Hostels behind these nights</h2>
            <span>{plural(hostels.length, "hostel")}</span>
          </div>
          <div className="admin-list">
            {hostels.map((hostel) => (
              <Link key={hostel.id} href={`/hostel/${hostel.slug}`} className="admin-row">
                <div className="admin-main">
                  <b>{hostel.name}</b>
                  <span>
                    {hostel.area} · ★ {hostel.rating.toFixed(1)} · from{" "}
                    {new Intl.NumberFormat("en", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(hostel.price_from_cents / 100)}{" "}
                    a night
                  </span>
                </div>
                <div className="admin-actions">
                  <span className="hostel-go" aria-hidden="true">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 30, lineHeight: 1.6 }}>
        This page updates itself from hostel listings and the city&apos;s ticketed calendar. Staying
        in a hostel in {city.name}? Scan the code at reception and this becomes your feed, matched
        to your dates.
      </p>
    </article>
  );
}
