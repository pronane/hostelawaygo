# The click-through test

Playwright drives a real Chromium through Away the way a person would: no
shortcuts into the database, no mocked UI, no pre-baked sessions.

```bash
cd e2e
npm install                       # once
npx playwright install chromium   # once (~150 MB)
npm test
```

`npm test` starts **both** servers on throwaway databases — `.away/e2e-away.db`
and `.away/e2e-outreach.db`, wiped before each run — on ports **3210** and
**3211**, so a dev server on 3000 can keep running. Override them with
`AWAY_PORT` / `AWAY_OUTREACH_PORT`.

| Command | What it does |
|---|---|
| `npm test` | everything, headless |
| `npm run headed` | the same, with a visible browser (watch it click) |
| `npm run smoke` | no browser at all: both servers answer, a provider sign-in completes over HTTP |
| `npm run report` | open the HTML report from the last run (`test-results/` holds traces and video on failure) |
| `npm run browsers` | download Chromium |
| `npm run journey` | **no browser at all:** the whole walk-through over HTTP (`tests/30-full-journey.spec.ts` as a script) on a fresh database, then the server stops |

No browser download? Point it at one you already have:

```bash
AWAY_E2E_CHANNEL=chrome npm test     # Google Chrome
AWAY_E2E_CHANNEL=msedge npm test     # Microsoft Edge
```

## What it covers

| File | Journeys |
|---|---|
| `tests/00-smoke.spec.ts` | servers up, feed, login page, a full provider sign-in, the outreach tool behind its password |
| `tests/traveller.spec.ts` | demo sign-in, join an event, chat, find a hostel, book a bed, pay in the sandbox, trips, `/safe` share and "home safe" |
| `tests/hostel-and-ops.spec.ts` | a hostel publishes to the feed; ops approves a hostel application, previews the digest, opens the ingest console |
| `tests/social.spec.ts` | sign in with the provider stand-in, add a password, sign out, sign in with that password |
| `tests/outreach.spec.ts` | open a city, load hostels, draft a letter, approve it, send it, see the `.eml` |
| `tests/30-full-journey.spec.ts` | **everything, in order, as one person then one hostel then one ops account**: landing → signup → join a night → the chat asking for a confirmed email → confirm → chat → **a group link a stranger joins with nothing but a name** → book a bed → pay → the "arriving this week" count → trips → safe-night link a friend can open → apply as a hostel in a city Away has never listed → pending → ops approves → the hostel signs in (and prints its kit in Portuguese and Polish), posts tonight → the reception screen is locked → start Pro → sandbox checkout → screen unlocked (and shows the group coming) → cancel Pro → the city page counts the partner. Plus a paid booking that is cancelled and refunded. |

### No browser? Same journey, over HTTP

Chromium is a 150 MB download and some boxes (CI containers, review sandboxes)
will not give you one. The walk-through does not depend on it:

```bash
npm ci
npm run journey          # builds once, empties .away/e2e-away.db, boots :3210, runs, stops
```

`run-journey.mjs` boots the app with exactly the environment `playwright.config.ts`
uses and `journey.mjs` drives it the way the spec does — real cookies, real forms,
real server actions, one printed line per step and a specific failure when one
step stops working. `JOURNEY_PORT=3300` moves it, `KEEP_SERVER=1` leaves the app
running so you can click around afterwards.

Two things make the app testable at this level, and both are switches you would
never set on a deployment:

- `DEMO_LOGIN=1` shows the seeded demo accounts as one-click buttons, so a test
  does not have to know a password it did not create.
- `VERIFY_DEV_LINK=1` lets the confirm-your-email link be shown on `/you` when no
  mail provider is configured. Without it a brand-new account can never unlock
  chat in a `next start` (production) build, and half the journey is untestable.

The database is real, the letters are real, the payments are the sandbox
(`PAID · SBX-…`), and the identity provider is the app's own stand-in
(`OAUTH_MOCK=1`) — the same HTTP round trip as Google, with a different party
answering.
