# Deploy it

Short version: **yes, Render works** — and so does any host that gives you a
Node process and a disk you can write to. Away is one Node server and one SQLite
file; there is no build step to run elsewhere and no database to provision.

The one thing to get right is the file. A deployment that loses `away.db` loses
every account, booking and message, so the choice of host is really a choice
about whether that file survives a restart.

| | Free | Paid |
|---|---|---|
| **Render demo** | `render.demo.yaml` — free instance, no disk. The database is rebuilt from the seed every time the instance restarts, so it is a demo and nothing more. | — |
| **Render proper** | — | `render.yaml` — Starter ($7/mo) + 1 GB disk ($0.25/mo). Data persists. |
| **Fly.io / Railway / VPS** | — | `Dockerfile` in the repo root; mount a volume at `/data`. |
| **Vercel + Turso** | Turso's free tier | The real thing: no disk needed, because the database is in Turso. `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` and nothing else — see [Turso](#turso). |
| **Vercel alone** | ✓ | Runs, with an **ephemeral** database in `/tmp`: it reseeds on every cold start and each instance has its own copy. Good for showing the UI, not for keeping bookings — see [Vercel](#vercel). |
| **Netlify / Cloudflare** | ✗ | No writable disk at all, so the app cannot even start its database. Turso or Postgres first — with Turso that is now two environment variables, not a code change. |

## Render, in full

### 1. The free demo (five minutes, $0)

1. Render dashboard → **New → Blueprint** → pick this repository.
2. Set the **Blueprint path** to `render.demo.yaml`.
3. Deploy. When it's live, copy the URL Render gives you (`https://away-demo-xxxx.onrender.com`).
4. Service → **Environment** → set `APP_URL` to that URL → save (it redeploys).

That instance has demo sign-in on, the OAuth stand-in on, and a database that
regenerates itself. Every button on `/login` signs you straight in, including
`ops@away.app`, which is the admin. Perfect for showing someone; never put a real
person's booking in it.

Free instances sleep after 15 minutes of no traffic and take about a minute to
wake up, so the first visitor after a quiet spell waits. They also have 256 MB of
RAM: enough for this app, not much spare. If it restarts under load, that is the
reason, and the paid blueprint is the fix.

### 2. The real one ($7.25/month)

1. **New → Blueprint** → this repository → Blueprint path `render.yaml`.
2. Before the first deploy completes, set these in **Environment**:
   - `AWAY_BOOTSTRAP_EMAIL` — you, e.g. `you@yourdomain.com`
   - `AWAY_BOOTSTRAP_PASSWORD` — 8+ characters
3. Deploy, then set `APP_URL` to the `https://…` URL and save.
4. Sign in at `/login` with the bootstrap credentials. You are the admin: you can
   approve a hostel from `/partner`, open a city, and read the digest.
5. Check it from your own machine:

```bash
node scripts/verify-deploy.mjs https://your-service.onrender.com
```

That runs nine checks — health endpoint, the public pages, the auth guard, one
API that must refuse strangers — and warns you if demo sign-in is still on.

`AWAY_BOOTSTRAP_*` is only read when the database is first created. Changing it
later does nothing; use `npm run admin:create` (see below).

### 3. Afterwards

- **Deploys with a disk briefly stop the service** (Render can't run two
  instances against one disk, so there is no zero-downtime swap). Expect a few
  seconds of 502 per deploy.
- **Backups.** The database is one file plus its WAL. Copy
  `/var/data/away.db` (and, in a quiet moment, `-wal`) somewhere else daily —
  a Render disk is durable, not a backup. `sqlite3 away.db ".backup out.db"` is
  the safe way to take one while the app is running.
- **Scaling.** You can't scale out with a disk; you get one instance. Fine at
  Lisbon scale, and the reason to move to Postgres later is concurrency, not size.

## Turso

Turso is SQLite as a hosted service: same SQL, same schema, same queries, but
reached over HTTP instead of through a file. That is the difference between
"the app runs on Vercel" and "the app works on Vercel", because a serverless
platform has no disk to put a database on.

```bash
turso db create away                       # or click through the dashboard
turso db show away --url                   # libsql://away-….turso.io
turso db tokens create away                # the auth token
```

Then set two environment variables wherever the app runs and restart:

```bash
TURSO_DATABASE_URL=libsql://away-….turso.io
TURSO_AUTH_TOKEN=…
```

What happens on the first request: the app creates the schema and seeds the
demo content **in Turso**. That is a few hundred statements over the network, so
expect a few seconds on that one request — after that every boot finds
`schema_version` already there and skips it. If the first request is killed
half-way (a platform timeout, a closed laptop), nothing is corrupt: the version
row is written last, so the next start drops and reseeds.

`/api/health` then says:

```json
"database": "turso", "storage": "persistent", "storageWhy": "Turso (libSQL)"
```

Rules and consequences:

- **`TURSO_DATABASE_URL` wins over `AWAY_DB_PATH`.** If both are set the app uses
  Turso and says so in the log; a stale `AWAY_DB_PATH` cannot quietly point a
  deployment at a throwaway file.
- **Every query is a network round trip**, which is why the data layer is async
  end to end (`apps/web/lib/sql.ts`). Pages that used to be synchronous are
  `async` now; that is the cost of not having Postgres, paid once.
- **Two implementations, one interface.** `lib/sqlite.ts` (a file) and
  `lib/turso.ts` (HTTP) both satisfy `Db`; `lib/db.ts` picks one and migrates it.
  Local development, Docker and Render are unchanged and still need no account.
- **Transactions are real.** `db.transaction()` opens a server-side transaction
  in Turso, and statements issued inside it are routed there per request
  (`AsyncLocalStorage`), so a booking and its payment still commit together.
- **`node scripts/verify-deploy.mjs https://your-app`** now also reports which
  driver answered.

### Without an account

`npm run test:turso` boots a stand-in that speaks Turso's HTTP protocol
(`scripts/turso-mock.mjs`, executing the SQL with `node:sqlite`), points the app
at it, and checks that the schema and seed land, the pages render, and the data
is still there after a restart. No keys, no network:

```bash
npm run build && npm run test:turso
```

## Vercel

Two ways to run on Vercel, and only one of them keeps data.

### With Turso (do this if you want accounts and bookings)

1. **Project → Settings → General → Root Directory: `apps/web`.** Node comes from
   `apps/web/.node-version` (22.22.3); `node:sqlite` and the Turso client both
   need 22.5+.
2. Create the database in [Turso](#turso) and add `TURSO_DATABASE_URL` +
   `TURSO_AUTH_TOKEN` to the Vercel project's environment variables.
3. Add `APP_URL` = your Vercel URL, and — for a demo — `DEMO_LOGIN=1` and
   `AWAY_DEMO_ACCOUNTS=1` so `/login` can sign anyone in with one click.
   Optionally `OAUTH_MOCK=1` + `OAUTH_MOCK_ALLOW_PROD=1` for the social buttons.
4. **Do not set `AWAY_DB_PATH`.** Turso wins over it anyway, but there is no file
   to point at.
5. Deploy, open `https://…/api/health`, and check
   `"database": "turso"` and `"storage": "persistent"`.

The first request seeds Turso and takes a few seconds. Sessions, bookings and
sign-ups then survive cold starts, and every function instance sees the same
data — the two problems that made the file-backed version a demo.

Still not portable to Vercel: the periodic jobs. `npm run ingest`, `npm run
digest` and the outreach bot are processes, and Vercel has nowhere to run them;
point them at the same `TURSO_*` variables from a laptop or a scheduled Render
job and they work.

### Without Turso (a URL that shows the product, nothing more)

A Vercel function gets a read-only deployment directory and a `/tmp` that
belongs to one instance and disappears with it.

> **Seeing `ENOENT: mkdir '/var/task/apps/web/data'`?** That is a deployment from
> before this was handled. Redeploy from `master`.

So:

- the app writes to `/tmp/away.db` there instead of failing,
- **the feed is reseeded on every cold start**, so the demo content always looks
  current and nothing anyone does survives,
- **two instances are two databases.** Sessions live in the database, so the
  next request may land on an instance that has never heard of your cookie and
  quietly sign you out; a booking made on one instance is invisible to the other.
  It is intermittent, which is the worst shape for a bug — the demo buttons are
  the workaround: they sign you in on whichever instance answers,
- `/api/health` reports `"storage": "ephemeral"`, and
  `node scripts/verify-deploy.mjs https://…` prints a warning.

Set it up with Root Directory `apps/web`, `APP_URL`, `DEMO_LOGIN=1`,
`AWAY_DEMO_ACCOUNTS=1`, and no `AWAY_DB_PATH`. The moment you want a real
hostel, add Turso: same repository, two variables.

## Anywhere else

### Docker (Fly, Railway, a VPS, your own machine)

```bash
docker build -t away .
docker run -p 3000:3000 -v away-data:/data \
  -e APP_URL=http://localhost:3000 \
  -e AWAY_BOOTSTRAP_EMAIL=you@example.com \
  -e AWAY_BOOTSTRAP_PASSWORD=a-long-password \
  away
```

On Fly.io: `fly launch` (say yes to the Dockerfile), `fly volumes create away_data --size 1`,
mount it at `/data` in `fly.toml`, set the same three env vars with `fly secrets set`, deploy.
On Railway: new service from the repo (it finds the `Dockerfile`), add a volume at `/data`,
same env vars. On a VPS: the same `docker run` behind Caddy or nginx for TLS.

Whatever you use, the settings that matter are identical:

| Variable | Value | Why |
|---|---|---|
| `AWAY_DB_PATH` | `/data/away.db` | the volume, not the container |
| `APP_URL` | `https://your.domain` | OAuth redirect URIs, QR codes, emailed links |
| `PORT` | whatever the platform sets | `next start` honours it |

## Turning things on

Nothing below is required. Each one switches on a feature that is otherwise
absent or simulated, and every one of them is a free-tier-friendly signup except
Stripe.

| Feature | Variables | Without them |
|---|---|---|
| Email (confirmations, digest) | `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` | no email is sent; the confirmation link is shown on `/you` |
| Google / Facebook / Apple sign-in | `GOOGLE_CLIENT_ID`+`_SECRET`, `FACEBOOK_APP_ID`+`_SECRET`, `APPLE_CLIENT_ID`+`APPLE_TEAM_ID`+`APPLE_KEY_ID`+`APPLE_PRIVATE_KEY` | those buttons don't exist; email + password still works |
| Real payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | the sandbox marks bookings paid without money moving |
| Live event data | `TICKETMASTER_API_KEY` | the ingest pipeline replays a bundled fixture |
| Hostel outreach bot | runs locally, see [`apps/outreach`](../apps/outreach) | — |

Redirect URIs are `https://your.domain/auth/{google|facebook|apple}/callback`;
Google, Facebook and Apple each need that exact string registered. The rest of
the setup is in [`apps/web/README.md`](../apps/web/README.md#pointing-it-at-the-real-thing).

**Do not deploy the outreach tool.** It crawls the open web and emails strangers;
it belongs on the machine of the person who approves each letter, not on a public
URL. If you must, run it as a private service on Render with `OUTREACH_PASSWORD`
set — never as a public web service.

## Before real people use it

- [ ] `AWAY_BOOTSTRAP_*` set, and you can sign in as that admin
- [ ] `DEMO_LOGIN` unset or `0`, and `AWAY_DEMO_ACCOUNTS` unset or `0`
      (both are off by default in production — this is the double-check)
- [ ] `APP_URL` is the `https://` URL
- [ ] `node scripts/verify-deploy.mjs https://…` passes, with no demo warning
- [ ] Email configured if you want verification and the digest to work
- [ ] A backup of `away.db` you have actually restored once
- [ ] `OUTREACH_POSTAL_ADDRESS` set if the bot will ever send real mail
- [ ] `storage: "persistent"` in `/api/health` — if it says `ephemeral`, this is a demo, not a deployment
- [ ] If you are on Turso: `database: "turso"` in `/api/health`, and a backup you have restored once (`turso db shell away .dump > away.sql`)

## The limit that will bite: schema upgrades

The database is created from `apps/web/lib/schema.ts` and, when `SCHEMA_VERSION`
changes, **the app drops and rebuilds the tables** — demo data, not migrations.
That is deliberate for a prototype and it is the first thing to replace when
there is data worth keeping:

> Every schema bump in a release means the previous database is discarded on the
> next boot.

Until then, the practical rule is: copy `away.db` before deploying an app version
that changes the schema, and expect to re-create accounts afterwards. A real
migration story (or Postgres) is a separate piece of work.

## When something is wrong

| Symptom | Usually |
|---|---|
| `/api/health` returns 503 | the schema didn't match and rebuild failed, or the disk isn't mounted where `AWAY_DB_PATH` points — check the service logs for `[seed]` and SQLite errors |
| Data disappears after every deploy or idle period | no disk attached, or `AWAY_DB_PATH` points inside the container instead of the volume |
| Build fails on Render | Node too old — `.node-version` pins 22.22.3, and `NODE_VERSION` is set in both blueprints |
| First request after a quiet period is slow | free instances sleep; upgrade to Starter |
| `ENOENT: mkdir …/data` at request time | the deployment directory is read-only — that is Vercel. The app falls back to `/tmp`; if you set `AWAY_DB_PATH` yourself, unset it or point it at a real disk |
| `/api/health` says `database: "sqlite"` on Vercel | `TURSO_DATABASE_URL` is missing from the project's environment variables, or was added after the deployment — redeploy, env changes are not always picked up by preview builds |
| `TURSO_DATABASE_URL is "…"` at boot | it is not a `libsql://` or `https://` URL — copy it from `turso db show --url`, not the CLI's local file |
| Turso rejects the connection (`401`) | `TURSO_AUTH_TOKEN` is missing or was rotated: `turso db tokens create <db>` makes a new one |
| First request after pointing at Turso is slow | it is seeding the database over the network — a few seconds, once. If it dies half-way the next request rebuilds |
| `redirect_uri_mismatch` from Google | `APP_URL` doesn't match the URI registered with the provider, character for character |
| Sign-in works but nobody can approve hostels | the bootstrap admin never ran (wrong env at first boot) — `npm run admin:create -- you@example.com` |

## Accounts on a server you can reach

```bash
npm run admin:create -- --list                                   # who has a login
npm run admin:create -- ana@hostel.pt --role hostel_staff --hostel home-lisbon
npm run admin:create -- you@example.com --password a-long-password
```

Set `AWAY_DB_PATH` to the same file the app uses if you run this outside the app
directory (on Render: `/var/data/away.db`, via the service shell).
