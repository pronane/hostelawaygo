import type { Db } from "./sql";
import { SCHEMA_VERSION } from "./schema";
import { hashPassword } from "./password";
import { demoAccountsEnabled } from "./flags";
import { EVENTS, HOSTELS, TRAVELLERS } from "./seed-data";
import {
  ACCOUNTS,
  CITIES,
  EXTRA_EVENTS,
  EXTRA_PORTO_EVENTS,
  ROOM_TEMPLATES,
  SEED_MESSAGES,
} from "./seed-extra";
import { addDays, todayISO } from "./time";
import { CITY_CENTRE, HOSTEL_COORDS, coordsForVenue } from "./geo";

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

export async function seed(db: Db): Promise<void> {
  const today = todayISO();

  await db.transaction(async () => {
    /* cities */
    const insCity = db.prepare(
      `INSERT INTO cities (slug, name, country, tz, emoji, intro, lat, lng, status, launch_on)
       VALUES (@slug, @name, @country, @tz, @emoji, @intro, @lat, @lng, @status, @launch_on)`
    );
    for (const c of CITIES) {
      const centre = CITY_CENTRE[c.slug] ?? CITY_CENTRE.lisbon;
      // A planned city has no record yet: the console shows it as the first
      // gate still open, which is the honest state of a city nobody has visited.
      const planned = c.status === "planned";
      await insCity.run({
        slug: c.slug,
        name: c.name,
        country: c.country,
        tz: c.tz,
        emoji: c.emoji,
        intro: c.intro,
        lat: planned ? 0 : centre.lat,
        lng: planned ? 0 : centre.lng,
        status: c.status,
        launch_on: c.launchInDays === null ? null : addDays(today, c.launchInDays),
      });
    }

    /* hostels */
    const insHostel = db.prepare(
      `INSERT INTO hostels (slug, city, name, area, description, rating, price_from_cents, lat, lng)
       VALUES (@slug, @city, @name, @area, @description, @rating, @price_from_cents, @lat, @lng)`
    );
    const hostelIdBySlug = new Map<string, number>();
    const hostelIdByName = new Map<string, number>();
    for (const h of HOSTELS) {
      const point = HOSTEL_COORDS[h.slug] ?? CITY_CENTRE[h.city] ?? CITY_CENTRE.lisbon;
      const info = await insHostel.run({
        slug: h.slug,
        city: h.city,
        name: h.name,
        area: h.area,
        description: h.description,
        rating: h.rating,
        price_from_cents: h.priceFrom,
        lat: point.lat,
        lng: point.lng,
      });
      hostelIdBySlug.set(h.slug, info.lastInsertRowid);
      hostelIdByName.set(h.name, info.lastInsertRowid);
    }

    /* one hostel that applied through /partner and is waiting on ops */
    const pending = await db
      .prepare(
        `INSERT INTO hostels (slug, city, name, area, description, rating, price_from_cents,
           lat, lng, status, contact_email, applied_at, note, beds)
         VALUES ('casa-do-sol', 'porto', 'Casa do Sol', 'Ribeira', @description, 0, 2200,
           @lat, @lng, 'pending', 'rita@casadosol.pt', datetime('now', '-2 days'), @note, 48)`
      )
      .run({
        description:
          "A converted townhouse two streets back from the river. Twelve beds on the roof terrace in summer, a kitchen everyone fights over, and the owner cooks on Sundays.",
        lat: 41.1406,
        lng: -8.6132,
        note: "We already do a joint pub crawl with Passenger. Happy to bring the others in.",
      });
    hostelIdBySlug.set("casa-do-sol", pending.lastInsertRowid);
    hostelIdByName.set("Casa do Sol", pending.lastInsertRowid);

    /* rooms */
    const insRoom = db.prepare(
      "INSERT INTO rooms (hostel_id, name, kind, beds, price_cents) VALUES (?, ?, ?, ?, ?)"
    );
    for (const h of HOSTELS) {
      const hostelId = hostelIdBySlug.get(h.slug)!;
      for (const room of ROOM_TEMPLATES(h.priceFrom)) {
        await insRoom.run(hostelId, room.name, room.kind, room.beds, room.price_cents);
      }
    }

    /* travellers */
    const insTraveller = db.prepare(
      `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, hostel_id)
       VALUES (@name, @initials, @flag, @colour, @solo, @languages, @email, @password_hash, @role, @hostel_id)`
    );

    for (const t of TRAVELLERS) {
      await insTraveller.run({
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
    const seeded = await db.prepare("SELECT id, name FROM travellers").all<{ id: number; name: string }>();
    for (const row of seeded) travellerIdByName.set(row.name, row.id);

    // The demo logins are a demo, not a fixture of the product — see
    // seedDemoAccounts() below, and AWAY_DEMO_ACCOUNTS in docs/deploy.md.
    if (demoAccountsEnabled()) await seedDemoAccounts(db, hostelIdBySlug, travellerIdByName);
    // A deployment gets its first real admin from the environment.
    await bootstrapAdmin(db);

    /* events */
    const insEvent = db.prepare(`
      INSERT INTO events (city, hostel_id, title, description, starts_at, duration_min,
        price_cents, source, category, emoji, cover_from, cover_to, venue, lat, lng, walk_minutes,
        capacity, tags, lens, created_by, origin)
      VALUES (@city, @hostel_id, @title, @description, @starts_at, @duration_min,
        @price_cents, @source, @category, @emoji, @cover_from, @cover_to, @venue, @lat, @lng, @walk_minutes,
        @capacity, @tags, @lens, 'seed', 'seed')
    `);

    const allEvents = [...EVENTS, ...EXTRA_EVENTS, ...EXTRA_PORTO_EVENTS];
    const pool = Array.from({ length: TRAVELLERS.length - 1 }, (_, i) => i + 2);
    const eventIdByTitle = new Map<string, number>();

    for (const [index, e] of allEvents.entries()) {
      const tags = e.priceCents === 0 ? [...new Set([...e.tags, "free"])] : e.tags;
      const hostelSlug = e.hostel
        ? HOSTELS.find((h) => h.slug === e.hostel || h.name === e.hostel)?.slug
        : undefined;
      const hostelPoint = hostelSlug ? HOSTEL_COORDS[hostelSlug] : null;
      const point = hostelPoint ?? coordsForVenue(e.venue, e.city, hostelPoint);
      const info = await insEvent.run({
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
        lat: point.lat,
        lng: point.lng,
        walk_minutes: e.walkMinutes,
        capacity: e.capacity ?? null,
        tags: JSON.stringify(tags),
        lens: JSON.stringify(e.lens),
      });

      const eventId = info.lastInsertRowid;
      eventIdByTitle.set(e.title, eventId);

      const wanted = Math.min(e.seated, e.capacity ?? e.seated, pool.length);
      await db.batch(
        pick(pool, wanted, index * 7919 + 13).map((travellerId) => ({
          sql: "INSERT OR IGNORE INTO joins (event_id, traveller_id) VALUES (?, ?)",
          params: [eventId, travellerId],
        }))
      );
    }

    /* trips for the demo traveller */
    const insTrip = db.prepare(`
      INSERT INTO trips (traveller_id, city, starts_on, ends_on, hostel_id, arrival_time, departure_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const martaId = travellerIdByName.get("Marta K.") ?? 1;
    await insTrip.run(martaId, "lisbon", addDays(today, -2), addDays(today, 10),
      hostelIdBySlug.get("home-lisbon") ?? null, "15:00", "10:30");
    await insTrip.run(martaId, "porto", addDays(today, 12), addDays(today, 15),
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
      await insMessage.run(eventId, authorId, m.body, `-${m.minutesAgo} minutes`);
    }

    /* one past booking so the account page isn't empty */
    const hostelId = hostelIdBySlug.get("home-lisbon")!;
    const room = await db
      .prepare("SELECT id, price_cents FROM rooms WHERE hostel_id = ? ORDER BY price_cents LIMIT 1")
      .get<{ id: number; price_cents: number }>(hostelId);
    if (room) {
      const nights = 3;
      const total = room.price_cents * nights;
      const info = await db
        .prepare(
          `INSERT INTO bookings (code, traveller_id, hostel_id, room_id, check_in, check_out,
            guests, nights, total_cents, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'confirmed', datetime('now', '-2 days'))`
        )
        .run("AWY-7K2M9Q", martaId, hostelId, room.id,
          addDays(today, -2), addDays(today, 1), nights, total);

      await db.prepare(
        `INSERT INTO payments (booking_id, provider, reference, idempotency_key, amount_cents, status,
           created_at, expires_at, paid_at)
         VALUES (?, 'sandbox', ?, ?, ?, 'paid', datetime('now', '-2 days'),
           datetime('now', '-1 day'), datetime('now', '-2 days'))`
      ).run(
        info.lastInsertRowid,
        `pay_${info.lastInsertRowid}_seed`,
        `seed-booking-${info.lastInsertRowid}`,
        total
      );
    }

    /* reception QR traffic: what a partner's dashboard is looking at */
    const insArrival = db.prepare(
      `INSERT OR IGNORE INTO arrivals (hostel_id, visitor, day, traveller_id, joined_at, booked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const arrivalsHostel = hostelIdBySlug.get("home-lisbon")!;
    const travellerIds = (await db
      .prepare("SELECT id FROM travellers ORDER BY id")
      .all<{ id: number }>())
      .map((r) => r.id);
    const stamp = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 86_400_000).toISOString();

    // 46 scans over a fortnight, 18 of which turn into a signed-in traveller,
    // 11 of those join something, and 4 go on to book. Deliberately lumpy: real
    // reception traffic is not a straight line.
    for (let i = 0; i < 46; i += 1) {
      const day = addDays(today, -(i % 14));
      const linked = i < 18 ? travellerIds[i % travellerIds.length] : null;
      const joined = linked && i < 11 ? stamp(i % 6) : null;
      // Only one stamped booking, because only one real booking row exists —
      // a funnel that overcounts is a funnel a hostel stops trusting.
      const booked = i === 0 ? stamp(2) : null;
      await insArrival.run(arrivalsHostel, `seed-visitor-${i}`, day, linked, joined, booked);
    }
    // The demo traveller's own booking, so the funnel and the revenue agree.
    await db.prepare(
      `UPDATE arrivals SET traveller_id = ?, booked_at = datetime('now', '-2 days')
       WHERE hostel_id = ? AND visitor = 'seed-visitor-0'`
    ).run(martaId, arrivalsHostel);

    /* meta */
    await db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
    await db.prepare("INSERT INTO meta (key, value) VALUES ('seeded_on', ?)").run(today);
  });
}

/**
 * The first real account on a deployment.
 *
 * Approving a hostel application or reading the digest needs the admin role, and
 * no shell is not an excuse for shipping the README's demo password. Set
 * AWAY_BOOTSTRAP_EMAIL and AWAY_BOOTSTRAP_PASSWORD before the first boot and
 * that admin exists. Runs only when the database is created, so it never
 * overwrites a password someone has changed since.
 */
async function bootstrapAdmin(db: Db): Promise<void> {
  const email = process.env.AWAY_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.AWAY_BOOTSTRAP_PASSWORD ?? "";

  if (!email && !password) return;
  if (!email || password.length < 8) {
    console.warn(
      "[seed] AWAY_BOOTSTRAP_EMAIL and AWAY_BOOTSTRAP_PASSWORD (8+ characters) must be set together — no admin was created."
    );
    return;
  }

  const name = process.env.AWAY_BOOTSTRAP_NAME?.trim() || "Ops";
  const hash = hashPassword(password);
  const existing = await db.prepare("SELECT id FROM travellers WHERE email = ?").get<{ id: number }>(email);

  if (existing) {
    await db.prepare(
      "UPDATE travellers SET password_hash = ?, role = 'admin', email_verified_at = datetime('now') WHERE id = ?"
    ).run(hash, existing.id);
  } else {
    await db.prepare(
      `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, email_verified_at)
       VALUES (?, ?, '🌍', '#E7D6FF', 0, 'English', ?, ?, 'admin', datetime('now'))`
    ).run(name, initialsOf(name), email, hash);
  }

  console.log(`[seed] admin ${email} is ready`);
}

/**
 * The four seeded logins (password away1234, one of them an admin). They exist so
 * the login page can offer "jump straight in" on a machine you own; a deployment
 * asks for `AWAY_DEMO_ACCOUNTS=0` (the default once NODE_ENV=production) and
 * bootstraps a real admin from the environment instead.
 */
async function seedDemoAccounts(
  db: Db,
  hostelIdBySlug: Map<string, number>,
  travellerIdByName: Map<string, number>
): Promise<void> {
  const passwordHash = hashPassword("away1234");
  const updateAccount = db.prepare(
    "UPDATE travellers SET email = @email, password_hash = @hash, role = @role, hostel_id = @hostel_id, email_verified_at = datetime('now') WHERE id = @id"
  );
  const insertAccount = db.prepare(
    `INSERT INTO travellers (name, initials, flag, colour, solo, languages, email, password_hash, role, hostel_id, email_verified_at)
     VALUES (@name, @initials, @flag, @colour, 0, @languages, @email, @password_hash, @role, @hostel_id, datetime('now'))`
  );

  for (const account of ACCOUNTS) {
    const hostelId = account.hostelSlug ? hostelIdBySlug.get(account.hostelSlug) ?? null : null;
    if (account.travellerIndex) {
      const row = await db.prepare("SELECT id FROM travellers WHERE name = ?").get<{ id: number }>(account.name);
      if (row) {
        await updateAccount.run({
          id: row.id,
          email: account.email,
          hash: passwordHash,
          role: account.role,
          hostel_id: hostelId,
        });
      }
      continue;
    }
    const info = await insertAccount.run({
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
}

