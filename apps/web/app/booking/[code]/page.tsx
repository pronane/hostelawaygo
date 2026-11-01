import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelBookingAction,
  payBookingAction,
  refreshPaymentAction,
} from "@/app/actions/booking";
import { getCurrentUser } from "@/lib/auth";
import { getBookingByCode } from "@/lib/queries";
import { expireStalePayments, stripeConfigured } from "@/lib/payments";
import { formatDay } from "@/lib/time";
import { formatPrice, formatPriceRange, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking" };

const PAYMENT_NOTES: Record<string, string> = {
  cancelled: "Payment cancelled — the bed is held until the window runs out.",
  failed: "The payment provider didn't accept that. Try again, or cancel the booking.",
};

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ paid?: string; payment?: string }>;
}) {
  const { code } = await params;
  const { paid, payment: paymentIssue } = await searchParams;

  const user = await getCurrentUser();
  if (!user) notFound();

  await expireStalePayments();
  const booking = await getBookingByCode(code);
  if (!booking) notFound();
  if (booking.traveller_id !== user.id && user.role !== "admin") notFound();

  const isPending = booking.status === "pending";
  const cancelled = booking.status === "cancelled";
  const paidInFull = booking.payment_status === "paid";
  const refunded = booking.payment_status === "refunded";
  const expired = booking.payment_status === "expired";
  const sandbox = (booking.payment_provider ?? "sandbox") === "sandbox" && !stripeConfigured();

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

      {paymentIssue && PAYMENT_NOTES[paymentIssue] ? (
        <div className="notice warn" role="status">
          <span aria-hidden="true">💳</span>
          <span>{PAYMENT_NOTES[paymentIssue]}</span>
        </div>
      ) : null}

      {refunded ? (
        <div className="notice" role="status">
          <span aria-hidden="true">↩︎</span>
          <span>
            <b>Refunded.</b>{" "}
            {`${formatPrice(booking.total_cents)} went back to the original payment method${
              booking.refunded_at ? ` on ${formatDay(booking.refunded_at.slice(0, 10))}` : ""
            }.`}
          </span>
        </div>
      ) : null}

      <div className="booking-hero">
        <div className="eyebrow">
          Booking {booking.code} ·{" "}
          {cancelled ? "cancelled" : isPending ? "awaiting payment" : "confirmed"}
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
          <b>{formatPriceRange(booking.total_cents, null)}</b>
        </div>
        <div className="receipt-row">
          <span>Payment</span>
          <b>
            {refunded
              ? `Refunded · ${booking.payment_reference}`
              : paidInFull
                ? `Paid · ${booking.payment_reference}`
                : expired
                  ? "Window expired"
                  : cancelled
                    ? "Nothing charged"
                    : `Not paid yet · ${booking.payment_provider ?? "sandbox"}`}
          </b>
        </div>
      </div>

      <div className="cta-row">
        {isPending && !expired ? (
          <form action={payBookingAction} style={{ flex: 1, display: "flex" }}>
            <input type="hidden" name="code" value={booking.code} />
            <button type="submit" className="btn primary">
              Pay {formatPrice(booking.total_cents)}
              {sandbox ? " (sandbox)" : ""}
            </button>
          </form>
        ) : null}

        {isPending && expired ? (
          <form action={refreshPaymentAction} style={{ flex: 1, display: "flex" }}>
            <input type="hidden" name="code" value={booking.code} />
            <button type="submit" className="btn primary">
              Reopen payment window
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
        {plural(booking.guests, "guest")}.{" "}
        {sandbox ? (
          <>
            No card is charged: this deployment runs the <code>sandbox</code> provider, which settles
            the payment in-process. The same rows — idempotency key, 30-minute window,{" "}
            <code>requires_payment → paid → refunded</code> — are what a live Stripe Checkout
            session writes back through <code>/api/payments/webhook</code>.
          </>
        ) : (
          <>
            Payments are handled by the configured provider and confirmed by a signed webhook call
            to <code>/api/payments/webhook</code> — a retried delivery can&apos;t double-charge.
          </>
        )}
      </p>
    </div>
  );
}
