import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/event-card";
import { createBookingAction } from "@/app/actions/booking";
import { getCurrentUser } from "@/lib/auth";
import { getCity, getHostelBySlug, getHostelPosts, roomsWithAvailability } from "@/lib/queries";
import { addDays, diffDays, formatDay, todayISO } from "@/lib/time";
import { formatPrice, plural } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ in?: string; out?: string; error?: string }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const hostel = getHostelBySlug(slug);
  return { title: hostel?.name ?? "Hostel" };
}

export default async function HostelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const hostel = getHostelBySlug(slug);
  // Pending and rejected applications must not be bookable, or indexable.
  if (!hostel || hostel.status !== "active") notFound();

  const today = todayISO();
  const checkIn = query.in && ISO_DATE.test(query.in) ? query.in : today;
  const checkOut = query.out && ISO_DATE.test(query.out) ? query.out : addDays(today, 2);
  const nights = diffDays(checkIn, checkOut);
  const validRange = nights > 0 && nights <= 14;

  const user = await getCurrentUser();
  const rooms = validRange ? roomsWithAvailability(hostel.id, checkIn, checkOut) : [];
  const city = getCity(hostel.city);
  const events = getHostelPosts(hostel.id, 8, user?.id ?? null).filter(
    (e) => e.starts_at.slice(0, 10) >= today
  );

  return (
    <>
      <Link href="/explore" className="back">
        ← All cities and hostels
      </Link>

      <header className="hostel-head">
        <div>
          <div className="eyebrow">
            {city?.name} · {hostel.area}
          </div>
          <h1 className="page-title">{hostel.name}</h1>
          <p className="page-sub">{hostel.description}</p>
        </div>
        <div className="rating-badge">
          <b>{hostel.rating > 0 ? hostel.rating.toFixed(1) : "new"}</b>
          <span>{hostel.rating > 0 ? "guest rating" : "no rating yet"}</span>
        </div>
      </header>

      {query.error ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>
            {query.error === "dates"
              ? "Those dates don't work — check-out has to be after check-in."
              : query.error}
          </span>
        </div>
      ) : null}

      <form method="get" className="date-bar">
        <div className="field">
          <label htmlFor="in">Check in</label>
          <input id="in" type="date" name="in" defaultValue={checkIn} min={today} />
        </div>
        <div className="field">
          <label htmlFor="out">Check out</label>
          <input id="out" type="date" name="out" defaultValue={checkOut} min={addDays(checkIn, 1)} />
        </div>
        <button type="submit" className="btn">
          Update availability
        </button>
      </form>

      <div className="room-list">
        {!validRange ? (
          <div className="notice warn">
            <span aria-hidden="true">📅</span>
            <span>Pick a stay of between 1 and 14 nights.</span>
          </div>
        ) : (
          rooms.map((room) => {
            const soldOut = room.free < 1;
            return (
              <div key={room.id} className={`room${soldOut ? " soldout" : ""}`}>
                <div className="room-main">
                  <h3>{room.name}</h3>
                  <p>
                    {room.kind === "dorm" ? "Shared dorm" : "Private room"} ·{" "}
                    {plural(room.beds, "bed")} · {formatPrice(room.price_cents)} per bed per night
                  </p>
                  <p className={soldOut ? "room-free none" : "room-free"}>
                    {soldOut
                      ? "Full for these dates"
                      : `${room.free} of ${room.beds} beds free · ${formatPrice(
                          room.price_cents * nights
                        )} for ${plural(nights, "night")}`}
                  </p>
                </div>

                <form action={createBookingAction} className="room-book">
                  <input type="hidden" name="roomId" value={room.id} />
                  <input type="hidden" name="slug" value={hostel.slug} />
                  <input type="hidden" name="checkIn" value={checkIn} />
                  <input type="hidden" name="checkOut" value={checkOut} />
                  <select name="guests" defaultValue="1" aria-label="Guests" disabled={soldOut}>
                    {Array.from({ length: Math.min(room.beds, 4) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {plural(n, "guest")}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn primary" disabled={soldOut}>
                    {soldOut ? "Full" : `Book · ${formatPrice(room.price_cents * nights)}`}
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>

      <p style={{ fontSize: 11.5, color: "#8b7d72", marginTop: 14, lineHeight: 1.6 }}>
        Availability is calculated per night from real bookings in the database. Payment is a
        sandbox: no card is charged, but the booking, the payment record and the confirmation all
        behave like the real thing.
      </p>

      {events.length ? (
        <section style={{ marginTop: 32 }}>
          <div className="day">
            <h2>What&apos;s on here</h2>
            <span>{plural(events.length, "thing")} coming up</span>
          </div>
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </section>
      ) : null}
    </>
  );
}
