import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { getBookingsForUser, getJoinedCount, getTrips } from "@/lib/queries";
import { formatDay, formatShortDate, todayISO } from "@/lib/time";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "You" };

export default async function YouPage() {
  const today = todayISO();
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="auth">
        <div className="eyebrow">You</div>
        <h1 className="page-title">Not signed in</h1>
        <p className="page-sub">
          Sign in to see your trips, bookings and the events you said yes to.
        </p>
        <Link href="/login?next=/you" className="btn primary block" style={{ marginTop: 18, maxWidth: 240 }}>
          Sign in
        </Link>
      </div>
    );
  }

  const trips = getTrips(user.id);
  const bookings = getBookingsForUser(user.id);
  const joined = getJoinedCount(user.id);
  const role =
    user.role === "hostel_staff"
      ? `${user.hostel_name ?? "Hostel"} staff`
      : user.role === "admin"
        ? "Away ops"
        : "Traveller";

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Signed in as {user.email}</div>
        <h1 className="page-title">
          {user.name} <span aria-hidden="true">{user.flag}</span>
        </h1>
        <p className="page-sub">
          {role} · {plural(joined, "event")} joined · {plural(bookings.length, "booking")}
        </p>
      </header>

      <div className="you-grid">
        <section className="panel">
          <div className="panel-head">Your trips</div>
          {trips.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72", margin: 0 }}>
              No trips saved. Booking a bed adds one automatically.
            </p>
          ) : (
            <div className="mini">
              {trips.map((t) => (
                <Link key={t.id} href="/next">
                  <span className="mt">{formatShortDate(t.starts_on)}</span>
                  <span className="mx">
                    <b>{t.city.replace(/^./, (c) => c.toUpperCase())}</b>
                    <span>
                      {formatDay(t.starts_on)} → {formatDay(t.ends_on)} ·{" "}
                      {t.hostel_name ?? "hostel TBC"}
                      {t.starts_on >= today ? "" : " · past"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">Things you can do</div>
          <div className="stack-links">
            <Link href="/trips">
              <b>Your bookings</b>
              <span>{plural(bookings.length, "booking")}, with payment and cancellation</span>
            </Link>
            <Link href="/explore">
              <b>Find a hostel</b>
              <span>Live beds in {plural(3, "city", "cities")}</span>
            </Link>
            {user.role === "hostel_staff" || user.role === "admin" ? (
              <Link href="/hostel-admin">
                <b>Hostel portal</b>
                <span>Post events, see who&apos;s coming, handle bookings</span>
              </Link>
            ) : null}
            {user.role === "admin" ? (
              <Link href="/admin/ingest">
                <b>Ingest console</b>
                <span>Pull city events from Ticketmaster</span>
              </Link>
            ) : null}
          </div>
        </section>
      </div>

      <form action={logoutAction} style={{ marginTop: 22 }}>
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>

      <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 22, lineHeight: 1.6 }}>
        Passwords are scrypt-hashed and sessions are httpOnly cookies with a 30-day expiry. This is
        a real auth flow, not a mock — the only shortcut is that the seeded demo accounts share one
        password.
      </p>
    </>
  );
}
