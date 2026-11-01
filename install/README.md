# Install it

One command installs the whole thing on macOS, Linux and Windows — it checks
what is already there, installs only what is missing, builds the database from
the schema in the repo, and then proves it works by driving a real browser
through every feature.

```bash
# macOS / Linux
./install/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File install\install.ps1
```

Both are safe to run twice. The shorthand for "show me what's missing and change
nothing" is `./install/install.sh --check` (or `-Check` on Windows).

## What it checks, and what it installs

| Prerequisite | Needed because | If it's missing |
|---|---|---|
| **Node ≥ 22.5** | the app stores data through `node:sqlite`, Node's built-in driver (22.5+) | macOS: Homebrew → `node@22` · Debian/Ubuntu: apt + NodeSource · Fedora/RHEL: dnf + NodeSource · Arch: pacman · Windows: `winget OpenJS.NodeJS.LTS`, then the official `.msi`, then the official `.zip` into `.runtime\` if there's no admin · anything else: the official Node tarball into `.runtime/`, checksum-verified |
| **npm** | comes with Node | arrives with Node |
| **ca-certificates + curl** | downloads, and the OAuth/TLS calls | apt/dnf install them on the way past |
| **A browser** | only for the end-to-end test | Playwright downloads Chromium (~150 MB, once). If that fails, it falls back to the Chrome/Chromium/Edge already installed (`AWAY_E2E_CHANNEL=chrome|msedge`) |
| **SQLite** | the database | nothing to install — it is inside Node (`node:sqlite`) |

**There is no database server to install.** No Postgres, no MySQL, no daemon to
start, no user to create. The app keeps one file, `apps/web/data/away.db`, and
opens it through Node's own SQLite driver. That is a deliberate choice, not an
omission: a local install that needs a database server is a local install that
fails on somebody's laptop at 11pm. `install.sh` says this out loud when it
runs, so nobody goes looking for a `psql` prompt.

## What "build all tables from the src config" means here

The schema is TypeScript — `apps/web/lib/schema.ts`, currently **v8** — and the
app applies it itself on the first request, then seeds Lisbon, its hostels,
rooms, events and the demo accounts.

So the installer does not re-implement migrations. It boots the built app on a
spare port, asks it for one page, stops it again, and then opens the resulting
file with the same SQLite build the app uses, printing what is actually in it:

```
  database   /…/apps/web/data/away.db
  schema     v8
  tables     19 — arrivals, bookings, cities, … trips
  rows       travellers 27 · cities 4 · hostels 10 · rooms 27 · events 28 …
  accounts   marta@away.app (traveller), ana@homelisbon.pt (hostel_staff), …
```

That is `apps/web/scripts/db-init.mjs`, and it's also `./bin/away db`. If the
table list is empty, the installer fails rather than handing you a broken app.

## What it writes

Two files, and it never overwrites either one:

| File | What's in it |
|---|---|
| `apps/web/.env.local` | `APP_URL`, `DEMO_LOGIN=1`, the OAuth stand-in, and generated `INGEST_TOKEN` / `DIGEST_TOKEN` / `PAYMENT_WEBHOOK_SECRET`. Empty Stripe keys keep payments in the sandbox. |
| `.away/env` | ports, the outreach tool's own password and signing key, and an empty `OUTREACH_POSTAL_ADDRESS` (empty means "write `.eml` files instead of emailing"). |

Delete either one and re-run the installer to get fresh secrets.

## Start it

| | macOS / Linux | Windows |
|---|---|---|
| start | `./bin/away start --open` | `bin\away.cmd start --open` |
| stop | `./bin/away stop` | `bin\away.cmd stop` |
| status | `./bin/away status` | `bin\away.cmd status` |
| logs | `./bin/away logs web -f` | `bin\away.cmd logs web -follow` |
| web app only | `--no-outreach` | `--no-outreach` |
| other ports | `--port 3001 --outreach-port 3101` | `--port 3001 --outreach-port 3101` |
| database | `./bin/away db` · `reset` | `bin\away.cmd db` · `reset` |

Both servers run in the background with pid files in `.away/` and logs in
`.away/logs/`. The web app is at <http://localhost:3000>, the outreach tool at
<http://localhost:3100> (its password is in `.away/env`).

## The end-to-end test

`npm test` inside `e2e/` starts both servers on throwaway databases
(`.away/e2e-*.db`), then drives Chromium through:

| Journey | What a person would see |
|---|---|
| sign in | `/login`, the seeded demo buttons, a session cookie |
| browse | the HERE feed, the first event card |
| join + chat | `Join · n going` → `You're in`, then a message that stays |
| book + pay | hostel page, dates, `Book · €x`, `Pay €x (sandbox)` → `Paid · SBX-…` |
| trips + safety | `/trips`, `/safe` link for a friend, `I'm home safe` |
| post | a hostel's front desk publishes to the feed and it appears on `/` |
| ops | approves a hostel application, previews the digest, opens the ingest console |
| social sign-in | Google stand-in → consent → new account → add a password → sign in with it |
| outreach | open a city, load hostels, draft a letter, approve it, send it, see the `.eml` |

```bash
cd e2e
npm test            # headless
npm run headed      # watch it
npm run smoke       # no browser: just "are both servers up and serving the right pages"
npm run report      # open the HTML report from the last run
```

Ports 3210/3211 are used by default so a dev server on 3000 can stay running;
override with `AWAY_PORT` / `AWAY_OUTREACH_PORT`. If the Chromium download is
blocked, `AWAY_E2E_CHANNEL=msedge` (or `chrome`) uses a browser you already have.

## Options

| `install.sh` | `install.ps1` | Meaning |
|---|---|---|
| `--port N` | `-Port N` | web port recorded for the start script |
| `--outreach-port N` | `-OutreachPort N` | outreach port |
| `--no-e2e` | `-NoE2E` | install everything, don't run the browser test |
| `--no-browser` | `-NoBrowser` | also skip the browser download |
| `--skip-system` | `-SkipSystem` | never touch brew/apt/dnf/pacman/winget |
| `--check` | `-Check` | report only, change nothing |
| `--yes` | `-Yes` | no questions |

Exit codes: `0` installed (or already complete), `1` something failed, `2` the
app is installed but the browser test did not pass.

## When something goes wrong

- **"node 22.5+ is still not available"** — the installer tried the package
  manager and the official tarball. Install Node 22 by hand (`nvm install 22`,
  or nodejs.org), reopen the shell, re-run. Nothing else in the app needs a
  newer Node.
- **Port already in use** — `./bin/away status` shows what this checkout is
  running; if something else owns 3000, `./bin/away start --port 3001`.
- **The browser download is blocked** (proxy, corporate network) — the app is
  installed and runnable; get the test later with `cd e2e && npx playwright
  install chromium`, or use the browser you have: `AWAY_E2E_CHANNEL=chrome`.
- **Payments** — with no `STRIPE_SECRET_KEY` the checkout is the sandbox: no
  network, no card, a `SBX-…` reference. Nothing in the test needs a paid key.
- **Start over** — delete `apps/web/data/away.db` (or `./bin/away reset`) for a
  fresh seed, delete `apps/web/.env.local` and `.away/` for fresh secrets, and
  delete `apps/web/.next` to force a rebuild.

## What has and hasn't been run

- `install.sh` was run end to end on Debian 12 (x86_64) with Node 22.22.3, in
  the check-only, skip-browser and full-dependency forms.
- The browser suite compiles, is discovered by Playwright (8 tests) and its
  browserless prelude (`npm run smoke`, 4 tests) passes against the production
  build. The click-through itself needs a machine that can download Chromium,
  which the environment it was written in could not.
- `install.ps1` and `bin\away.ps1` mirror the shell versions step for step but
  have not been executed on Windows from here.
