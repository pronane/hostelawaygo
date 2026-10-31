import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOSTELS, TRAVELLERS, EVENTS } from "./seed-data";
import { addDays, todayISO } from "./time";

const DB_PATH = process.env.AWAY_DB_PATH ?? join(process.cwd(), "data", "away.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cities (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, tz TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hostels (
  id INTEGER PRIMARY KEY AUTOINCREMENT, city TEXT NOT NULL, name TEXT NOT NULL, area TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS travellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, initials TEXT NOT NULL,
  flag TEXT NOT NULL, colour TEXT NOT NULL, solo INTEGER NOT NULL DEFAULT 1,
  languages TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  hostel_id INTEGER REFERENCES hostels(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 120,
  price_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📍',
  cover_from TEXT NOT NULL DEFAULT '#FFD9A0',
  cover_to TEXT NOT NULL DEFAULT '#FF9D6B',
  venue TEXT NOT NULL,
  walk_minutes INTEGER NOT NULL DEFAULT 10,
  capacity INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  lens TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL DEFAULT 'seed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_city_start ON events(city, starts_at);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traveller_id INTEGER NOT NULL,
  city TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  hostel_id INTEGER,
  arrival_time TEXT NOT NULL DEFAULT '14:00',
  departure_time TEXT NOT NULL DEFAULT '10:00'
);
CREATE TABLE IF NOT EXISTS joins (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  traveller_id INTEGER NOT NULL REFERENCES travellers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, traveller_id)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const globalForDb = globalThis as unknown as { __awayDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__awayDb) return globalForDb.__awayDb;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seedIfEmpty(db);

  globalForDb.__awayDb = db;
  return db;
}

function pick<T>(input: T[], n: number, seed: number): T[] {
  const a = [...input];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

function seedIfEmpty(db: Database.Database) {
  const seeded = db.prepare("SELECT value FROM meta WHERE key = 'seeded_on'").get() as
    | { value: string }
    | undefined;
  if (seeded) return;

  const today = todayISO();

  const run = db.transaction(() => {
    db.prepare("INSERT INTO cities (slug, name, country, tz) VALUES (?, ?, ?, ?)").run(
      "lisbon", "Lisbon", "Portugal", "Europe/Lisbon"
    );
    db.prepare("INSERT INTO cities (slug, name, country, tz) VALUES (?, ?, ?, ?)").run(
      "porto", "Porto", "Portugal", "Europe/Lisbon"
    );

    const hostelIds = new Map<string, number>();
    const insHostel = db.prepare("INSERT INTO hostels (city, name, area) VALUES (?, ?, ?)");
    for (const h of HOSTELS) {
      const info = insHostel.run(h.city, h.name, h.area);
      hostelIds.set(h.name, Number(info.lastInsertRowid));
    }

    const insTrav = db.prepare(
      "INSERT INTO travellers (name, initials, flag, colour, solo, languages) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const t of TRAVELLERS) {
      insTrav.run(
        t.name,
        t.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        t.flag,
        t.colour,
        t.solo ? 1 : 0,
        t.languages
      );
    }

    const insEvent = db.prepare(`
      INSERT INTO events (city, hostel_id, title, description, starts_at, duration_min,
        price_cents, source, category, emoji, cover_from, cover_to, venue, walk_minutes,
        capacity, tags, lens, created_by)
      VALUES (@city, @hostel_id, @title, @description, @starts_at, @duration_min,
        @price_cents, @source, @category, @emoji, @cover_from, @cover_to, @venue, @walk_minutes,
        @capacity, @tags, @lens, 'seed')
    `);

    const insJoin = db.prepare(
      "INSERT OR IGNORE INTO joins (event_id, traveller_id) VALUES (?, ?)"
    );

    // travellers 2..24 can be seeded into events; id 1 is the demo account
    const pool = Array.from({ length: TRAVELLERS.length - 1 }, (_, i) => i + 2);

    EVENTS.forEach((e, index) => {
      const tags = e.priceCents === 0 ? [...new Set([...e.tags, "free"])] : e.tags;
      const info = insEvent.run({
        city: e.city,
        hostel_id: e.hostel ? hostelIds.get(e.hostel) ?? null : null,
        title: e.title,
        description: e.description,
        starts_at: `${addDays(today, e.dayOffset)}T${e.time}`,
        duration_min: e.durationMin,
        price_cents: e.priceCents,
        source: e.source,
        category: e.category,
        emoji: e.emoji,
        cover_from: e.cover[0],
        cover_to: e.cover[1],
        venue: e.venue,
        walk_minutes: e.walkMinutes,
        capacity: e.capacity ?? null,
        tags: JSON.stringify(tags),
        lens: JSON.stringify(e.lens),
      });

      const eventId = Number(info.lastInsertRowid);
      const wanted = Math.min(e.seated, e.capacity ?? e.seated, pool.length);
      for (const travellerId of pick(pool, wanted, index * 7919 + 13)) {
        insJoin.run(eventId, travellerId);
      }
    });

    // The demo account's trips: staying in Lisbon now, Porto in twelve days.
    const insTrip = db.prepare(`
      INSERT INTO trips (traveller_id, city, starts_on, ends_on, hostel_id, arrival_time, departure_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insTrip.run(1, "lisbon", addDays(today, -2), addDays(today, 10),
      hostelIds.get("Home Lisbon Hostel") ?? null, "15:00", "10:30");
    insTrip.run(1, "porto", addDays(today, 12), addDays(today, 15),
      hostelIds.get("Pilot Design Hostel") ?? null, "14:20", "09:10");

    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded_on', ?)").run(today);
  });

  run();
}
