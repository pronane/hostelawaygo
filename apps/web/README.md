# Away — what's on, here and next

A city guide for people sleeping in hostels. **HERE** is what's on in the city you're in; **NEXT** is what's on in the city you're going to, matched to your actual dates. Hostels post the nights; travellers join them, talk about them, and book a bed without leaving the app.

Next.js 16 (App Router) · React 19 · TypeScript · SQLite via Node's built-in `node:sqlite` · no CSS framework, no native modules.

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

The database is created and seeded automatically on the first request at `data/away.db`. Seed dates are relative to **today**, so the demo always feels live. After a few days they drift — re-anchor with:

```bash
npm run db:reset     # deletes the DB; it re-seeds on next request
```

## Sign in

Every demo account uses the password `away1234`. The login page also has one-click buttons for them.

| Account | Role | What it unlocks |
|---|---|---|
| `marta@away.app` | traveller | joining, chat, booking |
| `ana@homelisbon.pt` | hostel staff (Home Lisbon Hostel) | `/post`, `/hostel-admin`, chat moderation |
| `ops@away.app` | admin | everything above + `/admin/ingest` |

Signing up for real works too: scrypt-hashed password, 30-day httpOnly session cookie.

## Routes

| Route | What it does |
|---|---|
| `/` | HERE — the current city's feed grouped by day, filter chips (`/?f=free`, `/?f=solo`, …), city switcher |
| `/next` | NEXT — the next city's events filtered to your trip window; out-of-window cards are greyed, not hidden |
| `/explore` | Every city, with its hostels and what's on |
| `/event/[id]` | Event detail: traveller lens, who's going, join, share, **persisted chat** with report links |
| `/hostel/[slug]` | Hostel page, per-night availability for a date range, booking form |
| `/booking/[code]` | Receipt, sandbox payment, cancellation |
| `/trips` | Your bookings, grouped by city |
| `/you` | Account, languages, joined events |
| `/login`, `/signup` | Real accounts (`?next=` is validated to stay on-site) |
| `/post` | Hostel mode — publish tonight's event in about a minute (staff only) |
| `/hostel-admin` | Portal: upcoming events, arrivals/bookings, reported chat, cancel event (staff only) |
| `/admin/ingest` | Ops console: run the Ticketmaster import, read the run log (admin only) |
| `POST /api/join` | Toggle a join for the signed-in traveller → `{ joined, going }`, `401` when anonymous |
| `POST /api/events` | Create a hostel event — `401` anonymous, `403` non-staff, hostel taken from the session |
| `POST /api/ingest` | Runs the import. Requires `x-ingest-token` or an admin session |

## What is actually real

- **Auth**: `travellers` + `sessions` tables, scrypt password hashes, httpOnly cookie, `requireUser` / `requireStaff` / `requireAdmin` guards on every gated route and server action.
- **Posting** is scoped to the staff member's own hostel; the client can't choose whose feed it lands in.
- **Joins, chat, bookings and payments are rows**, not UI state: join counts, "who's going", the chat log, per-night availability and the receipt all read from SQLite.
- **Chat** persists, throttles (8 messages per traveller per 10 minutes, then `?chat=slow`), and has a real moderation loop: any traveller can report a message; staff hide or dismiss it from the portal.
- **Booking** re-checks capacity inside a transaction ("Someone just took the last bed"), prices per night, supports 1–14 nights, and is scoped to the signed-in guest.
- **Payments** are a `payments` row with `provider = 'sandbox'` moving `requires_payment → paid`; cancelling a booking keeps the row and its status, so the receipt is still truthful.
- **Ingest** runs the full pipeline (fetch → normalise → upsert → revalidate) and logs every run to `ingest_runs`. Events are keyed on `external_id`, so re-running updates instead of duplicating.
- **Multi-city**: Lisbon, Porto and Kraków, each with its own feed, hostels and timezone-aware wall-clock times.
- **PWA**: manifest, maskable icons, installable, conservative service worker (network-first for pages; hashed assets cached only).

## Ingest

```bash
npm run ingest                         # POSTs to /api/ingest on localhost:3000
AWAY_BASE_URL=https://… INGEST_TOKEN=… npm run ingest
```

Set `TICKETMASTER_API_KEY` to hit the Ticketmaster Discovery API live (free tier: 5,000 calls/day). **With no key, the same pipeline replays a bundled Ticketmaster-shaped fixture** — the normalise/upsert/revalidate path is identical, it just doesn't leave the box. The mode is shown on `/admin/ingest` and stored on every run.

## What is deliberately stubbed

- **Payments are sandboxed.** The `payments` row has the shape a Stripe/PayPal webhook would write; no card data, no PSP.
- **Chat refresh is a 20s poll** of `router.refresh()`, not sockets. Fine at demo scale, wrong at 10k concurrent.
- **Distances** (`walk_minutes`) are stored per event rather than computed from coordinates.
- **Ticket prices** on imported events come from Ticketmaster's lowest `priceRange`; there's no ticket-issuing integration, so "get tickets" links out.

## Layout

```
app/            routes: here, next, explore, event, hostel, booking, trips, you,
                login, signup, post, hostel-admin, admin/ingest, api/{join,events,ingest}
app/actions/    server actions: auth, city, chat, booking, staff, ingest
components/     nav, account-block, aside, event-card, join-button, post-form,
                city-picker, chat-refresh, share-button, sw-register
lib/            db, schema, seed, seed-data, seed-extra, queries, auth, password,
                ingest, fixtures/, time, format, types, constants
scripts/        reset-db.mjs, ingest.mjs, make-icons.py
public/         sw.js, icons/
```

Everything time-related is **wall-clock in the city's timezone**: an event at 19:30 is 19:30 where it happens, which is what a traveller actually needs. `lib/time.ts` owns that and compares dates as strings, so there's no timezone drift.
