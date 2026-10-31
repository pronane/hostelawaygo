import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBookingAction, payBookingAction } from "@/app/actions/booking";
import { getCurrentUser } from "@/lib/auth";
import { getBookingByCode } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { formatPrice, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking" };

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { code } = await params;
  const { paid } = await searchParams;

  const user = await getCurrentUser();
  if (!user) notFound();

  const booking = getBookingByCode(code);
  if (!booking) notFound();
  if (booking.traveller_id !== user.id && user.role !== "admin") notFound();

  const isPending = booking.status === "pending";
  const cancelled = booking.status === "cancelled";

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/trips" className="back">
        ← Your trips
      </Link>

      {paid ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            <b>Paid.</b> Your bed is confirmed and the hostel can see you on the arrivals list.
          </span>
        </div>
      ) : null}

      <div className="booking-hero">
        <div className="eyebrow">
          Booking {booking.code} · {cancelled ? "cancelled" : isPending ? "awaiting payment" : "confirmed"}
        </div>
        <h1 className="page-title">{booking.hostel_name}</h1>
        <p className="page-sub">
          {booking.room_name} · {booking.hostel_city.replace(/^./, (c) => c.toUpperCase())}
        </p>
      </div>

      <div className="receipt">
        <div className="receipt-row">
          <span>Check in</span>
          <b>{formatDay(booking.check_in)} · from 15:00</b>
        </div>
        <div className="receipt-row">
          <span>Check out</span>
          <b>{formatDay(booking.check_out)} · by 10:30</b>
        </div>
        <div className="receipt-row">
          <span>Nights</span>
          <b>{booking.nights}</b>
        </div>
        <div className="receipt-row">
          <span>Guests</span>
          <b>{booking.guests}</b>
        </div>
        <div className="receipt-row total">
          <span>Total</span>
          <b>{formatPrice(booking.total_cents)}</b>
        </div>
        <div className="receipt-row">
          <span>Payment</span>
          <b>
            {booking.payment_status === "paid"
              ? `Paid · ${booking.payment_reference}`
              : cancelled
                ? "Refunded"
                : "Not paid yet"}
          </b>
        </div>
      </div>

      <div className="cta-row">
        {isPending ? (
          <form action={payBookingAction} style={{ flex: 1, display: "flex" }}>
            <input type="hidden" name="code" value={booking.code} />
            <button type="submit" className="btn primary">
              Pay {formatPrice(booking.total_cents)} (sandbox)
            </button>
          </form>
        ) : null}

        {!cancelled ? (
          <form action={cancelBookingAction}>
            <input type="hidden" name="code" value={booking.code} />
            <input type="hidden" name="back" value="/trips" />
            <button type="submit" className="btn">
              Cancel booking
            </button>
          </form>
        ) : (
          <Link href={`/hostel/${booking.hostel_slug}`} className="btn">
            Book again
          </Link>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 22, lineHeight: 1.6 }}>
        {plural(booking.nights, "night")} in {booking.room_name.toLowerCase()} for{" "}
        {plural(booking.guests, "guest")}. No card is charged — the payment row moves from{" "}
        <code>requires_payment</code> to <code>paid</code> and the booking from{" "}
        <code>pending</code> to <code>confirmed</code>. Same shape as Stripe, without the keys.
      </p>
    </div>
  );
}
