# Away — working vertical slice

The traveller-facing half of the concept: **HERE** (what's on in the city you're in) and **NEXT** (what's on in the city you're going to, matched to your dates), plus the hostel posting flow that supplies the feed.

Next.js 16 (App Router) · React 19 · TypeScript · SQLite (better-sqlite3) · no CSS framework.

## Run it

```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build && npm run start
```

The database is created and seeded automatically on the first request at `data/away.db`. Dates are seeded relative to **today**, so the demo always feels live. After a few days the seed dates drift — re-anchor them with:

```bash
npm run db:reset     # deletes the DB; it re-seeds on next request
```

## Routes

| Route | What it does |
|---|---|
| `/` | HERE — Lisbon feed grouped by day, filter chips (`/?f=free`, `/?f=solo`, …) |
| `/next` | NEXT — Porto events filtered to the trip window; out-of-window items are greyed, not hidden |
| `/event/[id]` | Event detail: the traveller lens, description, who's going, join toggle, directions, share |
| `/post` | Hostel mode — publish tonight's event in about a minute; it appears in the feed immediately |
| `POST /api/join` | Toggles a join for the demo traveller, returns `{ joined, going }` |
| `POST /api/events` | Creates a hostel event (validated) and revalidates the feed |

## What is actually real

- **SQLite** with `cities`, `hostels`, `travellers`, `events`, `trips`, `joins`. Foreign keys on, WAL mode.
- **Join counts and "who's going"** come from the `joins` table — tapping Join writes a row and the number changes everywhere.
- **The trip window** is data (`trips`), not hardcoded: arrival and departure times decide whether a card is "in your window" or "after you leave".
- **Posting** writes a real event, which is then served in the HERE feed and on its own page.
- **Filters** are server-rendered links, so every view is shareable and there is no client state to get out of sync.
- **PWA**: manifest, maskable icons, installable, plus a deliberately conservative service worker (network-first for pages; hashed assets cached only).

## What is deliberately stubbed

- **One demo traveller** (`DEMO_USER_ID = 1`, Marta). No auth yet — `lib/constants.ts` is the single place to swap in real session/magic-link auth.
- **Seed data**, not live ingest. Ticketmaster/venue adapters and the hostel self-serve portal are the next build.
- **No chat, no payments, no booking** — link out instead. Moderation cost is real and shouldn't be in a slice.
- **Distances** (`walk_minutes`) are stored per event rather than computed from coordinates.

## Layout

```
app/            routes: here, next, event/[id], post, api/{join,events}, manifest
components/     event-card, join-button, post-form, share-button, nav, aside, sw-register
lib/            db (schema + seed), seed-data, queries, time, format, types, constants
scripts/        reset-db.mjs, make-icons.py
public/         sw.js, icons/
```

Everything time-related is **wall-clock in the city's timezone** (`Europe/Lisbon`): an event at 19:30 is 19:30 where it happens, which is what a traveller actually needs. `lib/time.ts` owns that, and compares dates as strings so there is no timezone drift.
