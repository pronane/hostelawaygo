import type { Db } from "./sqlite";
import { SCHEMA_VERSION } from "./schema";
import { hashPassword } from "./password";
import { EVENTS, HOSTELS, TRAVELLERS } from "./seed-data";
import { ACCOUNTS, CITIES, EXTRA_EVENTS, ROOM_TEMPLATES, SEED_MESSAGES } from "./seed-extra";
import { addDays, todayISO } from "./time";

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

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function seed(db: Db): void {
  const today = todayISO();

  const run = db.transaction(() => {
    /* cities */
    const insCity = db.prepare(
      "INSERT INTO cities (slug, name, country, tz, emoji, intro) VALUES (@slug, @name, @country, @tz, @emoji, @intro)"
    );
    for (const c of CITIES) insCity.run(c);

    /* hostels */
    const insHostel = db.prepare(
      `INSERT INTO hostels (slug, city, name, area, description, rating, price_from_cents)
       VALUES (@slug, @city, @name, @area, @description, @rating, @price_from_cents)`
    );
    const hostelIdBySlug = new Map<string, number>();
    const hostelIdByName = new Map<string, number>();
    for (const h of HOSTELS) {
      const info = insHostel.run({
        slug: h.slug,
        city: h.city,
        name: h.name,
        area: h.area,
        description: h.description,
        rating: h.rating,
        price_from_cents: h.priceFrom,
      });
      hostelIdBySlug.set(h.slug, info.lastInsertRowid);
      hostelIdByName.set(h.name, info.lastInsertRowid);
    }

    /* rooms */
    const insRoom = db.prepare(
      "INSERT INTO rooms (hostel_id, name, kind, beds, price_cents) VALUES (?, ?, ?, ?, ?)"
    );
    for (const h of HOSTELS) {
      const hostelId = hostelIdBySlug.get(h.slug)!;
      for (const room of ROOM_TEMPLATES(h.priceFrom)) {
        insRoom.run(hostelId, room.name, room.kind, room.beds, room.price_cents);
      }
    }

    /* travellers */
    const insTraveller = db.prepare(
      `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, hostel_id)
       VALUES (@name, @initials, @flag, @colour, @solo, @languages, @email, @password_hash, @role, @hostel_id)`
    );

    for (const t of TRAVELLERS) {
      insTraveller.run({
        name: t.name,
        initials: initialsOf(t.name),
        flag: t.flag,
        colour: t.colour,
        solo: t.solo ? 1 : 0,
        languages: t.languages,
        email: null,
        password_hash: null,
        role: "traveller",
        hostel_id: null,
      });
    }

    const travellerIdByName = new Map<string, number>();
    const seeded = db.prepare("SELECT id, name FROM travellers").all<{ id: number; name: string }>();
    for (const row of seeded) travellerIdByName.set(row.name, row.id);

    /* accounts: Marta gets credentials on the seeded traveller row */
    const passwordHash = hashPassword("away1234");
    const updateAccount = db.prepare(
      "UPDATE travellers SET email = @email, password_hash = @hash, role = @role, hostel_id = @hostel_id WHERE id = @id"
    );
    const insertAccount = db.prepare(
      `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, hostel_id)
       VALUES (@name, @initials, @flag, @colour, 0, @languages, @email, @password_hash, @role, @hostel_id)`
    );

    for (const account of ACCOUNTS) {
      const hostelId = account.hostelSlug ? hostelIdBySlug.get(account.hostelSlug) ?? null : null;
      if (account.travellerIndex) {
        const row = db
          .prepare("SELECT id FROM travellers WHERE name = ?")
          .get<{ id: number }>(account.name);
        if (row) {
          updateAccount.run({
            id: row.id,
            email: account.email,
            hash: passwordHash,
            role: account.role,
            hostel_id: hostelId,
          });
        }
        continue;
      }
      const info = insertAccount.run({
        name: account.name,
        initials: initialsOf(account.name),
        flag: account.flag ?? "🌍",
        colour: account.colour ?? "#E7D6FF",
        languages: account.languages ?? "English",
        email: account.email,
        password_hash: passwordHash,
        role: account.role,
        hostel_id: hostelId,
      });
      travellerIdByName.set(account.name, info.lastInsertRowid);
    }

    /* events */
    const insEvent = db.prepare(`
      INSERT INTO events (city, hostel_id, title, description, starts_at, duration_min,
        price_cents, source, category, emoji, cover_from, cover_to, venue, walk_minutes,
        capacity, tags, lens, created_by, origin)
      VALUES (@city, @hostel_id, @title, @description, @starts_at, @duration_min,
        @price_cents, @source, @category, @emoji, @cover_from, @cover_to, @venue, @walk_minutes,
        @capacity, @tags, @lens, 'seed', 'seed')
    `);
    const insJoin = db.prepare("INSERT OR IGNORE INTO joins (event_id, traveller_id) VALUES (?, ?)");

    const allEvents = [...EVENTS, ...EXTRA_EVENTS];
    const pool = Array.from({ length: TRAVELLERS.length - 1 }, (_, i) => i + 2);
    const eventIdByTitle = new Map<string, number>();

    allEvents.forEach((e, index) => {
      const tags = e.priceCents === 0 ? [...new Set([...e.tags, "free"])] : e.tags;
      const info = insEvent.run({
        city: e.city,
        hostel_id: e.hostel ? hostelIdByName.get(e.hostel) ?? null : null,
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

      const eventId = info.lastInsertRowid;
      eventIdByTitle.set(e.title, eventId);

      const wanted = Math.min(e.seated, e.capacity ?? e.seated, pool.length);
      for (const travellerId of pick(pool, wanted, index * 7919 + 13)) {
        insJoin.run(eventId, travellerId);
      }
    });

    /* trips for the demo traveller */
    const insTrip = db.prepare(`
      INSERT INTO trips (traveller_id, city, starts_on, ends_on, hostel_id, arrival_time, departure_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const martaId = travellerIdByName.get("Marta K.") ?? 1;
    insTrip.run(martaId, "lisbon", addDays(today, -2), addDays(today, 10),
      hostelIdBySlug.get("home-lisbon") ?? null, "15:00", "10:30");
    insTrip.run(martaId, "porto", addDays(today, 12), addDays(today, 15),
      hostelIdBySlug.get("pilot-porto") ?? null, "14:20", "09:10");

    /* event chat */
    const insMessage = db.prepare(
      `INSERT INTO messages (event_id, traveller_id, body, created_at)
       VALUES (?, ?, ?, datetime('now', ?))`
    );
    for (const m of SEED_MESSAGES) {
      const eventId = eventIdByTitle.get(m.eventTitle);
      const authorId = travellerIdByName.get(m.author);
      if (!eventId || !authorId) continue;
      insMessage.run(eventId, authorId, m.body, `-${m.minutesAgo} minutes`);
    }

    /* one past booking so the account page isn't empty */
    const hostelId = hostelIdBySlug.get("home-lisbon")!;
    const room = db
      .prepare("SELECT id, price_cents FROM rooms WHERE hostel_id = ? ORDER BY price_cents LIMIT 1")
      .get<{ id: number; price_cents: number }>(hostelId);
    if (room) {
      const nights = 3;
      const total = room.price_cents * nights;
      const info = db
        .prepare(
          `INSERT INTO bookings (code, traveller_id, hostel_id, room_id, check_in, check_out,
            guests, nights, total_cents, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'confirmed', datetime('now', '-2 days'))`
        )
        .run("AWY-7K2M9Q", martaId, hostelId, room.id,
          addDays(today, -2), addDays(today, 1), nights, total);

      db.prepare(
        `INSERT INTO payments (booking_id, provider, reference, amount_cents, status, created_at, paid_at)
         VALUES (?, 'sandbox', ?, ?, 'paid', datetime('now', '-2 days'), datetime('now', '-2 days'))`
      ).run(info.lastInsertRowid, `pay_${info.lastInsertRowid}_seed`, total);
    }

    /* meta */
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded_on', ?)").run(today);
  });

  run();
}
