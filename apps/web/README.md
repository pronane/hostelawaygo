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

Every demo account uses the password `away1234`.

The login page also shows one-click buttons for them — but only when demo sign-in is enabled (`DEMO_LOGIN=1`, or any `npm run dev` session). One click skips the password, so it is off by default in production: a deployment shouldn't hand out hostel-staff and admin sessions to whoever finds the URL. Set `DEMO_LOGIN=1` when you want the demo experience, and leave it unset when you don't.

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
| `/you` | Account, languages, joined events, email confirmation |
| `/safe` | Share my night: where you're going, back-by time, "I'm home safe" / "running late" |
| `/safe/[token]` | The friend's view — first name, plan, back-by time, live status (out / home safe / overdue). No sign-in, not indexed |
| `/verify?token=…` | Confirms an email address from the link we send |
| `/login`, `/signup` | Real accounts (`?next=` is validated to stay on-site) |
| `/post` | Hostel mode — publish tonight's event in about a minute (staff only) |
| `/hostel-admin` | Portal: upcoming events, arrivals/bookings, reported chat, cancel event (staff only) |
| `/admin/ingest` | Ops console: run the Ticketmaster import, read the run log (admin only) |
| `POST /api/join` | Toggle a join for the signed-in traveller → `{ joined, going }`, `401` when anonymous |
| `POST /api/events` | Create a hostel event — `401` anonymous, `403` non-staff, hostel taken from the session |
| `POST /api/ingest` | Runs the import. Requires `x-ingest-token` or an admin session |
| `GET /api/events/[id]/stream` | SSE feed of new chat messages (`Last-Event-ID` aware) |
| `POST /api/payments/webhook` | Signed provider callbacks: `payment.paid`, `payment.refunded`, `checkout.session.completed` |

## Safety and trust

- **Share my night** (`/safe`, linked from every event page): tell a friend where you're going and when you'll be back. They get a link showing *out*, *home safe at 01:12*, or *overdue by 25 minutes* with advice to call you, then the hostel or 112. "Running late" adds an hour. The friend sees your first name and plan, nothing else.
- **Email confirmation**: new sign-ups get a one-time link (48 h, only a SHA-256 of the token stored); event chats open once it's clicked. Seeded demo accounts are pre-confirmed.
- **Guests-only events**: hostels choose "open to travellers from other hostels" (default) or guests only. Guests-only events — and their chats — are visible to people with a trip or booking at that hostel, its staff and admins. The **Hostel socials** filter shows every hostel's open events in the city.

## What is actually real

- **Auth**: `travellers` + `sessions` tables, scrypt password hashes, httpOnly cookie, `requireUser` / `requireStaff` / `requireAdmin` guards on every gated route and server action.
- **Posting** is scoped to the staff member's own hostel; the client can't choose whose feed it lands in.
- **Joins, chat, bookings and payments are rows**, not UI state: join counts, "who's going", the chat log, per-night availability and the receipt all read from SQLite.
- **Chat is live over SSE.** `/api/events/:id/stream` holds one connection per open chat and pushes new messages as they land (2s server-side lookahead, heartbeats, `Last-Event-ID` resume after a reconnect). No polling from the client, and the page still renders the history server-side for no-JS. Throttled at 8 messages per 10 minutes; hidden messages never reach the stream.
- **Booking** re-checks capacity inside a transaction ("Someone just took the last bed"), prices per night, supports 1–14 nights, and is scoped to the signed-in guest.
- **Payments have a lifecycle, not a toggle**: an idempotency key per booking+amount (double submits collide), a 30-minute hold window, `requires_payment → paid → refunded`, refunds on cancellation, and signed webhooks at `/api/payments/webhook`. With `STRIPE_SECRET_KEY` set the booking page hands off to a Stripe Checkout Session; without it the `sandbox` provider settles in-process. A payment that lands for a booking cancelled in the meantime is captured and refunded in one step, and only a full refund cancels the stay.
- **Ingest** runs the full pipeline (fetch → normalise → upsert → revalidate) and logs every run to `ingest_runs`. Events are keyed on `external_id`, so re-running updates instead of duplicating.
- **Distances are computed**, not stored: every hostel, city and event carries lat/lng, and walking time comes from a haversine from the guest's actual hostel (or the city centre when there's no trip yet).
- **Multi-city**: Lisbon, Porto and Kraków, each with its own feed, hostels and timezone-aware wall-clock times.
- **PWA**: manifest, maskable icons, installable, conservative service worker (network-first for pages; hashed assets cached only).

## Ingest

```bash
npm run ingest                                      # dev build: uses the dev-ingest fallback
INGEST_TOKEN=… npm run ingest                       # production: the token is required
AWAY_BASE_URL=https://… INGEST_TOKEN=… npm run ingest
```

A production build has **no** fallback token — `POST /api/ingest` accepts an `x-ingest-token` matching `INGEST_TOKEN` or an admin session, and nothing else. `npm run ingest` will tell you so (401) if you forget.

Set `TICKETMASTER_API_KEY` to hit the Ticketmaster Discovery API live (free tier: 5,000 calls/day). **With no key, the same pipeline replays a bundled Ticketmaster-shaped fixture** — the normalise/upsert/revalidate path is identical, it just doesn't leave the box. The mode is shown on `/admin/ingest` and stored on every run.

Imported events carry the venue's real coordinates (so walking times are correct), the full price band (`min–max`, currency) rather than just the floor, and the provider's ticket URL.

## Configuration

| Variable | Effect when set | Without it |
|---|---|---|
| `TICKETMASTER_API_KEY` | live Discovery API pulls | bundled fixture replay |
| `STRIPE_SECRET_KEY` | booking page redirects to Stripe Checkout; webhooks confirm | `sandbox` provider settles in-process |
| `PAYMENT_WEBHOOK_SECRET` | HMAC key for `/api/payments/webhook` | `dev-webhook-secret` in development; **every webhook rejected in production** |
| `INGEST_TOKEN` | shared secret for `POST /api/ingest` and `npm run ingest` | `dev-ingest` in development; required in production (admin sessions still work) |
| `RESEND_API_KEY` (+ `MAIL_FROM`, `APP_URL`) | sends email-confirmation links | no email; in development the link is shown on `/you` |
| `DEMO_LOGIN` | `1` enables one-click demo sign-in outside development | on in development only |

Webhooks are signed Stripe-style: `stripe-signature: t=<unix>,v1=<hmac-sha256 of "${t}.${body}">`, five-minute replay window, 400 on a bad or stale signature. Handlers are idempotent, so retries are safe.

## Known limits (and why they're still here)

- **The Stripe path is written but unexercised.** It's implemented against the documented Checkout API, and the webhook translation is tested locally with signed payloads — but with no key and no egress from this sandbox, nobody has run a real card through it. The sandbox provider is what the demo uses.
- **SSE, not WebSockets.** One long-lived request per open chat is fine for a city's worth of hostels; a chat that outgrows a single Node process needs a broker (and a `LISTEN`-style fan-out), which is a different build.
- **Ticket prices come from the provider.** Imported events show the real min–max range and a "Get tickets" link out; there's no ticket-issuing integration, and no re-check that a listing is still on sale.
- **Walking time is straight-line.** Haversine at 4.8 km/h — no river crossings, no hills, no opening hours. Lisbon's hills are not in the model.

## Layout

```
app/            routes: here, next, explore, event, hostel, booking, trips, you,
                login, signup, post, hostel-admin, admin/ingest, api/{join,events,ingest}
app/actions/    server actions: auth, city, chat, booking, staff, ingest
components/     nav, account-block, aside, event-card, join-button, post-form,
                city-picker, chat-live (SSE), share-button, sw-register
lib/            db, schema, seed, seed-data, seed-extra, queries, auth, password,
                payments, ingest, fixtures/, geo, time, format, types, constants
scripts/        reset-db.mjs, ingest.mjs, make-icons.py
public/         sw.js, icons/
```

Everything time-related is **wall-clock in the city's timezone**: an event at 19:30 is 19:30 where it happens, which is what a traveller actually needs. `lib/time.ts` owns that and compares dates as strings, so there's no timezone drift.
