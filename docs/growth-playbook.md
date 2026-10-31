# Away — the growth playbook

Three problems, in the order they have to be solved:

1. **Hostel buy-in** — why a hostel says yes, and what makes it keep posting.
2. **Traveller pull** — why a guest opens Away instead of the hostel's WhatsApp group.
3. **Repeatable city opening** — how Lisbon becomes the eleventh city without inventing a new process each time.

The product is built to make all three measurable rather than aspirational. Where a mechanic exists in the app, this document names the route. Where it doesn't, it says so.

---

## 0. The thesis, in one page

A traveller's hardest decision is not *what* to do. It is *who with*, tonight, within walking distance, when they know nobody. Every existing tool answers the wrong half:

- **Hostelworld / Hostelworld Social Pass** sells the bed and then a separate social layer, city by city, with a single active city per pass.
- **Hostel noticeboards** (physical, and the in-app version launched in 2016) work, but only inside the building they are in.
- **Meetup / Nomadtable** are city-wide and not built around where you are sleeping, so they don't know your walking radius or that you leave on Thursday.
- **Google / Ticketmaster** know the ticketed calendar and nothing about the 19:30 dinner downstairs that is the actual reason people meet.

Away's wedge is the seam between those: **what's on here, and what's on where you're going, anchored to the building you're sleeping in.** HERE and NEXT. The hostel is both the supply and the distribution — it already has the guest, the table and the bar.

That makes the business a two-sided density problem, and density is local. A city with two listings is worse than nothing: the traveller opens it once, sees a dead feed, and never comes back. Which is why the city bar in §3 is enforced in code rather than in a spreadsheet.

---

## 1. Hostel buy-in

### Who to sign, in order

| Priority | Hostel type | Why first |
|---|---|---|
| 1 | Independent, 40–150 beds, runs a nightly social | Owner decides in one meeting; the social already exists, we just list it |
| 2 | Party hostels with a bar | Highest joins per event; the bar is their P&L, so attribution lands |
| 3 | Small design hostels in a cluster | Fill the walking radius around #1 so the feed isn't one logo repeated |
| 4 | Chains (Selina, Generator, …) | Slow legal/procurement; sign after the city is visibly alive |

The ideal first partner has a **person**, not a marketing department: someone at the front desk who is on shift at 19:00 and can post from their phone.

### The pitch (three sentences, then stop)

> "Your guests ask the same question every night: what's on, and who's going. Away answers it for your building and the city around it, with your nights at the top. It's free for you, it takes two minutes a night, and I'll show you next month exactly how many of your guests used it and what they booked."

Then show `/c/lisbon` on a phone. Do not demo the admin. The demo is the guest's view, because that is what the hostel is buying: a better answer at their own reception.

### What they get, and what they never have to do

**Free, from day one**

- A page for their hostel with their nights, availability and booking (`/hostel/[slug]`, `/booking/[code]`).
- Posting from a phone in about a minute (`/post`), including guest-only nights that other hostels' travellers can't see.
- Moderation scoped to their own events — report → hide/dismiss (`/hostel-admin`).
- The partner kit: poster, dorm sticker, check-in lines, printable (`/hostel/[slug]/kit`).
- Their own funnel: scans → joined a night → beds booked → value (`/hostel-admin`, "Where your guests come from").

**Self-serve, not sales-led**

`/partner` is the application: hostel and staff account in one step, signed in immediately, status visible while it waits. Applicants land in the city console, where approving flips them live and gives them a bookable dorm. Two things this deliberately does *not* do: it doesn't create a new city (that's the runbook in §3), and it can't be done from a traveller account — one account, one role.

**Never**

- No channel-manager integration, no PMS, no API key, no contract to start.
- No exclusivity: they can post the same night everywhere else.
- No requirement to answer messages. Chat is between travellers; the hostel shows up when it wants to.

### The number that closes the deal

Attribution is built in, not reported by hand. A QR code at reception points at `/stay/<hostel>`; the arrival is recorded anonymously, and when that browser joins an event or books a bed it is stamped to the account.

The conversation in month two is therefore not "did it work?" but:

> "62 of your guests scanned in. 31 of them joined a night. 9 booked a bed through the app. That's €1,240 of bookings that started at your reception desk."

Two honest caveats, both of which belong in the meeting: the count is per browser (a guest who clears cookies looks new), and it only counts what happened *in the app* — the beer they bought at your bar is not in the number. Under-claim, don't over-claim; a hostel that catches you inflating a metric stops posting.

### The activation checklist (first 7 days)

A signed hostel that never posts is a logo. The console counts them as *signed but not posting*, and the weekly review chases exactly those.

| Day | Action | Owner | Done when |
|---|---|---|---|
| 0 | Post one event *with* them, at the desk, on their phone | Away | It's in `/post` history |
| 0 | Print the reception poster from the kit | Hostel | It's taped up, photo in the thread |
| 1 | Put the dorm-door sticker on two doors | Hostel | Two scans recorded |
| 3 | Second post, written by them | Hostel | They did it without being asked |
| 7 | Send the week's numbers | Away | Opens > 0 and joins > 0 |

If day 7 shows zero scans, the poster isn't up. That is the only failure mode worth chasing at this stage.

### Objections, and the answers that work

| Objection | Answer |
|---|---|
| "We already have a WhatsApp group." | "Keep it. This is for the guest who arrives at 21:40 and isn't in the group yet — that's most of them." |
| "We don't want other hostels' guests at our dinner." | "Then post it as guests-only." (Demo `open_to_all = 0`.) |
| "Who moderates the chat?" | "You do, on your own events only, with a hide button. Nobody else's events land in your queue." |
| "We don't have time." | "It's one post a night, from the phone at the desk, about a minute. I'll do the first week with you." |
| "What do you charge?" | "Nothing. If it works we'll talk about Pro — sponsored placement and a booking fee on beds we bring you — and you'll see the numbers before that conversation." |
| "Can we get the data / API?" | "Not yet. The funnel export is first on the list once three hostels ask for it." |

### Pricing, later, and what stays free

Not now. The order matters: density → proof → money. When it comes:

- **Free forever**: posting, being in the city feed, the kit, the funnel, moderation.
- **Pro (per property, monthly)**: priority placement in the feed filters, featured city slots, the weekly email to arrivals, the funnel export.
- **Commission**: 10–20% on *events* we sell (never on the bed — the bed is the hostel's business and undercutting it is how you lose the account).

### The metric that decides everything

**Events joined per bed-night.** Not signups, not scans. A hostel with 100 bed-nights a week and 30 joins is working; 100 and 2 is a poster that isn't up, or a feed that isn't good enough yet.

---

## 2. Traveller pull

Three loops, in order of how much they cost:

### Loop 1 — Reception (owned, zero marginal cost)

The only distribution channel that is physically inside the customer's moment of need. `GET /stay/<hostel>`:

1. Records an anonymous arrival (hostel + browser + day, nothing else).
2. Remembers the hostel and switches the city cookie.
3. Lands on `/?from=<hostel>` — the feed for *this* city, with a greeting that names the building they just checked into.

That is the whole onboarding: no install, no sign-up, one scan. Sign-up is only required to *join* something, which is the moment they have a reason.

### Loop 2 — Search (compounding, slow)

`/c/[slug]` is the crawlable page: "What's on in Lisbon this week", grouped by day, with hostels, JSON-LD `ItemList` of `Event`, canonical URL, and a sitemap `/sitemap.xml` that lists live cities plus their public events. `/robots.txt` keeps sessions, bookings, admin and share-my-night links out of the index.

Rules that make this work rather than just exist:

- **Only live cities are indexable.** A thin city page is worse than no page (`/c/krakow` is a 404 while Kraków is in `opening`).
- **Guests-only events never enter the sitemap** — they belong to a hostel's own people.
- **The page is useful signed-out.** Every event links into the app, but nothing is hidden behind a login wall.

Search is a 6–12 month loop. It is not the launch plan; it is the reason the launch compounds.

### Loop 1b — The arrivals digest (owned, compounding)

One email per stay, a few days before arrival: what's on while they're there, at walking distance from the bed they booked. `/admin/digest` previews it, sends it and logs it; `npm run digest` makes it a Monday cron.

The rules that make it safe to automate: one send per trip (`digest_sends` is keyed on traveller + city + start date), no email at all when there's nothing on, and only live cities with verified addresses. The preview is the real renderer, so what ops sees is what lands in the inbox.

### Loop 3 — Share (cheap, high intent)

An event page is already a shareable object with a title, a time, a venue and "3 of 8 going arrived alone". The share button uses the native sheet. The share-my-night link (`/safe/[token]`) is the same mechanic pointed at safety: a traveller's friend sees "out until 01:30" without an account. Both are no-signup surfaces, which is what makes them get used.

### What makes a listing convert

The same three facts, every time:

1. **A named thing that happens to a group** — "family dinner", "pub crawl", not "evening social".
2. **A price and a walking time** — "Free · 8 min walk from your hostel". Both are computed (`lib/geo.ts`), not typed.
3. **Honest solo signal** — "4 of 9 going arrived alone". This is the single most persuasive line on the page for the actual user.

If a hostel's post is missing any of the three, the front-desk prompt is to fix it, not to post more.

### What we deliberately don't do (yet)

- **No paid acquisition.** CAC against a €24 dorm bed with 10% commission is not a business.
- **No native app.** PWA, installable, one URL — the QR code is the install.
- **No scraping Instagram or hostel WhatsApp groups.** It's the obvious shortcut and it is exactly how you lose the partner.
- **No generic "things to do in Lisbon" SEO spam.** One honest city page per live city, updated.

### Pull metrics

| Metric | Where | Healthy |
|---|---|---|
| Scan → join | `/hostel-admin`, `/hostel/[slug]/kit` | > 15% |
| Join → book | `/hostel-admin` | > 5% |
| City page → event | server logs | > 35% |
| D7 return (signed-in) | sessions | > 25% |

---

## 3. Repeatable city opening

### The bar (enforced, not advisory)

`lib/cities.ts` scores every city against five gates. `Go live` is refused — by the UI *and* by the server action — until all five pass:

| Gate | Bar | Why this number |
|---|---|---|
| City record | name, country, IANA timezone, centre, one-line intro | "8 min walk" and "19:30" are both wrong without it |
| Partner hostels | **3** | Two is a directory; three makes a cluster you can walk between |
| Hostels posting | **2** | Signed ≠ supply. A hostel that never posts is a logo |
| Events, next 14 days | **7** | A week needs roughly one thing a day, with slack |
| Launch date | a Friday | Forces a decision; a city with no date is a hobby |

That's deliberately low enough to hit and high enough that the first traveller doesn't see a dead feed. Change the numbers in `LAUNCH_BAR` and every city re-scores — that's the point of putting the bar in code.

Until a city clears it, it is invisible: no picker entry, no `/c/…` page, not in the sitemap, not in Explore's cards (it appears as "opening next", which is honest marketing, not a broken link).

### The six-week runbook

The same ladder appears on `/admin/cities/[slug]`, with each step checked against live data.

| Week | Step | Artifact | Exit criteria |
|---|---|---|---|
| 0 | Pick the city, write the record, set the centre | `/admin/cities` → *Add a city* | Record gate passes; city is `opening` |
| 1 | Sign three hostels — walk in, 15 minutes each | Signed accounts with `hostel_id` | 3 partner hostels |
| 2 | Get each partner to post their week, at their desk | `/post` history per hostel | 2 hostels posting |
| 3 | Fill the calendar: run the ingest, add the city's recurring nights (walking tours, market days) | `/admin/ingest` + posts | 7 events in 14 days |
| 4 | Poster and sticker in every partner; check-in lines rehearsed | `/hostel/[slug]/kit` | First scans recorded |
| 5 | Go live on the agreed Friday | `/admin/cities/[slug]` → *Go live* | Status `live`, page in sitemap |

If week 5 arrives and a gate is still open, the console's *Park it* button is the correct move. A parked city costs nothing and keeps the pipeline honest; a half-open city poisons the brand in a market you can only launch once.

### Which city next

Score each candidate out of 10 and require 35+ before week 0:

| Criterion | Weight | Notes |
|---|---|---|
| Backpacker volume (beds, seasonality) | 3 | Enough nightly arrivals to fill a feed |
| Independent hostel density near a walkable centre | 3 | Need three within ~20 minutes of each other |
| Flows from a live city | 2 | Two live cities on one route make NEXT useful — the network effect |
| English-friendly event scene | 1 | Hostel nights are language-agnostic; city events often aren't |
| Cost/time to reach (for the founder) | 1 | Cheapest city you can visit twice in six weeks |

Route clustering beats market size at this stage. Lisbon → Porto already worked because a traveller doing both gets a *better* product than a traveller doing one. Kraków is next as an end-of-route city; Budapest follows it for the same reason (and is parked in the console until someone does the work).

### Cost of a city

- Ops time: 2 days on the ground (three hostel visits, one evening at each), 4 weeks of remote nudging, ~2 hours/week of posting help in weeks 1–2.
- Cash: near zero. No inventory, no ad spend, no content production — the events are the hostels'.
- Software: nothing per city. Everything is rows in `cities`, `hostels`, `events`; the only per-city code is a seed fixture for the demo.

That asymmetry is the whole strategy: **the marginal city is a sales problem, not an engineering one.** Which is exactly why the bar, the runbook and the console exist — so the constraint stays sales.

### The weekly operating cadence (60 minutes, every Monday)

1. Pull the numbers for each `opening` city: which gate is furthest behind, who owns it.
2. Look at every live city's `postingHostels`. Any hostel that dropped to zero gets a message that day.
3. Read the reported-chat queue across all hostels (the only thing that can go badly wrong in public).
4. Check scan → join by hostel. The lowest one gets a poster reprint, not a phone call.
5. Decide one thing to kill. Expansion plans rot by accumulation.

---

## 4. What is still missing

Honest list, in the order it should be built:

- **Partner billing.** Pro plans are described, not implemented.
- **Application triage beyond approve/decline.** No notes, no "come back in March" state, no automated reply — ops just approves or declines in the city console.
- **Digest segmentation.** Every due traveller gets the same shape of email; there's no A/B on subject lines, and no re-send when a trip's calendar fills up after the first send.
- **Attribution at sign-up.** A visitor who signs up from a hostel QR should keep that origin into next month's cohort, not just the arrival row.
- **Event quality scoring.** Nothing currently stops a partner posting a low-effort listing every night; a "did anyone join?" nudge after three quiet posts would.
- **Real Instagram/WhatsApp import.** The shortcut everyone asks for, and the one most likely to break trust. Needs a partner-consented flow, not scraping.
- **Localisation.** The interface is English; Lisbon and Kraków are not.

---

*The product surfaces referenced here: `/c/[slug]`, `/stay/[slug]`, `/hostel/[slug]/kit`, `/hostel-admin`, `/admin/cities`, `/admin/cities/[slug]`, `/admin/ingest`. The bar lives in `lib/cities.ts`; the funnel lives in `arrivals`.*
