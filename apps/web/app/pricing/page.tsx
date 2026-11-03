import Link from "next/link";
import { demoLoginEnabled } from "@/lib/flags";
import { PLAN_COPY } from "@/lib/plans";

export const metadata = {
  title: "Pricing — Away for hostels",
  description:
    "Away is free for hostels to be listed and to post tonight. Pro is €19 a month: the reception screen and the weekly receipt that shows what the poster did. No commission, cancel in one click.",
};

/**
 * The subscription page.
 *
 * Written for the person who has just been handed it by another hostel: what it
 * costs, what they get, what they never pay for, and the one comparison that
 * makes €19 legible — a single dorm bed, against 15–18% commission on every
 * booking for the room they already sold.
 */
export default function PricingPage() {
  const free = PLAN_COPY.free;
  const pro = PLAN_COPY.pro;

  return (
    <div style={{ maxWidth: 760 }}>
      <header className="page-head">
        <div className="eyebrow">Pricing · for hostels</div>
        <h1 className="page-title">Free to be here. €19 to see what worked.</h1>
        <p className="page-sub">
          No commission on beds, no card on file to be listed, no lock-in. The free tier is the
          product, not a trial — a city with three free hostels that post is worth more to
          travellers than a city with one paying one.
        </p>
      </header>

      <div className="twocol" style={{ alignItems: "stretch", marginTop: 18 }}>
        <section className="panel" style={{ flex: 1 }}>
          <div className="panel-head">{free.name}</div>
          <div className="price-big">
            €0 <span>forever</span>
          </div>
          <p style={{ fontSize: 12.5, color: "#7b6e64", lineHeight: 1.55, margin: "6px 0 12px" }}>
            {free.blurb}
          </p>
          <ul className="plan-list">
            {free.features.map((feature) => (
              <li key={feature}>
                <span className="tick">✓</span> {feature}
              </li>
            ))}
          </ul>
          <div className="cta-row">
            <Link href="/partner" className="btn" style={{ width: "100%", textAlign: "center" }}>
              Apply as a partner
            </Link>
          </div>
        </section>

        <section className="panel plan-pro" style={{ flex: 1 }}>
          <div className="panel-head" style={{ color: "var(--coral)" }}>
            {pro.name}
          </div>
          <div className="price-big">
            {pro.price} <span>{pro.per}</span>
          </div>
          <p style={{ fontSize: 12.5, color: "#7b6e64", lineHeight: 1.55, margin: "6px 0 12px" }}>
            {pro.blurb} {pro.cadence}.
          </p>
          <ul className="plan-list">
            {pro.features.map((feature) => (
              <li key={feature}>
                <span className="tick">✓</span> {feature}
              </li>
            ))}
          </ul>
          <div className="cta-row">
            <Link href="/hostel-admin" className="btn primary" style={{ width: "100%", textAlign: "center" }}>
              Turn it on from your portal
            </Link>
          </div>
        </section>
      </div>

      <h2 className="feed-head">Why €19</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        One dorm bed. A 60-bed hostel running at 75% occupancy that sells half its beds through
        Hostelworld pays roughly <b>€2,000–2,400 a month</b> in commission — 15%, and nearer 18% once
        Elevate placement is counted. Away takes none of that. Pro is the price of a single bed-night,
        and it buys the two things no booking site will ever show a hostel: what your guests did with
        the night you posted, and a screen at the desk that tells them what is on.
      </p>

      <h2 className="feed-head">What you are not paying for</h2>
      <ul className="plan-list" style={{ fontSize: 13.5 }}>
        <li>
          <span className="tick">✗</span> <b>Commission.</b> Away takes 0% of any bed. Bookings on your
          page are yours.
        </li>
        <li>
          <span className="tick">✗</span> <b>Placement fees.</b> Nobody can pay to be first in a city
          feed. The order is walk time from the guest&apos;s bed, and then the clock.
        </li>
        <li>
          <span className="tick">✗</span> <b>Per-guest or per-scan charges.</b> Charging by the scan
          punishes the behaviour the product exists to cause.
        </li>
        <li>
          <span className="tick">✗</span> <b>Your guest list.</b> We do not build a mailing list out of
          your arrivals, and the receipt goes to you, not to an audience we own.
        </li>
      </ul>

      <h2 className="feed-head">Questions hostels actually ask</h2>
      <div className="stack-links">
        <div className="panel">
          <b style={{ fontSize: 13.5 }}>Can I cancel?</b>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6 }}>
            One button in your portal, no email, no notice period. Pro keeps running until the date
            you already paid for and then stops — nobody loses a month they bought.
          </p>
        </div>
        <div className="panel">
          <b style={{ fontSize: 13.5 }}>What happens if I never upgrade?</b>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6 }}>
            You stay listed, you keep posting, your guests keep joining things, and your poster keeps
            working. You just do not see the receipt or the reception screen. Nothing is taken away
            that you had before Pro existed.
          </p>
        </div>
        <div className="panel">
          <b style={{ fontSize: 13.5 }}>Is this a PMS?</b>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6 }}>
            No. It does not hold your inventory or your rates, and it never touches your channel
            manager. A PMS costs $29–320 a month and does a different job entirely.
          </p>
        </div>
        <div className="panel">
          <b style={{ fontSize: 13.5 }}>Do travellers pay?</b>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6 }}>
            No, and they never will for the basics. A guest who scans your poster has to be able to
            read tonight&apos;s plan without a card — that is the whole distribution loop.
          </p>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#8b7d72", lineHeight: 1.7, marginTop: 26 }}>
        Prices in euros, including VAT where it applies. Nothing here is a contract:
        {demoLoginEnabled() ? (
          <>
            {" "}
            on this deployment you can sign in as the demo hostel and press the button to see exactly
            what Pro turns on.
          </>
        ) : (
          <> the button that starts it lives in your portal, under your plan.</>
        )}
      </p>

      <div className="cta-row" style={{ marginTop: 18 }}>
        <Link href="/hostels" className="btn">
          What the front desk gets
        </Link>
        <Link href="/partner" className="btn primary">
          Put your hostel on the map
        </Link>
      </div>
    </div>
  );
}
