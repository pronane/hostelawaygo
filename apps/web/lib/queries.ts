import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { Source, WindowStatus } from "./constants";
import { addDays, dateOf, diffDays, todayISO } from "./time";
import { CITY_CENTRE, haversineMeters, walkMinutes } from "./geo";
import { completePayment, getPaymentForBooking, openPayment, refundPayment } from "./payments";
import type {
  Booking,
  BookingDetail,
  City,
  EventRow,
  FeedEvent,
  Hostel,
  IngestRun,
  Message,
  Payment,
  Room,
  Traveller,
  Trip,
} from "./types";

const EVENT_SELECT = `
  SELECT e.*, h.name AS hostel_name, h.area AS hostel_area, h.slug AS hostel_slug,
    (SELECT COUNT(*) FROM joins j WHERE j.event_id = e.id) AS going,
    (SELECT COUNT(*) FROM joins j JOIN travellers t ON t.id = j.traveller_id
       WHERE j.event_id = e.id AND t.solo = 1) AS solo_going,
    (SELECT COUNT(*) FROM joins j WHERE j.event_id = e.id AND j.traveller_id = @me) AS is_joined,
    (SELECT group_concat(initials, ',') FROM (
       SELECT t.initials AS initials FROM joins j JOIN travellers t ON t.id = j.traveller_id
       WHERE j.event_id = e.id ORDER BY t.id LIMIT 3
     )) AS avatars
  FROM events e
  LEFT JOIN hostels h ON h.id = e.hostel_id
`;

/**
 * Hostels can post "guests only" events (open_to_all = 0). Those are visible
 * to the hostel's own guests (a trip or booking there), its staff and Away
 * admins; everything else is open to every traveller in the city.
 */
const VISIBLE_TO_ME = `(
  e.open_to_all = 1 OR e.hostel_id IS NULL
  OR e.hostel_id IN (SELECT hostel_id FROM trips WHERE traveller_id = @me AND hostel_id IS NOT NULL)
  OR e.hostel_id IN (SELECT hostel_id FROM bookings WHERE traveller_id = @me AND status != 'cancelled')
  OR e.hostel_id = (SELECT hostel_id FROM travellers WHERE id = @me)
  OR (SELECT role FROM travellers WHERE id = @me) = 'admin'
)`;

type WalkOrigin = { lat: number; lng: number; name: string };

/**
 * Where "how far is it" is measured from: the hostel the traveller is booked
 * into for that city, or the middle of the city if there's no trip yet.
 */
function walkOrigins(me: number | null): Map<string, WalkOrigin> {
  const db = getDb();
  const origins = new Map<string, WalkOrigin>();

  for (const c of db.prepare("SELECT slug, lat, lng FROM cities").all<{ slug: string; lat: number; lng: number }>()) {
    origins.set(c.slug, { lat: c.lat, lng: c.lng, name: "the city centre" });
  }

  if (me) {
    const trips = db
      .prepare(
        `SELECT t.city, h.name, h.lat, h.lng FROM trips t JOIN hostels h ON h.id = t.hostel_id
         WHERE t.traveller_id = ?`
      )
      .all<{ city: string; name: string; lat: number; lng: number }>(me);
    for (const trip of trips) {
      origins.set(trip.city, { lat: trip.lat, lng: trip.lng, name: trip.name });
    }
  }

  return origins;
}

function toFeedEvent(row: EventRow, origins: Map<string, WalkOrigin>): FeedEvent {
  const origin =
    origins.get(row.city) ?? { ...(CITY_CENTRE[row.city] ?? CITY_CENTRE.lisbon), name: "the city centre" };

  let walk = row.walk_minutes;
  if (row.lat !== null && row.lng !== null && row.lat !== undefined && row.lng !== undefined) {
    walk = walkMinutes(haversineMeters(origin, { lat: row.lat, lng: row.lng }));
  }

  const tags = JSON.parse(row.tags || "[]") as string[];
  // Lets the feed filter to hostel socials from any hostel in the city.
  if (row.source === "hostel" && !tags.includes("hostels")) tags.push("hostels");
  return {
    ...row,
    tags,
    lens: JSON.parse(row.lens || "[]") as string[],
    going: row.going,
    soloGoing: row.solo_going,
    isJoined: row.is_joined > 0,
    avatars: row.avatars ? row.avatars.split(",") : [],
    source: row.source as Source,
    walk_minutes: walk,
    walkFrom: walk === 0 ? "your hostel" : origin.name,
  };
}

function toFeedEvents(rows: EventRow[], me: number | null): FeedEvent[] {
  const origins = walkOrigins(me);
  return rows.map((row) => toFeedEvent(row, origins));
}

/* ---------------------------------------------------------------- cities */

export function getCities(): (City & { events: number; hostels: number })[] {
  const today = todayISO();
  return getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM events e WHERE e.city = c.slug AND e.cancelled = 0
           AND e.starts_at >= @from AND e.starts_at < @to) AS events,
        (SELECT COUNT(*) FROM hostels h WHERE h.city = c.slug) AS hostels
       FROM cities c ORDER BY c.name`
    )
    .all({ from: today, to: `${addDays(today, 7)}T23:59` });
}

export function getCity(slug: string): City | undefined {
  return getDb().prepare("SELECT * FROM cities WHERE slug = ?").get<City>(slug);
}

/* ----------------------------------------------------------------- trips */

export function getTrip(city: string, me: number | null): Trip | null {
  if (!me) return null;
  const row = getDb()
    .prepare(
      `SELECT t.*, h.name AS hostel_name
       FROM trips t LEFT JOIN hostels h ON h.id = t.hostel_id
       WHERE t.traveller_id = ? AND t.city = ? LIMIT 1`
    )
    .get<Trip>(me, city);
  return row ?? null;
}

export function getTrips(me: number | null): Trip[] {
  if (!me) return [];
  return getDb()
    .prepare(
      `SELECT t.*, h.name AS hostel_name, c.name AS city_name
       FROM trips t
       LEFT JOIN hostels h ON h.id = t.hostel_id
       LEFT JOIN cities c ON c.slug = t.city
       WHERE t.traveller_id = ? ORDER BY t.starts_on ASC`
    )
    .all<Trip>(me);
}

/* ---------------------------------------------------------------- events */

export function getCityEvents(
  city: string,
  from: string,
  to: string,
  me: number | null
): FeedEvent[] {
  const rows = getDb()
    .prepare(
      `${EVENT_SELECT}
       WHERE e.city = @city AND e.cancelled = 0
         AND e.starts_at >= @from AND e.starts_at < @to
         AND ${VISIBLE_TO_ME}
       ORDER BY e.starts_at ASC`
    )
    .all<EventRow>({
      city,
      from,
      to: to.length === 10 ? `${to}T23:59` : to,
      me,
    });
  return toFeedEvents(rows, me);
}

export function getEvent(id: number, me: number | null): FeedEvent | null {
  const row = getDb()
    .prepare(`${EVENT_SELECT} WHERE e.id = @id AND ${VISIBLE_TO_ME}`)
    .get<EventRow>({ id, me });
  return row ? toFeedEvents([row], me)[0] : null;
}

export function getWhoIsGoing(eventId: number): Traveller[] {
  return getDb()
    .prepare(
      `SELECT t.*, j.created_at FROM joins j JOIN travellers t ON t.id = j.traveller_id
       WHERE j.event_id = ? ORDER BY j.created_at DESC, t.name ASC`
    )
    .all<Traveller>(eventId);
}

export function toggleJoin(eventId: number, me: number) {
  const db = getDb();
  const exists = db
    .prepare("SELECT 1 AS x FROM joins WHERE event_id = ? AND traveller_id = ?")
    .get(eventId, me);

  if (exists) {
    db.prepare("DELETE FROM joins WHERE event_id = ? AND traveller_id = ?").run(eventId, me);
  } else {
    db.prepare("INSERT INTO joins (event_id, traveller_id) VALUES (?, ?)").run(eventId, me);
  }

  const going = (
    db.prepare("SELECT COUNT(*) AS n FROM joins WHERE event_id = ?").get<{ n: number }>(eventId) as {
      n: number;
    }
  ).n;

  return { joined: !exists, going };
}

export function getHostelPosts(hostelId: number, limit: number, me: number | null): FeedEvent[] {
  const rows = getDb()
    .prepare(`${EVENT_SELECT} WHERE e.hostel_id = @hostelId AND ${VISIBLE_TO_ME} ORDER BY e.starts_at DESC LIMIT @limit`)
    .all<EventRow>({ hostelId, limit, me });
  return toFeedEvents(rows, me);
}

export type NewEventInput = {
  title: string;
  startsAt: string;
  priceCents: number;
  category: string;
  description?: string;
  durationMin?: number;
  /** false = guests of this hostel only */
  openToAll?: boolean;
};

const CATEGORY_STYLE: Record<string, { emoji: string; cover: [string, string] }> = {
  food: { emoji: "🍽️", cover: ["#FFE3B8", "#F5B350"] },
  music: { emoji: "🎶", cover: ["#C8B8FF", "#7A5BFF"] },
  social: { emoji: "🏆", cover: ["#FFD6C9", "#FF7A59"] },
  outdoors: { emoji: "🌅", cover: ["#FFD0B0", "#E0705A"] },
  culture: { emoji: "🎟️", cover: ["#BFE3FF", "#5AA9F0"] },
  nightlife: { emoji: "🪩", cover: ["#C9C2FF", "#6C5CE7"] },
};

export function createHostelEvent(
  input: NewEventInput,
  hostelId: number,
  me: number | null
): number {
  const db = getDb();
  const hostel = db
    .prepare("SELECT id, name FROM hostels WHERE id = ?")
    .get<{ id: number; name: string }>(hostelId);
  if (!hostel) throw new Error("Unknown hostel");

  const style = CATEGORY_STYLE[input.category] ?? CATEGORY_STYLE.social;
  const today = todayISO();
  const time = /^\d{2}:\d{2}$/.test(input.startsAt) ? input.startsAt : "20:00";

  // If the time has already gone, schedule it for tomorrow rather than in the past.
  const todayStart = new Date();
  const [hh, mm] = time.split(":").map(Number);
  const scheduled = new Date(todayStart);
  scheduled.setHours(hh, mm, 0, 0);
  const startsAt =
    scheduled.getTime() < todayStart.getTime() ? `${addDays(today, 1)}T${time}` : `${today}T${time}`;

  const info = db
    .prepare(
      `INSERT INTO events (city, hostel_id, title, description, starts_at, duration_min, price_cents,
        source, category, emoji, cover_from, cover_to, venue, walk_minutes, tags, lens, created_by,
        origin, created_at, open_to_all)
       VALUES ((SELECT city FROM hostels WHERE id = @hostel_id), @hostel_id, @title, @description,
        @starts_at, @duration_min, @price_cents, 'hostel', @category, @emoji, @cover_from, @cover_to,
        @venue, 0, @tags, '[]', @created_by, 'hostel', datetime('now'), @open_to_all)`
    )
    .run({
      hostel_id: hostel.id,
      title: input.title.slice(0, 120),
      description:
        input.description?.slice(0, 600) ||
        "Posted from the front desk. Ask at reception if you need anything — and if you're coming on your own, come and say hello before it starts.",
      starts_at: startsAt,
      duration_min: input.durationMin ?? 120,
      price_cents: Math.max(0, Math.round(input.priceCents)),
      category: input.category,
      emoji: style.emoji,
      cover_from: style.cover[0],
      cover_to: style.cover[1],
      venue: `${hostel.name} · your hostel`,
      tags: JSON.stringify(input.priceCents === 0 ? ["solo", "social", "free"] : ["solo", "social"]),
      created_by: me ? `staff:${me}` : "hostel-staff",
      open_to_all: input.openToAll === false ? 0 : 1,
    });

  return info.lastInsertRowid;
}

export function cancelEvent(eventId: number): void {
  getDb().prepare("UPDATE events SET cancelled = 1 WHERE id = ?").run(eventId);
}

export function getStaffEvents(hostelId: number, me: number | null): FeedEvent[] {
  const rows = getDb()
    .prepare(
      `${EVENT_SELECT} WHERE e.hostel_id = @hostelId ORDER BY e.starts_at DESC LIMIT 30`
    )
    .all<EventRow>({ hostelId, me });
  return toFeedEvents(rows, me);
}

export function getStaffStats(hostelId: number) {
  const db = getDb();
  const today = todayISO();

  const upcoming = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE hostel_id = @hostelId AND cancelled = 0 AND starts_at >= @today`
    )
    .get<{ n: number }>({ hostelId, today })!.n;

  const joins = db
    .prepare(
      `SELECT COUNT(*) AS n FROM joins j JOIN events e ON e.id = j.event_id
       WHERE e.hostel_id = @hostelId AND e.starts_at >= @today`
    )
    .get<{ n: number }>({ hostelId, today })!.n;

  const bookings = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS revenue FROM bookings
       WHERE hostel_id = @hostelId AND status != 'cancelled'`
    )
    .get<{ n: number; revenue: number }>({ hostelId })!;

  const messages = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages m JOIN events e ON e.id = m.event_id
       WHERE e.hostel_id = @hostelId AND m.reported = 1 AND m.hidden = 0`
    )
    .get<{ n: number }>({ hostelId })!.n;

  return { upcoming, joins, bookings: bookings.n, revenue: bookings.revenue, reported: messages };
}

/* -------------------------------------------------------------- hostels */

export function getHostels(city?: string): Hostel[] {
  const db = getDb();
  return city
    ? db.prepare("SELECT * FROM hostels WHERE city = ? ORDER BY rating DESC").all<Hostel>(city)
    : db.prepare("SELECT * FROM hostels ORDER BY city, rating DESC").all<Hostel>();
}

export function getHostelBySlug(slug: string): Hostel | undefined {
  return getDb().prepare("SELECT * FROM hostels WHERE slug = ?").get<Hostel>(slug);
}

export function getRooms(hostelId: number): Room[] {
  return getDb()
    .prepare("SELECT * FROM rooms WHERE hostel_id = ? ORDER BY price_cents ASC")
    .all<Room>(hostelId);
}

/* ------------------------------------------------------------- travellers */

export function getTraveller(id: number): Traveller | null {
  return getDb().prepare("SELECT * FROM travellers WHERE id = ?").get<Traveller>(id) ?? null;
}

export function getTravellerCount(): number {
  return getDb().prepare("SELECT COUNT(*) AS n FROM travellers").get<{ n: number }>()!.n;
}

export function getJoinedCount(me: number | null): number {
  if (!me) return 0;
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM joins WHERE traveller_id = ?")
      .get<{ n: number }>(me)!.n
  );
}

/* ---------------------------------------------------------------- chat */

export function getMessages(eventId: number, me: number | null): Message[] {
  return getDb()
    .prepare(
      `SELECT m.*, t.name, t.initials, t.colour, t.flag,
              CASE WHEN m.traveller_id = @me THEN 1 ELSE 0 END AS mine
       FROM messages m JOIN travellers t ON t.id = m.traveller_id
       WHERE m.event_id = @eventId AND m.hidden = 0
       ORDER BY m.created_at ASC, m.id ASC LIMIT 100`
    )
    .all<Message>({ eventId, me });
}

export function getMessagesAfter(eventId: number, afterId: number, me: number | null): Message[] {
  return getDb()
    .prepare(
      `SELECT m.*, t.name, t.initials, t.colour, t.flag,
              CASE WHEN m.traveller_id = @me THEN 1 ELSE 0 END AS mine
       FROM messages m JOIN travellers t ON t.id = m.traveller_id
       WHERE m.event_id = @eventId AND m.hidden = 0 AND m.id > @afterId
       ORDER BY m.id ASC LIMIT 50`
    )
    .all<Message>({ eventId, afterId, me });
}

export function getMessageById(messageId: number, me: number | null): Message | null {
  return (
    getDb()
      .prepare(
        `SELECT m.*, t.name, t.initials, t.colour, t.flag,
                CASE WHEN m.traveller_id = @me THEN 1 ELSE 0 END AS mine
         FROM messages m JOIN travellers t ON t.id = m.traveller_id
         WHERE m.id = @messageId`
      )
      .get<Message>({ messageId, me }) ?? null
  );
}

export function recentMessageCount(me: number, minutes = 10): number {
  return (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE traveller_id = ? AND created_at > datetime('now', ?)"
      )
      .get<{ n: number }>(me, `-${minutes} minutes`)!.n
  );
}

export function addMessage(eventId: number, me: number, body: string): number {
  const info = getDb()
    .prepare("INSERT INTO messages (event_id, traveller_id, body) VALUES (?, ?, ?)")
    .run(eventId, me, body.slice(0, 500));
  return info.lastInsertRowid;
}

export function reportMessage(messageId: number): void {
  getDb().prepare("UPDATE messages SET reported = 1 WHERE id = ?").run(messageId);
}

export function clearReport(messageId: number): void {
  getDb().prepare("UPDATE messages SET reported = 0 WHERE id = ?").run(messageId);
}

/** Hostel that owns the event a chat message belongs to (for moderation scope). */
export function getMessageHostel(messageId: number): number | null | undefined {
  const row = getDb()
    .prepare("SELECT e.hostel_id AS hostel_id FROM messages m JOIN events e ON e.id = m.event_id WHERE m.id = ?")
    .get<{ hostel_id: number | null }>(messageId);
  return row ? row.hostel_id : undefined;
}

export function hideMessage(messageId: number): void {
  getDb().prepare("UPDATE messages SET hidden = 1 WHERE id = ?").run(messageId);
}

export function getReportedMessages(
  hostelId: number
): (Message & { event_title: string })[] {
  return getDb()
    .prepare(
      `SELECT m.*, t.name, t.initials, t.colour, t.flag,
              0 AS mine,
              e.title AS event_title
       FROM messages m
       JOIN travellers t ON t.id = m.traveller_id
       JOIN events e ON e.id = m.event_id
       WHERE e.hostel_id = @hostelId AND m.reported = 1 AND m.hidden = 0
       ORDER BY m.created_at DESC LIMIT 20`
    )
    .all<Message & { event_title: string }>({ hostelId });
}

/* ------------------------------------------------------------- bookings */

export function bedsTaken(roomId: number, checkIn: string, checkOut: string): number {
  const db = getDb();
  const nights = Math.max(0, diffDays(checkIn, checkOut));
  let peak = 0;
  for (let i = 0; i < nights; i += 1) {
    const night = addDays(checkIn, i);
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(guests), 0) AS n FROM bookings
         WHERE room_id = @roomId AND status != 'cancelled'
           AND check_in <= @night AND check_out > @night`
      )
      .get<{ n: number }>({ roomId, night })!;
    peak = Math.max(peak, row.n);
  }
  return peak;
}

export function roomsWithAvailability(hostelId: number, checkIn: string, checkOut: string) {
  return getRooms(hostelId).map((room) => {
    const taken = bedsTaken(room.id, checkIn, checkOut);
    return { ...room, taken, free: Math.max(0, room.beds - taken) };
  });
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function bookingCode(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `AWY-${out}`;
}

export type BookingInput = {
  roomId: number;
  checkIn: string;
  checkOut: string;
  guests: number;
};

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function createBooking(
  input: BookingInput,
  me: number
): { ok: true; code: string } | { ok: false; error: string } {
  const db = getDb();
  const room = db
    .prepare("SELECT r.*, h.id AS hostel_id FROM rooms r JOIN hostels h ON h.id = r.hostel_id WHERE r.id = ?")
    .get<Room>(input.roomId);
  if (!room) return { ok: false, error: "That room no longer exists." };

  if (!isRealDate(input.checkIn) || !isRealDate(input.checkOut)) {
    return { ok: false, error: "Those dates don't look right." };
  }
  if (input.checkIn < todayISO()) return { ok: false, error: "Check-in can't be in the past." };
  const nights = diffDays(input.checkIn, input.checkOut);
  if (!Number.isInteger(nights) || nights < 1) return { ok: false, error: "Check-out must be after check-in." };
  if (nights > 14) return { ok: false, error: "We only take bookings up to 14 nights." };
  // Number.isInteger also rejects NaN, which used to slip past both comparisons
  // and create a booking for "NaN" guests that never counted against beds.
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > room.beds) {
    return { ok: false, error: `That room takes between 1 and ${room.beds} guests.` };
  }

  try {
    return db.transaction(() => {
      const taken = bedsTaken(room.id, input.checkIn, input.checkOut);
      if (taken + input.guests > room.beds) {
        return { ok: false as const, error: "Someone just took the last bed. Try different dates." };
      }

      const total = room.price_cents * nights * input.guests;
      const code = bookingCode();

      const booking = db
        .prepare(
          `INSERT INTO bookings (code, traveller_id, hostel_id, room_id, check_in, check_out,
             guests, nights, total_cents, status, created_at)
           VALUES (@code, @me, @hostelId, @roomId, @checkIn, @checkOut, @guests, @nights, @total,
             'pending', datetime('now'))`
        )
        .run({
          code,
          me,
          hostelId: room.hostel_id,
          roomId: room.id,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.guests,
          nights,
          total,
        });

      openPayment(booking.lastInsertRowid, code, total);

      return { ok: true as const, code };
    })();
  } catch {
    return { ok: false, error: "Something went wrong holding that bed. Try again." };
  }
}

const BOOKING_SELECT = `
  SELECT b.*, h.name AS hostel_name, h.slug AS hostel_slug, h.city AS hostel_city,
    r.name AS room_name, r.kind AS room_kind,
    p.status AS payment_status, p.reference AS payment_reference, p.provider AS payment_provider,
    p.expires_at AS payment_expires_at, p.paid_at, p.refunded_at
  FROM bookings b
  JOIN hostels h ON h.id = b.hostel_id
  JOIN rooms r ON r.id = b.room_id
  LEFT JOIN payments p ON p.booking_id = b.id
`;

export function getBookingByCode(code: string): BookingDetail | undefined {
  return getDb().prepare(`${BOOKING_SELECT} WHERE b.code = @code`).get<BookingDetail>({ code });
}

export function getBookingsForUser(me: number | null): BookingDetail[] {
  if (!me) return [];
  return getDb()
    .prepare(`${BOOKING_SELECT} WHERE b.traveller_id = @me ORDER BY b.check_in DESC`)
    .all<BookingDetail>({ me });
}

export function getBookingsForHostel(hostelId: number): (BookingDetail & { guest_name: string })[] {
  return getDb()
    .prepare(
      `${BOOKING_SELECT.replace(
        "SELECT b.*,",
        "SELECT b.*, t.name AS guest_name,"
      )} JOIN travellers t ON t.id = b.traveller_id
       WHERE b.hostel_id = @hostelId ORDER BY b.check_in DESC`
    )
    .all<BookingDetail & { guest_name: string }>({ hostelId });
}

export function markBookingPaid(code: string, me: number): Payment["status"] | null {
  const db = getDb();
  const booking = db
    .prepare("SELECT id, traveller_id, status FROM bookings WHERE code = ?")
    .get<{ id: number; traveller_id: number; status: string }>(code);
  if (!booking || booking.traveller_id !== me) return null;
  // Only a pending hold can be paid. Paying a cancelled booking used to flip it
  // back to "confirmed" without re-checking that the bed was still free.
  if (booking.status !== "pending") return null;

  const payment = getPaymentForBooking(booking.id);
  if (!payment) return null;

  const paid = db.transaction(() => completePayment(payment.reference))();
  return paid ? ("paid" as const) : null;
}

export function cancelBooking(code: string, me: number): boolean {
  const db = getDb();
  const booking = db
    .prepare("SELECT id, traveller_id, status FROM bookings WHERE code = ?")
    .get<{ id: number; traveller_id: number; status: string }>(code);
  if (!booking || booking.traveller_id !== me || booking.status === "cancelled") return false;

  db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
    refundPayment(booking.id);
  })();

  return true;
}

/* --------------------------------------------------------------- ingest */

export function startIngestRun(source: string, mode: string): number {
  const info = getDb()
    .prepare(
      "INSERT INTO ingest_runs (source, mode, started_at, status) VALUES (?, ?, datetime('now'), 'running')"
    )
    .run(source, mode);
  return info.lastInsertRowid;
}

export function finishIngestRun(
  id: number,
  counts: { fetched: number; inserted: number; updated: number; skipped: number },
  status: string,
  note = ""
): void {
  getDb()
    .prepare(
      `UPDATE ingest_runs SET finished_at = datetime('now'), fetched = @fetched,
        inserted = @inserted, updated = @updated, skipped = @skipped, status = @status, note = @note
       WHERE id = @id`
    )
    .run({ id, ...counts, status, note });
}

export type IngestedEvent = {
  city: string;
  externalId: string;
  title: string;
  description: string;
  startsAt: string;
  durationMin: number;
  priceCents: number;
  priceMaxCents: number | null;
  currency: string;
  ticketUrl: string | null;
  lat: number | null;
  lng: number | null;
  venue: string;
  category: string;
  emoji: string;
  cover: [string, string];
  walkMinutes: number;
  tags: string[];
  lens: string[];
};

export function upsertIngestedEvent(event: IngestedEvent): "inserted" | "updated" | "skipped" {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM events WHERE city = ? AND external_id = ?")
    .get<{ id: number }>(event.city, event.externalId);

  if (existing) {
    db.prepare(
      `UPDATE events SET title = @title, description = @description, starts_at = @startsAt,
        duration_min = @durationMin, price_cents = @priceCents, price_max_cents = @priceMaxCents,
        currency = @currency, ticket_url = @ticketUrl, venue = @venue, lat = @lat, lng = @lng,
        category = @category, emoji = @emoji, cover_from = @coverFrom, cover_to = @coverTo
       WHERE id = @id`
    ).run({
      id: existing.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      durationMin: event.durationMin,
      priceCents: event.priceCents,
      priceMaxCents: event.priceMaxCents,
      currency: event.currency,
      ticketUrl: event.ticketUrl,
      venue: event.venue,
      lat: event.lat,
      lng: event.lng,
      category: event.category,
      emoji: event.emoji,
      coverFrom: event.cover[0],
      coverTo: event.cover[1],
    });
    return "updated";
  }

  db.prepare(
    `INSERT INTO events (city, hostel_id, title, description, starts_at, duration_min, price_cents,
      price_max_cents, currency, ticket_url, source, category, emoji, cover_from, cover_to, venue,
      lat, lng, walk_minutes, tags, lens, created_by, external_id, origin, created_at)
     VALUES (@city, NULL, @title, @description, @startsAt, @durationMin, @priceCents,
      @priceMaxCents, @currency, @ticketUrl, 'ticketed',
      @category, @emoji, @coverFrom, @coverTo, @venue, @lat, @lng, @walkMinutes, @tags, @lens, 'ingest',
      @externalId, 'ingest', datetime('now'))`
  ).run({
    city: event.city,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    durationMin: event.durationMin,
    priceCents: event.priceCents,
    priceMaxCents: event.priceMaxCents,
    currency: event.currency,
    ticketUrl: event.ticketUrl,
    category: event.category,
    emoji: event.emoji,
    coverFrom: event.cover[0],
    coverTo: event.cover[1],
    venue: event.venue,
    lat: event.lat,
    lng: event.lng,
    walkMinutes: event.walkMinutes,
    tags: JSON.stringify(event.tags),
    lens: JSON.stringify(event.lens),
    externalId: event.externalId,
  });

  return "inserted";
}

export function getIngestRuns(limit = 8): IngestRun[] {
  return getDb()
    .prepare("SELECT * FROM ingest_runs ORDER BY id DESC LIMIT ?")
    .all<IngestRun>(limit);
}

export function getIngestTotals() {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS events, MAX(created_at) AS newest
       FROM events WHERE origin = 'ingest'`
    )
    .get<{ events: number; newest: string | null }>()!;
  return row;
}

/* ------------------------------------------------------------- helpers */

export function withWindowStatus<T extends FeedEvent>(
  events: T[],
  tripStart: string,
  tripEnd: string,
  arrival: string,
  departure: string
): T[] {
  const arriveAt = `${tripStart}T${arrival}`;
  const leaveAt = `${tripEnd}T${departure}`;
  return events.map((e) => ({
    ...e,
    status: (e.starts_at < arriveAt ? "before" : e.starts_at > leaveAt ? "after" : "in") as WindowStatus,
  }));
}

export function groupByDay(events: FeedEvent[]): { date: string; events: FeedEvent[] }[] {
  const groups = new Map<string, FeedEvent[]>();
  for (const event of events) {
    const day = dateOf(event.starts_at);
    const bucket = groups.get(day) ?? [];
    bucket.push(event);
    groups.set(day, bucket);
  }
  return [...groups.entries()].map(([date, list]) => ({ date, events: list }));
}

export type { Booking };
