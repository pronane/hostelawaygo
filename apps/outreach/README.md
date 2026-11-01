# Away outreach

Finds hostels in a city, drafts each one a letter, and **sends nothing until you approve it**.

This is the other half of `/partner`. Self-serve is the door — a hostel can sign itself up in two minutes. But a door nobody knocks on stays shut, and in a new city nobody knows it exists yet. This tool is the knock: twenty letters to twenty hostels, each one read by a person before it goes.

Plain Node (22+, no dependencies, no build step) · `node:sqlite` · server-rendered HTML · its own database.

## Run it

```bash
cd apps/outreach
npm run demo          # Seville, ten hostels, eight drafts
npm start             # http://localhost:3100 — password: outreach (development only)
```

The demo uses reserved `.example` addresses, so you can approve and "send" the whole city and nothing can possibly leave the machine. Every send is recorded as `simulated` and no message file is written.

For a real city:

```bash
npm run discover -- --city "Valencia" --country Spain
npm run enrich   -- --city valencia --limit 8
npm run draft    -- --city valencia
npm start            # read each letter, approve the ones you'd send
npm run send -- --yes
```

## The loop

| Step | What happens | What a human does |
|---|---|---|
| **Find** | OpenStreetMap: every `tourism=hostel` and `tourism=guest_house` inside the city's box | picks the city, reads the list |
| **Verify** | fetch the hostel's own homepage + one contact page, looking for an address they published | nothing — this is the bot's job |
| **Draft** | a short letter, personalised with the city and the address it found | reads it, edits it, or skips |
| **Approve** | moves one letter into the outbox, stamped with your name | **you, every time** |
| **Send** | one request per approved letter, through Resend or your own relay | presses send, after reading |
| **Opt out** | `/u/<token>` suppresses the address and the whole domain, for good | replies are logged by hand |

There is no scheduler, no cron entry point, and no command that drafts and sends in one pass. If nobody approves, nothing happens — that is the design, not an unfinished part.

## What the guards actually are

Enforced in `lib/send.js`, in this order:

1. **Suppressed address or domain** → blocked. An unsubscribe is permanent and outranks everything.
2. **Already a partner** → skipped. It reads the product's database (`apps/web/data/away.db`, read-only) and refuses anyone who has applied or is live — a cold email to your own partner is the worst possible message.
3. **Already written to** → skipped. One letter per hostel, ever. No automatic follow-up.
4. **Another hostel on the same domain** → skipped. One inbox, one conversation.
5. **Reserved address** (`.example`, `localhost`, bare IPs) → recorded as `simulated`. Nothing is transmitted, whatever the transport says.
6. **No postal address, no public URL, or a file transport** → refused. Commercial email needs a real postal address, and an unsubscribe link that only works on localhost is worse than none.
7. **Daily cap** (25 by default) and **working hours** (08:00–18:00 in the operator's timezone) → stopped.

Plus, at approval time: a letter can't be approved without an address and without the page the address came from. The evidence travels with the letter — the review screen shows the exact URL and the sentence around the address — so you can check the bot's work instead of trusting it.

`sending without naming a person throws`. `sendApproved` is only ever called from the outbox button, which requires both a session and a ticked "I've read these" box.

## Where the hostels come from

**OpenStreetMap**, via Overpass, inside the city's bounding box. Free, no key, and every row carries a `source_url` you can open. Nominatim geocodes the city name (one request per second, honest User-Agent). If a city has no coordinates, discovery geocodes it first.

The address is never in OSM. The crawler goes to the hostel's own site:

- homepage, plus at most two contact-ish pages **linked from it**;
- `robots.txt` is fetched and obeyed — a disallowed page is recorded as "disallowed", never requested;
- one request at a time per host, with a delay between them;
- addresses are ranked: `info@`/`reservas@`/`reception@` first, then the site's own domain, then Gmail-style inboxes (small places run on Gmail), then anything left;
- junk is thrown away: image filenames, `sentry@`, `wixpress`, `noreply@`, `your@email.com`.

The evidence kept with each address is the page URL plus the surrounding text. Run `npm test` and you can watch it refuse to read a page its `robots.txt` forbids.

## The letter

```
Subject: Casa Naranja Hostel: what's on tonight, for your guests

Hi Casa Naranja Hostel,

I'm Nuno. I build Away: a page of what's on tonight in Seville, for the
people sleeping in hostels.

Someone at your reception answers "what's on?" a hundred times a week.
Away answers it — your nights first, the city's next, matched to the dates
the guest is actually in town. It's free, and posting one takes about a
minute from your phone at the desk.

We're opening Seville in January — a dozen hostels around the centre, so a
guest arriving on a Tuesday has something to walk to.

Have a look at what it looks like where we've launched: https://away.app/c/lisbon
Or set yourself up, no call needed: https://away.app/partner

If it's not for you, one word back and I'll leave you alone.

Nuno
Away · Away Lda, Rua da Prata 80, 1100-052 Lisboa, Portugal

—
You're getting this once because reservas@casanaranja.example is published on
your website (https://casanaranja.example/contacto). Unsubscribe: https://outreach.away.app/u/4.…
```

Plain text on purpose: it reads like a person wrote it, it can't hide a tracking pixel, and it lands in the inbox rather than the promotions tab. Three subject lines rotate so a city doesn't receive one identical mail.

Nothing in it is invented. It doesn't claim a guest count we don't have, a partnership we haven't signed, or a feature that isn't built. The "opening in January" line is the city's own launch note, editable on the city page — and if the city is already live, the letter says so instead and links to its real page.

## Configure

Everything is optional for the demo, and the last four are required before real mail goes anywhere. `.env.example` has the whole list.

| Variable | Default | Why |
|---|---|---|
| `OUTREACH_PASSWORD` | `outreach` in dev, required in production | the tool refuses to start open in production |
| `OUTREACH_SECRET` | generated once, stored in the database | signs unsubscribe links and the session |
| `OUTREACH_POSTAL_ADDRESS` | — | required in a commercial email; without it real sends are refused |
| `OUTREACH_PUBLIC_URL` | `http://localhost:3100` | your unsubscribe links must work away from your machine |
| `OUTREACH_MAIL_TRANSPORT` | `file` | `file` writes `.eml`, `resend` delivers, `http` posts to your relay |
| `RESEND_API_KEY` | — | with `transport=resend` |
| `AWAY_APP_URL` | `http://localhost:3000` | the product links inside the letter |
| `OUTREACH_DAILY_CAP` | `25` | the ceiling on a good day |
| `OUTREACH_WINDOW_START` / `_END` | `8` / `18` | letters go out in working hours |
| `OUTREACH_TZ` | `Europe/Lisbon` | whose working hours |
| `OUTREACH_HOST_DELAY_MS` | `1200` | politeness to a hostel's server |
| `OUTREACH_MAX_PAGES` | `3` | how much of a site the crawler reads |
| `OUTREACH_RADIUS_M` | `9000` | how far from the centre counts as "in the city" |
| `AWAY_DB_PATH` | `apps/web/data/away.db` | the product's database, read-only, so existing partners are never cold-emailed |

`npm run doctor` prints all of it and says whether a real send would work.

## Commands

| Command | What it does |
|---|---|
| `npm start` | the tool, on `:3100` |
| `npm run demo` | Seville fixture + drafts |
| `npm run discover -- --city "Valencia" --country Spain` | OpenStreetMap |
| `npm run discover -- --city valencia --fixture fixtures/sevilla.json` | same pipeline, from a file |
| `npm run enrich -- --city valencia [--limit 8]` | crawl sites for addresses |
| `npm run draft -- --city valencia` | write the letters |
| `npm run send [-- --limit 5] [-- --dry-run] [-- --yes]` | send what was approved; without `--yes` it only prints |
| `npm run status` | counts, per city |
| `npm run doctor` | the guards, before a real run |
| `npm run reset -- --yes` | delete the database |
| `npm test` | 31 end-to-end checks against fake hostel sites |

## Routes

| Route | What it does |
|---|---|
| `/` | overview: what needs you, the cities, add a city |
| `/cities/[slug]` | the pipeline for one city: find, enrich, draft, per-hostel actions |
| `/review` | one letter at a time, with its evidence, editable, then Approve |
| `/queue` | approved, not sent; the only send button in the tool |
| `/sent` | every message, its status, and the exact words that went |
| `/suppressions` | the do-not-contact list, and a way to add to it by hand |
| `/audit` | append-only: who approved what, what was sent where |
| `/u/[token]` | public unsubscribe — works without a session, confirms before acting |
| `/healthz` | `{ok, cities, queue}` |

## Data

`data/outreach.db`, SQLite, separate from the product's database — outreach is not allowed to write to the thing it is pitching.

`cities` · `prospects` · `drafts` · `sends` · `suppressions` · `audit` · `meta`. Every prospect keeps where it was found (`source`, `source_url`) and where the address came from (`evidence_url`, `evidence_text`). Every send keeps the exact subject and body, so "what did we actually say to them" is answerable a year later.

## The part that isn't code

Twenty letters to twenty hostels in one city is a neighbour introducing themselves. Two hundred is spam, and it burns the city for good — hostels talk to each other, and they all know each other's receptionists.

So: one letter per inbox, no follow-up, an opt-out that works in one click, and a volume that a person could plausibly have written by hand. Under GDPR this is a business contact reached at an address they published for enquiries, on the basis of legitimate interest — which is why the letter says where the address came from and how to make it stop. If your jurisdiction needs something else, write it into the template in `lib/draft.js`; that file is the only place the words live.

Two things this tool deliberately does not do: it does not import a purchased list, and it does not scrape addresses from anywhere other than the hostel's own website.

## Limits

- Discovery is only as good as OpenStreetMap in that city. In Lisbon it's excellent; in smaller places it misses hostels that only exist on Booking.com.
- No automatic follow-up, and no reply tracking — a reply is something you read in your inbox and log with one button on the city page.
- The crawl reads at most three pages and doesn't render JavaScript, so a site whose address only appears in a React app will come back "no address" — correctly, and then it's a human's job.
- No bounce handling: a hard bounce shows up in your provider, not here. Add the address to "Do not contact" and it stays out.
- One operator, one password. That's the scale this is meant for.
- Reading the product's database is a courtesy, not a contract: run the two apps on separate machines and it falls back to "the operator remembers who's already signed". `npm run doctor` tells you which of the two you're in.
