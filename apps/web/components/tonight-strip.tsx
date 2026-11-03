import Link from "next/link";
import type { DealWithHostel } from "@/lib/deals";
import { formatPrice, plural } from "@/lib/format";
import { addDays, todayISO } from "@/lib/time";

/**
 * "2 beds free tonight · €18 · until 23:00".
 *
 * The one line in the feed that can be acted on tonight. It sits above the
 * events because a bed at 18:00 is worth more to the traveller than a gig on
 * Thursday — and because a hostel that sees its own name here posts again
 * tomorrow.
 */
export function TonightStrip({ deals }: { deals: DealWithHostel[] }) {
  if (deals.length === 0) return null;

  const inDate = todayISO();
  const outDate = addDays(inDate, 1);
  const beds = deals.reduce((total, deal) => total + deal.beds, 0);

  return (
    <section className="dealbar" aria-label="Beds free tonight">
      <div className="dealbar-head">
        <span aria-hidden="true">🛏</span>
        <b>
          {plural(beds, "bed")} free tonight
        </b>
        <span className="dealbar-sub">posted by the desk, not a call centre</span>
      </div>
      <div className="dealbar-list">
        {deals.slice(0, 4).map((deal) => (
          <Link
            key={deal.id}
            href={`/hostel/${deal.hostel_slug}?in=${inDate}&out=${outDate}`}
            className="dealbar-row"
          >
            <span className="dealbar-price">{formatPrice(deal.price_cents)}</span>
            <span className="dealbar-name">
              {deal.hostel_name}
              <span className="dealbar-area">
                {deal.hostel_area} · {plural(deal.beds, "bed")} · until {deal.until_time}
                {deal.note ? ` · ${deal.note}` : ""}
              </span>
            </span>
            <span className="dealbar-go" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
