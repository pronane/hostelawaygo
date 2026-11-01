import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { Source, WindowStatus } from "./constants";
import { launchGates, launchReadiness, recordComplete, type CitySupply, type Gate } from "./cities";
import { LAUNCH_BAR } from "./cities";
import { addDays, dateOf, diffDays, todayISO } from "./time";
import { CITY_CENTRE, haversineMeters, walkMinutes } from "./geo";
import { completePayment, getPaymentForBooking, openPayment, refundPayment } from "./payments";
import type {
  Booking,
  BookingDetail,
  City,
  CityStatus,
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
async function walkOrigins(me: number | null): Promise<Map<string, WalkOrigin>> {
  const db = getDb();
  const origins = new Map<string, WalkOrigin>();

  for (const c of await db.prepare("SELECT slug, lat, lng FROM cities").all<{ slug: string; lat: number; lng: number }>()) {
    // A city that hasn't had its centre set yet is 0,0 — measuring from the
    // Gulf of Guinea gives every event a 9,000 km walk.
    if (c.lat === 0 && c.lng === 0) continue;
    origins.set(c.slug, { lat: c.lat, lng: c.lng, name: "the city centre" });
  }

  if (me) {
    const trips = await db
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
    origins.get(row.city) ??
    (CITY_CENTRE[row.city] ? { ...CITY_CENTRE[row.city], name: "the city centre" } : null);

  let walk = row.walk_minutes;
  if (origin && row.lat !== null && row.lng !== null && row.lat !== undefined && row.lng !== undefined) {
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
    walkFrom: walk === 0 ? "your hostel" : (origin?.name ?? "the city centre"),
  };
}

async function toFeedEvents(rows: EventRow[], me: number | null): Promise<FeedEvent[]> {
  const origins = await walkOrigins(me);
  return rows.map((row) => toFeedEvent(row, origins));
}

/* ---------------------------------------------------------------- cities */

export async function getCities(): Promise<(City & { events: number; hostels: number })[]> {
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

export async function getCity(slug: string): Promise<City | undefined> {
  return getDb().prepare("SELECT * FROM cities WHERE slug = ?").get<City>(slug);
}

/** Only these are safe to show a traveller: picker, explore, city pages, sitemap. */
export async function getLiveCities(): Promise<(City & { events: number; hostels: number })[]> {
  return (await getCities()).filter((c) => c.status === "live");
}

/** Falls back to the first live city, so a stale cookie can't 404 the feed. */
export async function getLiveCityOr(slug: string | undefined, fallback = ""): Promise<City | undefined> {
  const wanted = slug ? await getCity(slug) : undefined;
  if (wanted?.status === "live") return wanted;
  const named = fallback ? await getCity(fallback) : undefined;
  if (named?.status === "live") return named;
  return (await getLiveCities())[0];
}

/**
 * The numbers the launch bar is scored on. `postingHostels` is the honest one:
 * a signed hostel that has never posted is a logo on a page, not supply.
 */
export async function getCitySupply(slug: string, days = LAUNCH_BAR.windowDays): Promise<CitySupply> {
  const db = getDb();
  const today = todayISO();
  const to = addDays(today, days);

  const hostels = (await db
    .prepare("SELECT COUNT(*) AS n FROM hostels WHERE city = ? AND status = 'active'")
    .get<{ n: number }>(slug))!.n;

  const posting = (await db
    .prepare(
      `SELECT COUNT(DISTINCT e.hostel_id) AS n FROM events e
       JOIN hostels h ON h.id = e.hostel_id AND h.status = 'active'
       WHERE e.city = @slug AND e.cancelled = 0
         AND e.starts_at >= @from AND e.starts_at < @to`
    )
    .get<{ n: number }>({ slug, from: today, to }))!.n;

  const events = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE city = @slug AND cancelled = 0 AND starts_at >= @from AND starts_at < @to`
    )
    .get<{ n: number }>({ slug, from: today, to }))!.n;

  const week = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE city = @slug AND cancelled = 0 AND starts_at >= @from AND starts_at < @to`
    )
    .get<{ n: number }>({ slug, from: today, to: addDays(today, 7) }))!.n;

  const joins = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM joins j JOIN events e ON e.id = j.event_id
       WHERE e.city = @slug AND e.cancelled = 0 AND e.starts_at >= @from AND e.starts_at < @to`
    )
    .get<{ n: number }>({ slug, from: today, to }))!.n;

  const next = (await db
    .prepare(
      `SELECT MIN(starts_at) AS starts_at FROM events
       WHERE city = @slug AND cancelled = 0 AND starts_at >= @from`
    )
    .get<{ starts_at: string | null }>({ slug, from: today }))!.starts_at;

  const scans = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM arrivals a JOIN hostels h ON h.id = a.hostel_id
       WHERE h.city = @slug AND a.day >= @since`
    )
    .get<{ n: number }>({ slug, since: addDays(today, -30) }))!.n;

  return {
    hostels,
    postingHostels: posting,
    events,
    eventsWeek: week,
    joins,
    scans,
    nextEvent: next,
  };
}

export type CityPipelineEntry = {
  city: City;
  supply: CitySupply;
  gates: Gate[];
  readiness: ReturnType<typeof launchReadiness>;
};

export async function getCityPipeline(): Promise<CityPipelineEntry[]> {
  return Promise.all(
    (await getCities()).map(async (city) => {
      const supply = await getCitySupply(city.slug);
      const gates = launchGates(city, supply);
      return { city, supply, gates, readiness: launchReadiness(gates) };
    })
  );
}

export type NewCityInput = {
  slug: string;
  name: string;
  country: string;
  tz: string;
  emoji: string;
  intro: string;
  lat: number;
  lng: number;
  status: CityStatus;
  launch_on: string | null;
};

export async function createCity(input: NewCityInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (await db.prepare("SELECT 1 AS x FROM cities WHERE slug = ?").get(input.slug)) {
    return { ok: false, error: `/${input.slug} already exists.` };
  }

  // A city record that fails its own first gate would be a dead end, so it is
  // validated before it is written rather than after.
  if (!recordComplete(input)) {
    return { ok: false, error: "A city needs a name, country, timezone, centre and a one-line intro." };
  }

  await db.prepare(
    `INSERT INTO cities (slug, name, country, tz, emoji, intro, lat, lng, status, launch_on)
     VALUES (@slug, @name, @country, @tz, @emoji, @intro, @lat, @lng, @status, @launch_on)`
  ).run({
    ...input,
    emoji: input.emoji.trim() || "📍",
    status: input.status === "live" ? "opening" : input.status,
  });

  return { ok: true };
}

export async function setCityStatus(slug: string, status: CityStatus, launchOn?: string | null): Promise<void> {
  const db = getDb();
  if (status === "live") {
    await db.prepare(
      "UPDATE cities SET status = 'live', launch_on = COALESCE(?, launch_on, ?) WHERE slug = ?"
    ).run(launchOn ?? null, todayISO(), slug);
    return;
  }
  await db.prepare("UPDATE cities SET status = ?, launch_on = COALESCE(?, launch_on) WHERE slug = ?").run(
    status,
    launchOn ?? null,
    slug
  );
}

/* ------------------------------------------------------------- arrivals */

export async function recordArrival(hostelId: number, visitor: string, day = todayISO()): Promise<void> {
  await getDb()
    .prepare("INSERT OR IGNORE INTO arrivals (hostel_id, visitor, day) VALUES (?, ?, ?)")
    .run(hostelId, visitor, day);
}

/**
 * Called when a traveller joins an event or books a bed. The visitor cookie is
 * the only thing tying an anonymous reception QR scan to a signed-in account,
 * so this must run before the session is created for the best attribution.
 */
export async function attributeArrival(visitor: string | null, travellerId: number, kind: "join" | "booking"): Promise<void> {
  if (!visitor) return;
  const column = kind === "join" ? "joined_at" : "booked_at";
  await getDb()
    .prepare(
      `UPDATE arrivals SET traveller_id = COALESCE(traveller_id, ?),
         ${column} = COALESCE(${column}, datetime('now'))
       WHERE visitor = ?`
    )
    .run(travellerId, visitor);
}

export type CityHostelRow = Hostel & { upcoming: number; joins: number; scans: number };

/** The partner list on a city's console page: who is actually carrying the city. */
export async function getCityHostels(slug: string): Promise<CityHostelRow[]> {
  const db = getDb();
  const today = todayISO();
  return db
    .prepare(
      `SELECT h.*,
        (SELECT COUNT(*) FROM events e WHERE e.hostel_id = h.id AND e.cancelled = 0
           AND e.starts_at >= @from AND e.starts_at < @to) AS upcoming,
        (SELECT COUNT(*) FROM joins j JOIN events e ON e.id = j.event_id
           WHERE e.hostel_id = h.id) AS joins,
        (SELECT COUNT(*) FROM arrivals a WHERE a.hostel_id = h.id AND a.day >= @since) AS scans
       FROM hostels h WHERE h.city = @city AND h.status = 'active'
       ORDER BY upcoming DESC, h.name ASC`
    )
    .all<CityHostelRow>({ city: slug, from: today, to: addDays(today, 14), since: addDays(today, -30) });
}

export type PartnerStats = {
  days: number;
  opens: number;
  people: number;
  joins: number;
  booked: number;
  bookings: number;
  revenue: number;
  daily: { day: string; opens: number }[];
};

/**
 * The hostel's own funnel: scans at reception → travellers who joined
 * something → beds booked. This is the number a hostel signs for, so it is
 * scoped to arrivals that started at that hostel's own link.
 */
export async function getPartnerStats(hostelId: number, days = 30): Promise<PartnerStats> {
  const db = getDb();
  const from = addDays(todayISO(), -days);

  const totals = (await db
    .prepare(
      `SELECT COUNT(*) AS opens, COUNT(DISTINCT visitor) AS people,
         COALESCE(SUM(CASE WHEN joined_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS joins,
         COALESCE(SUM(CASE WHEN booked_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS booked
       FROM arrivals WHERE hostel_id = ? AND day >= ?`
    )
    .get<{ opens: number; people: number; joins: number; booked: number }>(hostelId, from))!;

  const value = (await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS total FROM bookings
       WHERE hostel_id = @hostelId AND status != 'cancelled'
         AND traveller_id IN (
           SELECT traveller_id FROM arrivals
           WHERE hostel_id = @hostelId AND day >= @from AND booked_at IS NOT NULL
         )`
    )
    .get<{ n: number; total: number }>({ hostelId, from }))!;

  const daily = await db
    .prepare(
      `SELECT day, COUNT(*) AS opens FROM arrivals
       WHERE hostel_id = ? AND day >= ? GROUP BY day ORDER BY day ASC`
    )
    .all<{ day: string; opens: number }>(hostelId, addDays(todayISO(), -6));

  return {
    days,
    opens: totals.opens,
    people: totals.people,
    joins: totals.joins,
    booked: totals.booked,
    bookings: value.n,
    revenue: value.total,
    daily,
  };
}

/* ----------------------------------------------------------------- trips */

export async function getTrip(city: string, me: number | null): Promise<Trip | null> {
  if (!me) return null;
  const row = await getDb()
    .prepare(
      `SELECT t.*, h.name AS hostel_name
       FROM trips t LEFT JOIN hostels h ON h.id = t.hostel_id
       WHERE t.traveller_id = ? AND t.city = ? LIMIT 1`
    )
    .get<Trip>(me, city);
  return row ?? null;
}

export async function getTrips(me: number | null): Promise<Trip[]> {
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

export async function getCityEvents(
  city: string,
  from: string,
  to: string,
  me: number | null
): Promise<FeedEvent[]> {
  const rows = await getDb()
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

export async function getEvent(id: number, me: number | null): Promise<FeedEvent | null> {
  const row = await getDb()
    .prepare(`${EVENT_SELECT} WHERE e.id = @id AND ${VISIBLE_TO_ME}`)
    .get<EventRow>({ id, me });
  return row ? (await toFeedEvents([row], me))[0] : null;
}

export async function getWhoIsGoing(eventId: number): Promise<Traveller[]> {
  return getDb()
    .prepare(
      `SELECT t.*, j.created_at FROM joins j JOIN travellers t ON t.id = j.traveller_id
       WHERE j.event_id = ? ORDER BY j.created_at DESC, t.name ASC`
    )
    .all<Traveller>(eventId);
}

export async function toggleJoin(eventId: number, me: number, visitor: string | null = null) {
  const db = getDb();
  const exists = await db
    .prepare("SELECT 1 AS x FROM joins WHERE event_id = ? AND traveller_id = ?")
    .get(eventId, me);

  if (exists) {
    await db.prepare("DELETE FROM joins WHERE event_id = ? AND traveller_id = ?").run(eventId, me);
  } else {
    await db.prepare("INSERT INTO joins (event_id, traveller_id) VALUES (?, ?)").run(eventId, me);
    // Only joining counts as pull. Leaving an event is not a hostel's win.
    await attributeArrival(visitor, me, "join");
  }

  const going = (
    await db.prepare("SELECT COUNT(*) AS n FROM joins WHERE event_id = ?").get<{ n: number }>(eventId) as {
      n: number;
    }
  ).n;

  return { joined: !exists, going };
}

export async function getHostelPosts(hostelId: number, limit: number, me: number | null): Promise<FeedEvent[]> {
  const rows = await getDb()
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

export async function createHostelEvent(
  input: NewEventInput,
  hostelId: number,
  me: number | null
): Promise<number> {
  const db = getDb();
  const hostel = await db
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

  const info = await db
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

export async function cancelEvent(eventId: number): Promise<void> {
  await getDb().prepare("UPDATE events SET cancelled = 1 WHERE id = ?").run(eventId);
}

export async function getStaffEvents(hostelId: number, me: number | null): Promise<FeedEvent[]> {
  const rows = await getDb()
    .prepare(
      `${EVENT_SELECT} WHERE e.hostel_id = @hostelId ORDER BY e.starts_at DESC LIMIT 30`
    )
    .all<EventRow>({ hostelId, me });
  return toFeedEvents(rows, me);
}

export async function getStaffStats(hostelId: number) {
  const db = getDb();
  const today = todayISO();

  const upcoming = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE hostel_id = @hostelId AND cancelled = 0 AND starts_at >= @today`
    )
    .get<{ n: number }>({ hostelId, today }))!.n;

  const joins = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM joins j JOIN events e ON e.id = j.event_id
       WHERE e.hostel_id = @hostelId AND e.starts_at >= @today`
    )
    .get<{ n: number }>({ hostelId, today }))!.n;

  const bookings = (await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS revenue FROM bookings
       WHERE hostel_id = @hostelId AND status != 'cancelled'`
    )
    .get<{ n: number; revenue: number }>({ hostelId }))!;

  const messages = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages m JOIN events e ON e.id = m.event_id
       WHERE e.hostel_id = @hostelId AND m.reported = 1 AND m.hidden = 0`
    )
    .get<{ n: number }>({ hostelId }))!.n;

  return { upcoming, joins, bookings: bookings.n, revenue: bookings.revenue, reported: messages };
}

/* -------------------------------------------------------------- hostels */

/**
 * Public list: only hostels that have been approved. Applications live in the
 * same table with status = 'pending' and must never leak into Explore, a city
 * page, the launch bar or the sitemap.
 */
export async function getHostels(city?: string): Promise<Hostel[]> {
  const db = getDb();
  return city
    ? await db
        .prepare("SELECT * FROM hostels WHERE city = ? AND status = 'active' ORDER BY rating DESC")
        .all<Hostel>(city)
    : await db
        .prepare("SELECT * FROM hostels WHERE status = 'active' ORDER BY city, rating DESC")
        .all<Hostel>();
}

/** Ops and staff surfaces: everything, whatever its state. */
export async function getAllHostels(city?: string): Promise<Hostel[]> {
  const db = getDb();
  return city
    ? await db.prepare("SELECT * FROM hostels WHERE city = ? ORDER BY status, name").all<Hostel>(city)
    : await db.prepare("SELECT * FROM hostels ORDER BY city, status, name").all<Hostel>();
}

export async function getHostelById(id: number): Promise<Hostel | undefined> {
  return getDb().prepare("SELECT * FROM hostels WHERE id = ?").get<Hostel>(id);
}

export async function getCityApplications(city: string): Promise<Hostel[]> {
  return getDb()
    .prepare("SELECT * FROM hostels WHERE city = ? AND status = 'pending' ORDER BY applied_at ASC")
    .all<Hostel>(city);
}

export async function getPendingApplications(limit = 20): Promise<(Hostel & { city_name: string })[]> {
  return getDb()
    .prepare(
      `SELECT h.*, COALESCE(c.name, h.city) AS city_name
       FROM hostels h LEFT JOIN cities c ON c.slug = h.city
       WHERE h.status = 'pending' ORDER BY h.applied_at ASC LIMIT ?`
    )
    .all<Hostel & { city_name: string }>(limit);
}

export type HostelApplicationInput = {
  city: string;
  name: string;
  area: string;
  description: string;
  beds: number;
  priceFromCents: number;
  contactEmail: string;
  note: string;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/**
 * A hostel applying to be on Away, and the staff account that will run it —
 * created together, in one transaction, so we never end up with an applicant
 * who has no hostel or a hostel nobody can log into.
 */
export async function createPartnerApplication(
  input: HostelApplicationInput & { contactName: string; email: string; passwordHash: string }
): Promise<{ ok: true; hostelId: number; travellerId: number } | { ok: false; error: string }> {
  const db = getDb();

  const city = await db.prepare("SELECT slug, lat, lng FROM cities WHERE slug = ?").get<{
    slug: string;
    lat: number;
    lng: number;
  }>(input.city);
  if (!city) return { ok: false, error: "Pick a city we know about." };

  if (await db.prepare("SELECT 1 AS x FROM travellers WHERE email = ?").get(input.email)) {
    return { ok: false, error: "That email already has an account. Sign in instead." };
  }

  const base = slugify(input.name);
  if (!base) return { ok: false, error: "Give the hostel a name we can use in a URL." };
  let slug = base;
  for (let n = 2; await db.prepare("SELECT 1 AS x FROM hostels WHERE slug = ?").get(slug); n += 1) {
    slug = `${base}-${n}`;
    if (n > 20) return { ok: false, error: "That name is taken. Try a slightly different one." };
  }

  try {
    return db.transaction(async () => {
      const hostel = await db
        .prepare(
          `INSERT INTO hostels (slug, city, name, area, description, rating, price_from_cents,
             lat, lng, status, contact_email, applied_at, note, beds)
           VALUES (@slug, @city, @name, @area, @description, 0, @price, @lat, @lng, 'pending',
             @email, datetime('now'), @note, @beds)`
        )
        .run({
          slug,
          city: input.city,
          name: input.name,
          area: input.area,
          description: input.description,
          price: input.priceFromCents,
          lat: city.lat,
          lng: city.lng,
          email: input.email,
          note: input.note,
          beds: input.beds,
        });

      const person = await db
        .prepare(
          `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email,
             password_hash, role, hostel_id, email_verified_at)
           VALUES (@name, @initials, '', '#FFD9A0', 0, 'English', @email, @hash, 'hostel_staff',
             @hostelId, datetime('now'))`
        )
        .run({
          name: input.contactName,
          initials: input.contactName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          email: input.email,
          hash: input.passwordHash,
          hostelId: hostel.lastInsertRowid,
        });

      return { ok: true as const, hostelId: hostel.lastInsertRowid, travellerId: person.lastInsertRowid };
    });
  } catch {
    return { ok: false, error: "Something went wrong saving the application. Try again." };
  }
}

/**
 * Approval is the only moment a hostel becomes real: it goes active, gets a
 * rating placeholder of "new", and gets a bookable room set so the first
 * traveller who finds it can actually reserve a bed.
 */
export async function approveHostel(hostelId: number): Promise<boolean> {
  const db = getDb();
  const hostel = await db.prepare("SELECT * FROM hostels WHERE id = ?").get<Hostel>(hostelId);
  if (!hostel || hostel.status === "active") return false;

  await db.transaction(async () => {
    await db.prepare("UPDATE hostels SET status = 'active' WHERE id = ?").run(hostelId);

    const rooms = (await db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE hostel_id = ?").get<{ n: number }>(hostelId))!;
    if (rooms.n === 0 && hostel.price_from_cents > 0) {
      const insRoom = db.prepare(
        "INSERT INTO rooms (hostel_id, name, kind, beds, price_cents) VALUES (?, ?, ?, ?, ?)"
      );
      await insRoom.run(hostelId, "Mixed dorm · 6 beds", "dorm", 6, hostel.price_from_cents);
      await insRoom.run(
        hostelId,
        "Private double",
        "private",
        2,
        Math.round((hostel.price_from_cents * 3.4) / 100) * 100
      );
    }
  });

  return true;
}

export async function rejectHostel(hostelId: number): Promise<boolean> {
  return (
    (await getDb().prepare("UPDATE hostels SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(hostelId))
      .changes > 0
  );
}

export async function setHostelStatus(hostelId: number, status: "active" | "paused"): Promise<void> {
  await getDb().prepare("UPDATE hostels SET status = ? WHERE id = ?").run(status, hostelId);
}

export async function getHostelBySlug(slug: string): Promise<Hostel | undefined> {
  return getDb().prepare("SELECT * FROM hostels WHERE slug = ?").get<Hostel>(slug);
}

export async function getRooms(hostelId: number): Promise<Room[]> {
  return getDb()
    .prepare("SELECT * FROM rooms WHERE hostel_id = ? ORDER BY price_cents ASC")
    .all<Room>(hostelId);
}

/* ------------------------------------------------------------- travellers */

export async function getTraveller(id: number): Promise<Traveller | null> {
  return await getDb().prepare("SELECT * FROM travellers WHERE id = ?").get<Traveller>(id) ?? null;
}

export async function getTravellerCount(): Promise<number> {
  return (await getDb().prepare("SELECT COUNT(*) AS n FROM travellers").get<{ n: number }>())!.n;
}

export async function getJoinedCount(me: number | null): Promise<number> {
  if (!me) return 0;
  return (
    (await getDb()
      .prepare("SELECT COUNT(*) AS n FROM joins WHERE traveller_id = ?")
      .get<{ n: number }>(me))!.n
  );
}

/* ---------------------------------------------------------------- chat */

export async function getMessages(eventId: number, me: number | null): Promise<Message[]> {
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

export async function getMessagesAfter(eventId: number, afterId: number, me: number | null): Promise<Message[]> {
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

export async function getMessageById(messageId: number, me: number | null): Promise<Message | null> {
  return (
    await getDb()
      .prepare(
        `SELECT m.*, t.name, t.initials, t.colour, t.flag,
                CASE WHEN m.traveller_id = @me THEN 1 ELSE 0 END AS mine
         FROM messages m JOIN travellers t ON t.id = m.traveller_id
         WHERE m.id = @messageId`
      )
      .get<Message>({ messageId, me }) ?? null
  );
}

export async function recentMessageCount(me: number, minutes = 10): Promise<number> {
  return (
    (await getDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE traveller_id = ? AND created_at > datetime('now', ?)"
      )
      .get<{ n: number }>(me, `-${minutes} minutes`))!.n
  );
}

export async function addMessage(eventId: number, me: number, body: string): Promise<number> {
  const info = await getDb()
    .prepare("INSERT INTO messages (event_id, traveller_id, body) VALUES (?, ?, ?)")
    .run(eventId, me, body.slice(0, 500));
  return info.lastInsertRowid;
}

export async function reportMessage(messageId: number): Promise<void> {
  await getDb().prepare("UPDATE messages SET reported = 1 WHERE id = ?").run(messageId);
}

export async function clearReport(messageId: number): Promise<void> {
  await getDb().prepare("UPDATE messages SET reported = 0 WHERE id = ?").run(messageId);
}

/** Hostel that owns the event a chat message belongs to (for moderation scope). */
export async function getMessageHostel(messageId: number): Promise<number | null | undefined> {
  const row = await getDb()
    .prepare("SELECT e.hostel_id AS hostel_id FROM messages m JOIN events e ON e.id = m.event_id WHERE m.id = ?")
    .get<{ hostel_id: number | null }>(messageId);
  return row ? row.hostel_id : undefined;
}

export async function hideMessage(messageId: number): Promise<void> {
  await getDb().prepare("UPDATE messages SET hidden = 1 WHERE id = ?").run(messageId);
}

export async function getReportedMessages(
  hostelId: number
): Promise<(Message & { event_title: string })[]> {
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

export async function bedsTaken(roomId: number, checkIn: string, checkOut: string): Promise<number> {
  const db = getDb();
  const nights = Math.max(0, diffDays(checkIn, checkOut));
  let peak = 0;
  for (let i = 0; i < nights; i += 1) {
    const night = addDays(checkIn, i);
    const row = (await db
      .prepare(
        `SELECT COALESCE(SUM(guests), 0) AS n FROM bookings
         WHERE room_id = @roomId AND status != 'cancelled'
           AND check_in <= @night AND check_out > @night`
      )
      .get<{ n: number }>({ roomId, night }))!;
    peak = Math.max(peak, row.n);
  }
  return peak;
}

export async function roomsWithAvailability(hostelId: number, checkIn: string, checkOut: string) {
  return Promise.all(
    (await getRooms(hostelId)).map(async (room) => {
      const taken = await bedsTaken(room.id, checkIn, checkOut);
      return { ...room, taken, free: Math.max(0, room.beds - taken) };
    })
  );
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

export async function createBooking(
  input: BookingInput,
  me: number,
  visitor: string | null = null
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const db = getDb();
  const room = await db
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
    return db.transaction(async () => {
      const taken = await bedsTaken(room.id, input.checkIn, input.checkOut);
      if (taken + input.guests > room.beds) {
        return { ok: false as const, error: "Someone just took the last bed. Try different dates." };
      }

      const total = room.price_cents * nights * input.guests;
      const code = bookingCode();

      const booking = await db
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

      await openPayment(booking.lastInsertRowid, code, total);
      await attributeArrival(visitor, me, "booking");

      return { ok: true as const, code };
    });
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

export async function getBookingByCode(code: string): Promise<BookingDetail | undefined> {
  return getDb().prepare(`${BOOKING_SELECT} WHERE b.code = @code`).get<BookingDetail>({ code });
}

export async function getBookingsForUser(me: number | null): Promise<BookingDetail[]> {
  if (!me) return [];
  return getDb()
    .prepare(`${BOOKING_SELECT} WHERE b.traveller_id = @me ORDER BY b.check_in DESC`)
    .all<BookingDetail>({ me });
}

export async function getBookingsForHostel(hostelId: number): Promise<(BookingDetail & { guest_name: string })[]> {
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

export async function markBookingPaid(code: string, me: number): Promise<Payment["status"] | null> {
  const db = getDb();
  const booking = await db
    .prepare("SELECT id, traveller_id, status FROM bookings WHERE code = ?")
    .get<{ id: number; traveller_id: number; status: string }>(code);
  if (!booking || booking.traveller_id !== me) return null;
  // Only a pending hold can be paid. Paying a cancelled booking used to flip it
  // back to "confirmed" without re-checking that the bed was still free.
  if (booking.status !== "pending") return null;

  const payment = await getPaymentForBooking(booking.id);
  if (!payment) return null;

  const paid = await db.transaction(async () => completePayment(payment.reference));
  return paid ? ("paid" as const) : null;
}

export async function cancelBooking(code: string, me: number): Promise<boolean> {
  const db = getDb();
  const booking = await db
    .prepare("SELECT id, traveller_id, status FROM bookings WHERE code = ?")
    .get<{ id: number; traveller_id: number; status: string }>(code);
  if (!booking || booking.traveller_id !== me || booking.status === "cancelled") return false;

  await db.transaction(async () => {
    await db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
    await refundPayment(booking.id);
  });

  return true;
}

/* --------------------------------------------------------------- ingest */

export async function startIngestRun(source: string, mode: string): Promise<number> {
  const info = await getDb()
    .prepare(
      "INSERT INTO ingest_runs (source, mode, started_at, status) VALUES (?, ?, datetime('now'), 'running')"
    )
    .run(source, mode);
  return info.lastInsertRowid;
}

export async function finishIngestRun(
  id: number,
  counts: { fetched: number; inserted: number; updated: number; skipped: number },
  status: string,
  note = ""
): Promise<void> {
  await getDb()
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

export async function upsertIngestedEvent(event: IngestedEvent): Promise<"inserted" | "updated" | "skipped"> {
  const db = getDb();
  const existing = await db
    .prepare("SELECT id FROM events WHERE city = ? AND external_id = ?")
    .get<{ id: number }>(event.city, event.externalId);

  if (existing) {
    await db.prepare(
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

  await db.prepare(
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

export async function getIngestRuns(limit = 8): Promise<IngestRun[]> {
  return getDb()
    .prepare("SELECT * FROM ingest_runs ORDER BY id DESC LIMIT ?")
    .all<IngestRun>(limit);
}

export async function getIngestTotals() {
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS events, MAX(created_at) AS newest
       FROM events WHERE origin = 'ingest'`
    )
    .get<{ events: number; newest: string | null }>())!;
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
