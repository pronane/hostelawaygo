import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBookingsForUser } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { formatPrice, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your trips" };

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: "Awaiting payment", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export default async function TripsPage() {
  const user = await requireUser("/trips");
  const bookings = await getBookingsForUser(user.id);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Beds, dates and what they cost</div>
        <h1 className="page-title">Your trips</h1>
        <p className="page-sub">
          {bookings.length
            ? `${plural(bookings.length, "booking")} on this account.`
            : "Nothing booked yet — every hostel page has live availability."}
        </p>
      </header>

      {bookings.length === 0 ? (
        <Link href="/explore" className="btn primary block" style={{ marginTop: 20, maxWidth: 260 }}>
          Find a hostel
        </Link>
      ) : (
        <div className="booking-list">
          {bookings.map((b) => {
            const status = STATUS_LABEL[b.status] ?? STATUS_LABEL.pending;
            return (
              <Link key={b.id} href={`/booking/${b.code}`} className="booking-card">
                <div className="booking-top">
                  <div>
                    <h2>{b.hostel_name}</h2>
                    <p>
                      {b.room_name} · {b.room_kind === "dorm" ? "shared dorm" : "private room"} ·{" "}
                      {b.hostel_city.replace(/^./, (c) => c.toUpperCase())}
                    </p>
                  </div>
                  <span className={`status ${status.tone}`}>{status.label}</span>
                </div>
                <div className="booking-meta">
                  <span>
                    {formatDay(b.check_in)} → {formatDay(b.check_out)}
                  </span>
                  <span className="dot-sep" />
                  <span>{plural(b.nights, "night")}</span>
                  <span className="dot-sep" />
                  <span>{plural(b.guests, "guest")}</span>
                  <span className="booking-total">{formatPrice(b.total_cents)}</span>
                </div>
                <div className="booking-code">Ref {b.code}</div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
