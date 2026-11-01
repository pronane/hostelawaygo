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

The database is real, the letters are real, the payments are the sandbox
(`PAID · SBX-…`), and the identity provider is the app's own stand-in
(`OAUTH_MOCK=1`) — the same HTTP round trip as Google, with a different party
answering.
