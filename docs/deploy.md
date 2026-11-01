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
| **Vercel / Netlify / Cloudflare** | ✗ | They have no writable disk and no long-lived process. Hosting this there means replacing SQLite with Postgres or Turso first — a code change, not a config change. |

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
