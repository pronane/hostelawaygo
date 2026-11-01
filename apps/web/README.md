# Away — what's on, here and next

A city guide for people sleeping in hostels. **HERE** is what's on in the city you're in; **NEXT** is what's on in the city you're going to, matched to your actual dates. Hostels post the nights; travellers join them, talk about them, and book a bed without leaving the app.

Next.js 16 (App Router) · React 19 · TypeScript · SQLite via Node's built-in `node:sqlite` · no CSS framework, no native modules.

## Run it

The one-command path — installs Node if it's missing, builds the database, and
finishes by driving a real browser through the whole app:

```bash
./install/install.sh          # macOS / Linux
./bin/away start --open       # afterwards, to run it
```

By hand:

```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000

# Social sign-in works out of the box with a local stand-in for the providers:
OAUTH_MOCK=1 npm run dev
```

Production:

```bash
npm run build && npm run start
```

Putting it on the internet — Render, Fly, Railway, a VPS, and the one setting
that decides whether your data survives: **[docs/deploy.md](../../docs/deploy.md)**.
On Vercel (Root Directory `apps/web`) it runs with an ephemeral `/tmp` database:
pages work, nothing persists, and `/api/health` says `storage: "ephemeral"`.

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
| `rita@casadosol.pt` | hostel staff, **pending** | an application waiting on ops — every staff surface sends her to `/partner` |
| `ops@away.app` | admin | everything above + `/admin/cities`, `/admin/digest`, `/admin/ingest` |

Signing up for real works too: scrypt-hashed password, 30-day httpOnly session cookie.

**Or with Google, Facebook or Apple.** `/login` and `/signup` carry the three buttons (drawn only for providers that are configured). An account created that way has no password — `/you` offers to add one, so losing the provider doesn't lose the account.

`OAUTH_MOCK=1 npm run dev` points all three at an in-app stand-in provider, so the whole flow — state, PKCE, a signed RS256 `id_token` verified against a JWKS, the callback, the session — can be walked without a developer console. The mock is refused in production and never substitutes for real keys.

### What the accounts do

| Situation | Result |
|---|---|
| Provider subject seen before | that account, signed in |
| Provider's verified email matches an account | linked to it, and the address is marked verified |
| Provider's email is **unverified** and the account exists | refused — an address you can type into a provider must not open someone else's account |
| Nobody matches | new traveller, verified, no password |
| Facebook returns no email | sent to `/signup` with a sentence explaining why |

One traveller, many doors: `identities` rows are `(provider, subject)` — the provider's own user id, which survives an email change there. Login is OAuth 2.0 authorization code with PKCE, `state` (single-use, ten minutes, stored server-side) and, for the OIDC providers, a `nonce` checked against the `id_token`. Apple's client secret is an ES256 JWT signed with the `.p8` key, minted per exchange; Apple posts its callback back as a form, which the same handler accepts.

### Pointing it at the real thing

Register these redirect URIs and paste the credentials into the environment:

| Provider | Redirect URI | Scopes | Notes |
|---|---|---|---|
| Google | `${APP_URL}/auth/google/callback` | `openid email profile` | OIDC; `iss` must be `https://accounts.google.com`, `aud` your client id |
| Facebook | `${APP_URL}/auth/facebook/callback` | `email public_profile` | Graph API v21; the address comes from `/me`, and only if the account confirmed one |
| Apple | `${APP_URL}/auth/apple/callback` | `name email` | Services ID + Team ID + Key ID + the `.p8` key; the callback is a `form_post` |

Everything else — state, PKCE, nonce, JWKS lookup, signature check, linking — is the same code path as the mock, which is why `npm run test:oauth` is a real test rather than a smoke test.

## Routes

| Route | What it does |
|---|---|
| `/` | HERE — the current city's feed grouped by day, filter chips (`/?f=free`, `/?f=solo`, …), city switcher |
| `/next` | NEXT — the next city's events filtered to your trip window; out-of-window cards are greyed, not hidden |
| `/explore` | Every **live** city, with its hostels and what's on; cities still in `opening` are named at the bottom as "opening next" |
| `/c/[slug]` | Public city page — "What's on in Lisbon this week", grouped by day, with JSON-LD and a canonical URL. 404s unless the city is live |
| `/stay/[slug]` | What a reception QR points at: records an anonymous arrival, remembers the hostel, drops you on that city's feed |
| `/sitemap.xml`, `/robots.txt` | Live cities and public events in, sessions/bookings/admin/share-my-night out |
| `/event/[id]` | Event detail: traveller lens, who's going, join, share, **persisted chat** with report links |
| `/hostel/[slug]` | Hostel page, per-night availability for a date range, booking form |
| `/hostel/[slug]/kit` | Partner kit (staff/admin): printable poster + dorm sticker with the hostel's QR, check-in lines, the attribution funnel |
| `/partner` | Self-serve hostel application: hostel + staff account in one step, status while it waits, one-click demo login for the pending applicant |
| `/booking/[code]` | Receipt, sandbox payment, cancellation |
| `/trips` | Your bookings, grouped by city |
| `/you` | Account, how you sign in (password + connected providers), languages, joined events, email confirmation |
| `/auth/[provider]`, `/auth/[provider]/callback` | The social sign-in handshake: state + PKCE out, code + `id_token` back, verified, then a session. Not indexed |
| `/auth/mock/[provider]/*` | The local stand-in provider (`OAUTH_MOCK=1`): consent screen, token endpoint, JWKS, userinfo. 404 without the flag |
| `/safe` | Share my night: where you're going, back-by time, "I'm home safe" / "running late" |
| `/safe/[token]` | The friend's view — first name, plan, back-by time, live status (out / home safe / overdue). No sign-in, not indexed |
| `/verify?token=…` | Confirms an email address from the link we send |
| `/login`, `/signup` | Real accounts (`?next=` is validated to stay on-site) |
| `/post` | Hostel mode — publish tonight's event in about a minute (staff only) |
| `/hostel-admin` | Portal: attribution funnel, upcoming events, arrivals/bookings, reported chat, cancel event (staff only) |
| `/admin/cities` | Ops: the city pipeline — readiness per city, and "open a city" (admin only) |
| `/admin/cities/[slug]` | One city's launch bar, the five-week runbook, its partners, the application queue (approve/decline), and the go-live switch (admin only) |
| `/admin/digest` | Arrivals digest: who's due, a real preview of the email, send, and the per-trip log (admin only) |
| `/admin/ingest` | Ops console: run the Ticketmaster import, read the run log (admin only) |
| `POST /api/join` | Toggle a join for the signed-in traveller → `{ joined, going }`, `401` when anonymous |
| `POST /api/events` | Create a hostel event — `401` anonymous, `403` non-staff, hostel taken from the session |
| `POST /api/ingest` | Runs the import. Requires `x-ingest-token` or an admin session |
| `POST /api/digest` | Sends the arrivals digest (`{ dryRun }`). Requires `x-digest-token` or an admin session |
| `GET /api/events/[id]/stream` | SSE feed of new chat messages (`Last-Event-ID` aware) |
| `POST /api/payments/webhook` | Signed provider callbacks: `payment.paid`, `payment.refunded`, `checkout.session.completed` |
| `GET /api/health` | Liveness for a deploy platform: `{ ok, schema, cities, events, payments, demo }`, `503` if the schema doesn't match the build |

## Growth

The three growth problems — hostel buy-in, traveller pull, and opening a new city the same way every time — are written up in [`docs/growth-playbook.md`](../../docs/growth-playbook.md), next to the routes that make each one measurable (`/hostel/[slug]/kit`, `/c/[slug]`, `/admin/cities`).

## Safety and trust

- **Share my night** (`/safe`, linked from every event page): tell a friend where you're going and when you'll be back. They get a link showing *out*, *home safe at 01:12*, or *overdue by 25 minutes* with advice to call you, then the hostel or 112. "Running late" adds an hour. The friend sees your first name and plan, nothing else.
- **Email confirmation**: new sign-ups get a one-time link (48 h, only a SHA-256 of the token stored); event chats open once it's clicked. Seeded demo accounts are pre-confirmed.
- **Guests-only events**: hostels choose "open to travellers from other hostels" (default) or guests only. Guests-only events — and their chats — are visible to people with a trip or booking at that hostel, its staff and admins. The **Hostel socials** filter shows every hostel's open events in the city.

## What is actually real

- **Auth**: `travellers` + `sessions` tables, scrypt password hashes, httpOnly cookie, `requireUser` / `requireStaff` / `requireAdmin` guards on every gated route and server action.
- **Social sign-in** is a real OAuth 2.0 code flow: server-side `state` (single use, 10 minutes), PKCE S256, an OIDC `nonce`, `id_token` signature verification against the provider's JWKS, and `iss`/`aud`/`exp` checks — no `jsonwebtoken` dependency, no bypass for the mock. Accounts are matched on `(provider, subject)`, linked to an existing account only by a **verified** email, and a linked provider can verify an address the app itself never confirmed.
- **Posting** is scoped to the staff member's own hostel; the client can't choose whose feed it lands in.
- **Joins, chat, bookings and payments are rows**, not UI state: join counts, "who's going", the chat log, per-night availability and the receipt all read from SQLite.
- **Chat is live over SSE.** `/api/events/:id/stream` holds one connection per open chat and pushes new messages as they land (2s server-side lookahead, heartbeats, `Last-Event-ID` resume after a reconnect). No polling from the client, and the page still renders the history server-side for no-JS. Throttled at 8 messages per 10 minutes; hidden messages never reach the stream.
- **Booking** re-checks capacity inside a transaction ("Someone just took the last bed"), prices per night, supports 1–14 nights, and is scoped to the signed-in guest.
- **Payments have a lifecycle, not a toggle**: an idempotency key per booking+amount (double submits collide), a 30-minute hold window, `requires_payment → paid → refunded`, refunds on cancellation, and signed webhooks at `/api/payments/webhook`. With `STRIPE_SECRET_KEY` set the booking page hands off to a Stripe Checkout Session; without it the `sandbox` provider settles in-process. A payment that lands for a booking cancelled in the meantime is captured and refunded in one step, and only a full refund cancels the stay.
- **Ingest** runs the full pipeline (fetch → normalise → upsert → revalidate) and logs every run to `ingest_runs`. Events are keyed on `external_id`, so re-running updates instead of duplicating.
- **Distances are computed**, not stored: every hostel, city and event carries lat/lng, and walking time comes from a haversine from the guest's actual hostel (or the city centre when there's no trip yet).
- **Multi-city, gated**: Lisbon and Porto are live; Kraków is `opening` and Budapest `planned`. A city is only visible to travellers once it clears the launch bar in `lib/cities.ts` — three partner hostels, two of them posting, seven events in the next fortnight, a centre and a launch date. `Go live` is refused by the server action, not just greyed out in the UI. Public surfaces (picker, Explore, `/c/[slug]`, sitemap) read `status = 'live'` only, and a stale city cookie can't 404 the feed.
- **Applications are rows too**: a hostel that applies at `/partner` becomes a `hostels` row with `status = 'pending'` plus its own staff account, in one transaction. Nothing about it is public; staff surfaces send it to `/partner` until ops approves. Approval flips it to `active`, gives it a bookable dorm and puts it in Explore — the launch bar only counts `active` partners, so an application can't inflate a city.
- **The digest is idempotent per trip**: `digest_sends` is keyed on `(traveller, city:start_date)`, so a cron re-run can't email anyone twice, and a trip with nothing on sends nothing at all.
- **Attribution is a table, not a claim**: `/stay/<hostel>` records an anonymous arrival per browser per day; joining an event or booking a bed stamps it. That's the scan → join → book funnel a hostel sees in its own portal, scoped to its own QR.
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
| `APP_URL` | canonical origin for QR codes, sitemap, share links **and OAuth redirect URIs** | `http://localhost:3000` |
| `DIGEST_TOKEN` | shared secret for `POST /api/digest` and `npm run digest` | `dev-digest` in development; required in production (admin sessions still work) |
| `DEMO_LOGIN` | `1` enables one-click demo sign-in outside development | on in development only |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | "Continue with Google" | button hidden |
| `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` | "Continue with Facebook" | button hidden |
| `APPLE_CLIENT_ID` + `APPLE_TEAM_ID` + `APPLE_KEY_ID` + `APPLE_PRIVATE_KEY` | "Continue with Apple" (ES256 client secret, form-post callback) | button hidden |
| `OAUTH_MOCK` | `1` points the three providers at the local stand-in — development only | real providers only |
| `AWAY_DEMO_ACCOUNTS` | `1` seeds the four demo logins (password `away1234`, one is an admin) even in production | on only where demo sign-in is on; **off in production** |
| `AWAY_BOOTSTRAP_EMAIL` + `AWAY_BOOTSTRAP_PASSWORD` | creates that admin when the database is first built — the way a deployment gets its first user | no admin exists; use `npm run admin:create` |
| `AWAY_DB_PATH` | where the SQLite file lives — a mounted volume on a server | `data/away.db`; `/tmp/away.db` on a serverless host, where nothing persists |

Webhooks are signed Stripe-style: `stripe-signature: t=<unix>,v1=<hmac-sha256 of "${t}.${body}">`, five-minute replay window, 400 on a bad or stale signature. Handlers are idempotent, so retries are safe.

## Known limits (and why they're still here)

- **The Stripe path is written but unexercised.** It's implemented against the documented Checkout API, and the webhook translation is tested locally with signed payloads — but with no key and no egress from this sandbox, nobody has run a real card through it. The sandbox provider is what the demo uses.
- **SSE, not WebSockets.** One long-lived request per open chat is fine for a city's worth of hostels; a chat that outgrows a single Node process needs a broker (and a `LISTEN`-style fan-out), which is a different build.
- **Ticket prices come from the provider.** Imported events show the real min–max range and a "Get tickets" link out; there's no ticket-issuing integration, and no re-check that a listing is still on sale.
- **The three providers are verified by the mock, not by Google.** No keys, no egress: the mock signs real RS256 tokens and the app checks them properly, and `npm run test:oauth` covers 22 cases including replay, tampering, PKCE and account takeover. What is untested is the part only the providers can answer — that they accept these redirect URIs and scopes.
- **No disconnect.** An identity can be linked but not unlinked from `/you`; unlinking needs a rule ("not the last door") that isn't written yet.
- **Walking time is straight-line.** Haversine at 4.8 km/h — no river crossings, no hills, no opening hours. Lisbon's hills are not in the model.

## Layout

```
app/            routes: here, next, explore, c/[slug], event, hostel, hostel/[slug]/kit,
                stay/[slug], partner, booking, trips, you, login, signup, post, hostel-admin,
                admin/{cities,digest,ingest}, sitemap, robots, api/{join,events,ingest,digest}
app/actions/    server actions: auth, city, cities (pipeline), partners (approve),
                digest, chat, booking, staff, ingest
components/     nav, account-block, aside, event-card, join-button, post-form,
                city-picker, chat-live (SSE), share-button, sw-register
lib/            db, schema, seed, seed-data, seed-extra, queries, auth, password,
                payments, ingest, fixtures/, geo, time, format, types, constants,
                cities (launch bar), arrivals (QR attribution), digest (weekly email)
scripts/        reset-db.mjs, ingest.mjs, make-icons.py
public/         sw.js, icons/
```

Everything time-related is **wall-clock in the city's timezone**: an event at 19:30 is 19:30 where it happens, which is what a traveller actually needs. `lib/time.ts` owns that and compares dates as strings, so there's no timezone drift.
