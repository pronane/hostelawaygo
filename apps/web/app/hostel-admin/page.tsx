import Link from "next/link";
import { cancelEventAction, clearReportAction, hideMessageAction } from "@/app/actions/staff";
import { requireStaff } from "@/lib/auth";
import {
  getBookingsForHostel,
  getHostels,
  getReportedMessages,
  getStaffEvents,
  getStaffStats,
} from "@/lib/queries";
import { formatDay, formatSqlTime, timeOf } from "@/lib/time";
import { formatPrice, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hostel portal" };

export default async function HostelAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; hidden?: string; error?: string }>;
}) {
  const { cancelled, hidden, error } = await searchParams;
  const user = await requireStaff("/hostel-admin");

  const hostels = getHostels();
  const hostel = (user.hostel_id ? hostels.find((h) => h.id === user.hostel_id) : hostels[0])!;

  const stats = getStaffStats(hostel.id);
  const events = getStaffEvents(hostel.id, user.id);
  const bookings = getBookingsForHostel(hostel.id);
  const reported = getReportedMessages(hostel.id);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Hostel mode · {hostel.area}</div>
        <h1 className="page-title">{hostel.name}</h1>
        <p className="page-sub">
          Who&apos;s coming tonight, what you&apos;ve got on, and what people are saying about it.
        </p>
      </header>

      {cancelled ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>Event cancelled. It&apos;s off the feed, and anyone who joined can see it&apos;s gone.</span>
        </div>
      ) : null}
      {hidden ? (
        <div className="notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>Message hidden from the event chat.</span>
        </div>
      ) : null}
      {error === "scope" ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">🔒</span>
          <span>That event isn&apos;t yours. Staff can only manage their own hostel&apos;s listings.</span>
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat">
          <b>{stats.upcoming}</b>
          <span>UPCOMING EVENTS</span>
        </div>
        <div className="stat">
          <b>{stats.joins}</b>
          <span>JOINS THIS WEEK</span>
        </div>
        <div className="stat">
          <b>{stats.bookings}</b>
          <span>BEDS BOOKED</span>
        </div>
        <div className="stat">
          <b>{formatPrice(stats.revenue)}</b>
          <span>BOOKING VALUE</span>
        </div>
        <div className="stat">
          <b>{stats.reported}</b>
          <span>REPORTED CHATS</span>
        </div>
      </div>

      <div className="cta-row" style={{ marginTop: 16 }}>
        <Link href="/post" className="btn primary" style={{ flex: "0 0 auto" }}>
          ＋ Post tonight&apos;s event
        </Link>
        <Link href="/" className="btn">
          See the guest view
        </Link>
      </div>

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Your events</h2>
          <span>{plural(events.length, "listing")}</span>
        </div>
        <div className="admin-list">
          {events.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>Nothing posted yet.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className={`admin-row${e.cancelled ? " cancelled" : ""}`}>
                <div className="admin-main">
                  <b>
                    {e.emoji} {e.title}
                  </b>
                  <span>
                    {formatDay(e.starts_at.slice(0, 10))} · {timeOf(e.starts_at)} ·{" "}
                    {formatPrice(e.price_cents)} · {e.going} going
                    {e.cancelled ? " · cancelled" : ""}
                  </span>
                </div>
                <div className="admin-actions">
                  <Link href={`/event/${e.id}`} className="btn small">
                    View
                  </Link>
                  {!e.cancelled ? (
                    <form action={cancelEventAction}>
                      <input type="hidden" name="eventId" value={e.id} />
                      <button type="submit" className="btn small danger">
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Arrivals &amp; bookings</h2>
          <span>{plural(bookings.length, "booking")}</span>
        </div>
        <div className="admin-list">
          {bookings.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>No bookings yet.</p>
          ) : (
            bookings.map((b) => (
              <div key={b.id} className="admin-row">
                <div className="admin-main">
                  <b>{b.guest_name}</b>
                  <span>
                    {b.room_name} · {formatDay(b.check_in)} → {formatDay(b.check_out)} ·{" "}
                    {plural(b.guests, "guest")} · {b.code}
                  </span>
                </div>
                <div className="admin-actions">
                  <span className={`status ${b.status === "confirmed" ? "ok" : b.status === "cancelled" ? "muted" : "warn"}`}>
                    {b.status}
                  </span>
                  <b>{formatPrice(b.total_cents)}</b>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <div className="day">
          <h2>Reported chat</h2>
          <span>{plural(reported.length, "message")}</span>
        </div>
        <div className="admin-list">
          {reported.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "#8b7d72" }}>Nothing reported. Quiet week.</p>
          ) : (
            reported.map((m) => (
              <div key={m.id} className="admin-row">
                <div className="admin-main">
                  <b>
                    {m.name} <span aria-hidden="true">{m.flag}</span> · {formatSqlTime(m.created_at)}
                  </b>
                  <span>
                    “{m.body}” — on <i>{m.event_title}</i>
                  </span>
                </div>
                <div className="admin-actions">
                  <form action={hideMessageAction}>
                    <input type="hidden" name="messageId" value={m.id} />
                    <input type="hidden" name="eventId" value={m.event_id} />
                    <button type="submit" className="btn small danger">
                      Hide
                    </button>
                  </form>
                  <form action={clearReportAction}>
                    <input type="hidden" name="messageId" value={m.id} />
                    <button type="submit" className="btn small">
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 14, lineHeight: 1.6 }}>
          This is the moderation loop that makes chat survivable: travellers report, staff hide or
          dismiss, and every action is scoped to this hostel&apos;s events.
        </p>
      </section>
    </>
  );
}
