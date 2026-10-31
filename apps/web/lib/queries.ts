import { getDb } from "./db";
import { DEMO_USER_ID, type CitySlug, type Source, type WindowStatus } from "./constants";
import { addDays, dateOf, todayISO } from "./time";
import type { FeedEvent, EventRow, Hostel, Traveller, Trip } from "./types";

const EVENT_SELECT = `
  SELECT e.*, h.name AS hostel_name, h.area AS hostel_area,
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

function toFeedEvent(row: EventRow): FeedEvent {
  return {
    ...row,
    tags: JSON.parse(row.tags || "[]") as string[],
    lens: JSON.parse(row.lens || "[]") as string[],
    going: row.going,
    soloGoing: row.solo_going,
    avatars: row.avatars ? row.avatars.split(",") : [],
    isJoined: row.is_joined > 0,
    source: row.source as Source,
  };
}

export function getTrip(city: CitySlug, me = DEMO_USER_ID): Trip | null {
  const row = getDb()
    .prepare(
      `SELECT t.*, h.name AS hostel_name
       FROM trips t LEFT JOIN hostels h ON h.id = t.hostel_id
       WHERE t.traveller_id = ? AND t.city = ? LIMIT 1`
    )
    .get(me, city) as Trip | undefined;
  return row ?? null;
}

/** Events happening in a city between two local dates (inclusive of `from`, exclusive of `to`). */
export function getCityEvents(city: CitySlug, from: string, to: string, me = DEMO_USER_ID): FeedEvent[] {
  const rows = getDb()
    .prepare(`${EVENT_SELECT} WHERE e.city = @city AND e.starts_at >= @from AND e.starts_at < @to
              ORDER BY e.starts_at ASC`)
    .all({ city, from, to: to.length === 10 ? `${to}T23:59` : to, me }) as EventRow[];
  return rows.map(toFeedEvent);
}

export function getEvent(id: number, me = DEMO_USER_ID): FeedEvent | null {
  const row = getDb().prepare(`${EVENT_SELECT} WHERE e.id = @id`).get({ id, me }) as
    | EventRow
    | undefined;
  return row ? toFeedEvent(row) : null;
}

export function getWhoIsGoing(eventId: number): Traveller[] {
  return getDb()
    .prepare(
      `SELECT t.*, j.created_at FROM joins j JOIN travellers t ON t.id = j.traveller_id
       WHERE j.event_id = ? ORDER BY j.created_at DESC, t.name ASC`
    )
    .all(eventId) as Traveller[];
}

export function toggleJoin(eventId: number, me = DEMO_USER_ID) {
  const db = getDb();
  const exists = db
    .prepare("SELECT 1 FROM joins WHERE event_id = ? AND traveller_id = ?")
    .get(eventId, me);
  if (exists) {
    db.prepare("DELETE FROM joins WHERE event_id = ? AND traveller_id = ?").run(eventId, me);
  } else {
    db.prepare("INSERT INTO joins (event_id, traveller_id) VALUES (?, ?)").run(eventId, me);
  }
  const going = (
    db.prepare("SELECT COUNT(*) AS n FROM joins WHERE event_id = ?").get(eventId) as { n: number }
  ).n;
  return { joined: !exists, going };
}

export function getHostels(city?: CitySlug): Hostel[] {
  const db = getDb();
  return city
    ? (db.prepare("SELECT * FROM hostels WHERE city = ? ORDER BY name").all(city) as Hostel[])
    : (db.prepare("SELECT * FROM hostels ORDER BY city, name").all() as Hostel[]);
}

export function getTraveller(id: number): Traveller | null {
  const row = getDb().prepare("SELECT * FROM travellers WHERE id = ?").get(id) as
    | Traveller
    | undefined;
  return row ?? null;
}

export function getTravellerCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM travellers").get() as { n: number }).n;
}

export function getJoinedCount(me = DEMO_USER_ID): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM joins WHERE traveller_id = ?").get(me) as {
      n: number;
    }
  ).n;
}

export function getHostelPosts(hostelId: number, limit = 4): FeedEvent[] {
  const rows = getDb()
    .prepare(`${EVENT_SELECT} WHERE e.hostel_id = @hostelId ORDER BY e.starts_at DESC LIMIT @limit`)
    .all({ hostelId, limit, me: DEMO_USER_ID }) as EventRow[];
  return rows.map(toFeedEvent);
}

export type NewEventInput = {
  title: string;
  startsAt: string;
  priceCents: number;
  category: string;
  description?: string;
  durationMin?: number;
};

const CATEGORY_STYLE: Record<string, { emoji: string; cover: [string, string] }> = {
  food: { emoji: "🍽️", cover: ["#FFE3B8", "#F5B350"] },
  music: { emoji: "🎶", cover: ["#C8B8FF", "#7A5BFF"] },
  social: { emoji: "🏆", cover: ["#FFD6C9", "#FF7A59"] },
  outdoors: { emoji: "🌅", cover: ["#FFD0B0", "#E0705A"] },
  culture: { emoji: "🎟️", cover: ["#BFE3FF", "#5AA9F0"] },
  nightlife: { emoji: "🪩", cover: ["#C9C2FF", "#6C5CE7"] },
};

export function createHostelEvent(input: NewEventInput): number {
  const db = getDb();
  const hostel = getHostels("lisbon").find((h) => h.name === "Home Lisbon Hostel");
  const style = CATEGORY_STYLE[input.category] ?? CATEGORY_STYLE.social;
  const today = todayISO();
  const time = /^\d{2}:\d{2}$/.test(input.startsAt) ? input.startsAt : "20:00";
  const startsAt = new Date(`${today}T${time}:00Z`) < new Date() ? `${addDays(today, 1)}T${time}` : `${today}T${time}`;

  const info = db
    .prepare(
      `INSERT INTO events (city, hostel_id, title, description, starts_at, duration_min, price_cents,
        source, category, emoji, cover_from, cover_to, venue, walk_minutes, tags, lens, created_by)
       VALUES ('lisbon', @hostel_id, @title, @description, @starts_at, @duration_min, @price_cents,
        'hostel', @category, @emoji, @cover_from, @cover_to, @venue, 0, @tags, '[]', 'hostel-staff')`
    )
    .run({
      hostel_id: hostel?.id ?? null,
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
      venue: `${hostel?.name ?? "Home Lisbon Hostel"} · your hostel`,
      tags: JSON.stringify(input.priceCents === 0 ? ["solo", "social", "free"] : ["solo", "social"]),
    });

  return Number(info.lastInsertRowid);
}

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

/** Events grouped into calendar days for the feed. */
export function groupByDay(events: FeedEvent[]): { date: string; events: FeedEvent[] }[] {
  const groups = new Map<string, FeedEvent[]>();
  for (const e of events) {
    const d = dateOf(e.starts_at);
    const arr = groups.get(d) ?? [];
    arr.push(e);
    groups.set(d, arr);
  }
  return [...groups.entries()].map(([date, evs]) => ({ date, events: evs }));
}
